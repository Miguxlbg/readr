import { NextResponse } from 'next/server'
import { db } from '@/server/store'
import { getSessionUser } from '@/server/auth'

const CHUNK_BYTES = 512 * 1024
const MAX_BYTES: Record<string, number> = {
  cover: 4 * 1024 * 1024,
  avatar: 4 * 1024 * 1024,
  book: 25 * 1024 * 1024,
}

// Upload de arquivo: bytes ficam em D1 (files/file_chunks). Devolve a URL pública /api/files/<id>.
export async function POST(request: Request) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ ok: false, error: 'Entre na sua conta antes de enviar arquivos.' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const kind = String(form?.get('kind') || '')
  if (!form || !(file instanceof File)) return NextResponse.json({ ok: false, error: 'Arquivo ausente ou inválido.' }, { status: 400 })
  if (!(kind in MAX_BYTES)) return NextResponse.json({ ok: false, error: 'Tipo de arquivo não suportado.' }, { status: 400 })
  if (file.size > MAX_BYTES[kind]) {
    return NextResponse.json({ ok: false, error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: ${MAX_BYTES[kind] / 1024 / 1024} MB.` }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const id = crypto.randomUUID()
  const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES))
  const statements = [
    db().prepare('insert into files (id, kind, owner_id, mime, size, chunk_count, is_public, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, kind, user.id, file.type || 'application/octet-stream', bytes.length, chunkCount, kind === 'book' ? 0 : 1, new Date().toISOString()),
  ]
  for (let index = 0; index < chunkCount; index += 1) {
    statements.push(db().prepare('insert into file_chunks (file_id, chunk_index, data) values (?, ?, ?)')
      .bind(id, index, bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)))
  }
  try {
    await db().batch(statements)
  } catch {
    return NextResponse.json({ ok: false, error: 'Não foi possível salvar o arquivo. Tente novamente.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, url: `/api/files/${id}`, mime: file.type || 'application/octet-stream' })
}
