import { NextResponse } from 'next/server'
import { db, generatePublicId } from '@/server/store'
import { hashClientKey, signSessionToken, respondWithSession } from '@/server/auth'
import { profileOut } from '@/server/store'

const NICKNAME_PATTERN = /^[a-z0-9._-]{3,24}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function unauthorized(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const displayName = String(body.displayName ?? '').trim()
  const nickname = String(body.nickname ?? '').trim().toLowerCase()
  const email = String(body.email ?? '').trim().toLowerCase()
  const salt = String(body.salt ?? '')
  const k = String(body.k ?? '')

  if (displayName.length < 2) return unauthorized('Informe seu nome de exibição (mínimo de 2 letras).')
  if (!NICKNAME_PATTERN.test(nickname)) return unauthorized('Apelido inválido: use 3 a 24 caracteres entre letras, números, ponto, hífen ou sublinhado.')
  if (!EMAIL_PATTERN.test(email)) return unauthorized('Informe um e-mail válido.')
  if (!/^[a-f0-9]{32,64}$/.test(salt)) return unauthorized('Não foi possível iniciar o cadastro. Recarregue a página.')
  if (!/^[a-f0-9]{64}$/.test(k)) return unauthorized('Não foi possível iniciar o cadastro. Recarregue a página.')

  const [emailTaken, nicknameTaken] = await Promise.all([
    db().prepare('select id from profiles where lower(email) = ?').bind(email).first(),
    db().prepare('select id from profiles where lower(nickname) = ?').bind(nickname).first(),
  ])
  if (emailTaken) return unauthorized('Este e-mail já tem uma conta no Readr.', 409)
  if (nicknameTaken) return unauthorized('Esse apelido já está em uso. Escolhe outro.', 409)

  const id = crypto.randomUUID()
  const publicId = await generatePublicId()
  const passwordHash = await hashClientKey(k, salt)
  const createdAt = new Date().toISOString()

  try {
    await db().prepare(`insert into profiles (id, email, password_hash, kdf_salt, display_name, nickname, public_id, avatar_url, bio, created_at)
      values (?, ?, ?, ?, ?, ?, ?, null, null, ?)`)
      .bind(id, email, passwordHash, salt, displayName, nickname, publicId, createdAt).run()
  } catch {
    return unauthorized('A conta já existe ou os dados entraram em conflito. Tente entrar na sua conta.', 409)
  }

  const token = await signSessionToken(id)
  const response = NextResponse.json({ ok: true, profile: profileOut({ id, email, display_name: displayName, nickname, public_id: publicId, created_at: createdAt }) })
  return respondWithSession(response, token)
}
