import { NextResponse } from 'next/server'
import { db, profileOut } from '@/server/store'
import { constantTimeEquals, hashClientKey, signSessionToken, respondWithSession } from '@/server/auth'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const identifier = String(body.identifier ?? '').trim().toLowerCase().replace(/^@/, '')
  const k = String(body.k ?? '')

  if (!identifier) return NextResponse.json({ ok: false, error: 'Informe seu e-mail ou apelido.' }, { status: 400 })
  if (!/^[a-f0-9]{64}$/.test(k)) return NextResponse.json({ ok: false, error: 'Não foi possível entrar. Recarregue a página.' }, { status: 400 })

  const row = await db().prepare('select * from profiles where lower(email) = ? or lower(nickname) = ?')
    .bind(identifier, identifier).first<Record<string, any>>()
  if (!row) return NextResponse.json({ ok: false, error: 'E-mail ou senha incorretos.' }, { status: 401 })

  const hash = await hashClientKey(k, row.kdf_salt)
  if (!constantTimeEquals(hash, String(row.password_hash))) {
    return NextResponse.json({ ok: false, error: 'E-mail ou senha incorretos.' }, { status: 401 })
  }

  const token = await signSessionToken(String(row.id))
  const response = NextResponse.json({ ok: true, profile: profileOut(row) })
  return respondWithSession(response, token)
}
