import { NextResponse } from 'next/server'
import { db } from '@/server/store'
import { getSessionUser } from '@/server/auth'

// Serve um arquivo guardado em D1. Capas e avatares são públicos; arquivos de livro ficam privados do dono.
export async function GET(request: Request, next: { params: Promise<{ id: string }> }) {
  const { id } = await next.params
  if (!id) return new NextResponse(null, { status: 404 })

  const row = await db().prepare('select kind, owner_id, mime, size, is_public from files where id = ?').bind(id).first<Record<string, any>>()
  if (!row) return new NextResponse(null, { status: 404 })

  if (!Number(row.is_public)) {
    const user = await getSessionUser(request)
    if (!user || user.id !== row.owner_id) return new NextResponse(null, { status: 404 })
  }

  const { results } = await db().prepare('select data from file_chunks where file_id = ? order by chunk_index').bind(id).all<{ data: ArrayBuffer }>()
  if (!(results || []).length) return new NextResponse(null, { status: 404 })

  const size = Number(row.size || 0)
  const buffer = new Uint8Array(Math.max(size, results.length * 512 * 1024))
  let offset = 0
  for (const chunk of results) {
    const part = new Uint8Array(chunk.data)
    buffer.set(part, offset)
    offset += part.length
  }
  const headers = new Headers()
  headers.set('Content-Type', String(row.mime || 'application/octet-stream'))
  headers.set('Content-Length', String(buffer.length))
  headers.set('Cache-Control', Number(row.is_public) ? 'public, max-age=31536000, immutable' : 'private, no-store')
  return new Response(buffer.subarray(0, buffer.length), { headers })
}
