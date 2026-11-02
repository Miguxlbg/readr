import { NextResponse } from 'next/server'
import { dispatch } from '@/server/store'
import { sessionCookie, getSessionUser } from '@/server/auth'

export async function DELETE(request: Request) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ ok: false, error: 'Sessão ausente ou inválida.' }, { status: 401 })
  try {
    await dispatch('account_delete', {}, user)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível excluir sua conta.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookie('', 0))
  return response
}
