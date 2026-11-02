import { NextResponse } from 'next/server'
import { db, profileOut } from '@/server/store'
import { getSessionUser } from '@/server/auth'

export async function GET(request: Request) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ profile: null })
  const row = await db().prepare('select * from profiles where id = ?').bind(user.id).first<Record<string, any>>()
  return NextResponse.json({ profile: row ? profileOut(row) : null })
}
