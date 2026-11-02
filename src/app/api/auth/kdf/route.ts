import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { db } from '@/server/store'

// Devolve o salt PBKDF2 do usuário para o navegador derivar a chave de senha.
// Conta inexistente devolve salt "isca" derivada da própria entrada (evita enumeração de contas).

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const identifier = String(body.identifier ?? '').trim().toLowerCase().replace(/^@/, '')
  if (!identifier) return NextResponse.json({ error: 'Informe seu e-mail ou apelido.' }, { status: 400 })

  const row = await db().prepare('select kdf_salt from profiles where lower(email) = ? or lower(nickname) = ?')
    .bind(identifier, identifier).first<{ kdf_salt: string }>()
  if (row) return NextResponse.json({ salt: row.kdf_salt })

  const secret = (getCloudflareContext().env as { JWT_SECRET?: string }).JWT_SECRET || 'readr'
  const salt = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`readr-decoy|${secret}|${identifier}`))).slice(0, 32)
  return NextResponse.json({ salt })
}
