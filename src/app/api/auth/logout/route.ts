import { NextResponse } from 'next/server'
import { sessionCookie } from '@/server/auth'

export async function POST() {
  const response = NextResponse.json({ ok: true, message: 'Logout realizado' })
  // maxAge 0 invalida o cookie de sessão no navegador
  response.cookies.set(sessionCookie('', 0))
  return response
}
