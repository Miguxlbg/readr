import { NextResponse } from 'next/server'
import { getSessionUser } from '@/server/auth'
import { dispatch } from '@/server/store'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { op?: string; args?: Record<string, unknown> }
    const user = await getSessionUser(request)
    const data = await dispatch(String(body.op || ''), body.args ?? {}, user)
    return NextResponse.json({ ok: true, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    const unauthorized = message.includes('Entre na sua conta')
    return NextResponse.json({ ok: false, error: message }, { status: unauthorized ? 401 : 400 })
  }
}
