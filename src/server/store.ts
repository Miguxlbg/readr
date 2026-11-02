// Camada de dados no servidor: todas as operações do Readr sobre o D1.
// Regras de acesso (antiga RLS do Supabase) são impostas aqui, pelo userId da sessão.
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { randomHex } from './auth'
import type { SessionUser } from './auth'

export function db() {
  const env = getCloudflareContext().env as { DB?: D1Database }
  if (!env.DB) throw new Error('Binding D1 "DB" não está disponível.')
  return env.DB
}

const CHUNK_LENGTH = 200_000 // ~800 KB de UTF-8 no pior caso; limite de linha do D1 é 1 MB
const now = () => new Date().toISOString()

function safeParseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function safeParseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function splitIntoChunks(text: string): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += CHUNK_LENGTH) chunks.push(text.slice(i, i + CHUNK_LENGTH))
  return chunks.length ? chunks : ['']
}

async function loadContent(bookId: string): Promise<unknown[]> {
  const { results } = await db().prepare('select data from book_content where book_id = ? order by chunk_index').bind(bookId).all<{ data: string }>()
  const joined = (results || []).map((chunk) => chunk.data).join('')
  if (!joined) return []
  const parsed = JSON.parse(joined)
  return Array.isArray(parsed) ? parsed : []
}

async function saveContent(bookId: string, content: unknown) {
  const text = JSON.stringify(content ?? [])
  const chunks = splitIntoChunks(text)
  const statements = [
    db().prepare('delete from book_content where book_id = ?').bind(bookId),
    ...chunks.map((data, index) => db().prepare('insert into book_content (book_id, chunk_index, data) values (?, ?, ?)').bind(bookId, index, data)),
  ]
  await db().batch(statements)
}

export function fileUuidFromUrl(url?: string | null): string | null {
  if (!url) return null
  const match = /\/api\/files\/([a-f0-9-]{36})/.exec(url)
  return match ? match[1] : null
}

/* -------- mappers (mesma forma que o cliente Supabase devolvia) -------- */

export function profileOut(row: Record<string, any>) {
  return {
    id: row.id,
    display_name: row.display_name || '',
    nickname: row.nickname || undefined,
    public_id: row.public_id || undefined,
    avatar_url: row.avatar_url || null,
    bio: row.bio || undefined,
    created_at: row.created_at || undefined,
  }
}

export function importedBookOut(row: Record<string, any>) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title || '',
    author: row.author || '',
    description: row.description || '',
    cover_url: row.cover_url || null,
    format: row.format,
    file_url: row.file_url || null,
    total_pages: Math.max(1, Number(row.total_pages || 1)),
    source: 'imported',
    genre: row.genre || '',
    language: row.language || 'Português',
    published_year: row.published_year ?? null,
    publisher: row.publisher || '',
    tags: safeParseArray(row.tags),
    reads_count: Number(row.reads_count || 0),
    created_at: row.created_at,
  }
}

export function createdBookOut(row: Record<string, any>, chapters: Record<string, any>[] = []) {
  const sorted = [...chapters].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
  const words = sorted.reduce((sum, chapter) => sum + String(chapter.content || '').trim().split(/\s+/).filter(Boolean).length, 0)
  return {
    ...importedBookOut(row),
    source: 'created',
    format: 'readr',
    status: row.status === 'published' ? 'published' : 'draft',
    total_pages: Math.max(1, Number(row.total_pages || Math.ceil(words / 280))),
    chapters: sorted.map((chapter) => ({
      id: chapter.id,
      created_book_id: chapter.created_book_id,
      title: chapter.title || '',
      content: chapter.content || '',
      order_index: chapter.order_index ?? 0,
    })),
  }
}

export function reviewOut(row: Record<string, any>) {
  return {
    id: row.id,
    user_id: row.user_id,
    book_id: row.book_id,
    book_source: row.book_source,
    rating: Number(row.rating),
    content: row.content || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    profiles: row.display_name != null || row.nickname != null
      ? { display_name: row.display_name || '', nickname: row.nickname || undefined, avatar_url: row.avatar_url || null }
      : undefined,
  }
}

function activityOut(row: Record<string, any>) {
  return { ...row, metadata: safeParseObject(row.metadata) }
}

export async function addAggregates(books: Record<string, any>[]) {
  if (books.length) {
    const ids = books.map((book) => book.id)
    const placeholders = ids.map(() => '?').join(',')
    const [reviews, reactions] = await Promise.all([
      db().prepare(`select book_id, book_source, count(*) as count, avg(rating) as average from reviews where book_id in (${placeholders}) group by book_id, book_source`).bind(...ids).all(),
      db().prepare(`select book_id, book_source, count(*) as count from book_reactions where reaction = 'like' and book_id in (${placeholders}) group by book_id, book_source`).bind(...ids).all(),
    ])
    const ratingMap = new Map<string, { count: number; average: number }>()
    ;(reviews.results as Record<string, any>[]).forEach((row) => ratingMap.set(`${row.book_source}:${row.book_id}`, { count: Number(row.count), average: Number(row.average) }))
    const likesMap = new Map<string, number>()
    ;(reactions.results as Record<string, any>[]).forEach((row) => likesMap.set(`${row.book_source}:${row.book_id}`, Number(row.count)))
    books.forEach((book) => {
      const key = `${book.source}:${book.id}`
      const ratings = ratingMap.get(key)
      book.reviews_count = ratings?.count || 0
      book.average_rating = ratings ? ratings.average : 0
      book.likes_count = likesMap.get(key) || 0
    })
  }
  return books
}

/* ------------------------------ livros importados ------------------------------ */

async function listBooks(where: { userId?: string; excludeUserId?: string; withContent?: boolean; publicOnly?: boolean }, viewerId: string | null) {
  const clauses: string[] = []
  const params: unknown[] = []
  if (where.userId) { clauses.push('user_id = ?'); params.push(where.userId) }
  if (where.excludeUserId) { clauses.push('user_id <> ?'); params.push(where.excludeUserId) }
  const { results } = await db().prepare(`select * from books ${clauses.length ? `where ${clauses.join(' and ')}` : ''} order by created_at desc`).bind(...params).all<Record<string, any>>()
  const rows = (results || []).map((row) => ({ ...importedBookOut(row), content: undefined as any }))
  if (where.withContent) {
    for (const row of rows) {
      const isOwner = row.user_id === viewerId
      row.content = isOwner ? await loadContent(row.id as string) : []
    }
  }
  return rows as Record<string, any>[]
}

export const handlers = {
  'session_get': async (_args: Record<string, any>, user: SessionUser | null) => {
    if (!user) return null
    const row = await db().prepare('select * from profiles where id = ?').bind(user.id).first<Record<string, any>>()
    return row ? profileOut(row) : null
  },

  /* ------------------------------ livros importados ------------------------------ */

  async library_mine(_args: any, user: SessionUser) {
    return listBooks({ userId: user.id, withContent: true }, user.id)
  },

  async library_public(args: any, user: SessionUser | null) {
    const exclude = user?.id
    const rows = await listBooks({ excludeUserId: exclude }, exclude ?? null)
    return addAggregates(rows)
  },

  async book_get(args: any, user: SessionUser | null) {
    const row = await db().prepare('select * from books where id = ?').bind(String(args.bookId)).first<Record<string, any>>()
    if (!row) return null
    const book = importedBookOut(row)
    if (user && user.id === row.user_id) {
      ;(book as any).content = await loadContent(row.id)
    }
    return book
  },

  async book_create(args: any, user: SessionUser) {
    const data = args.book ?? args
    const bookId = crypto.randomUUID()
    await db().prepare(`insert into books (id, user_id, title, author, description, cover_url, format, file_url, total_pages, genre, language, published_year, publisher, tags, reads_count, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
      .bind(
        bookId, user.id, String(data.title || 'Livro sem título'), data.author || null, data.description || null,
        data.cover_url || null, data.format || null, data.file_url || null, Math.max(1, Number(data.total_pages || 1)),
        data.genre || null, data.language || 'Português', data.published_year ?? null, data.publisher || null,
        JSON.stringify(Array.isArray(data.tags) ? data.tags : []), now(),
      ).run()
    await saveContent(bookId, data.content ?? [])
    await db().prepare('insert into activities (id, user_id, activity_type, book_id, book_source, metadata, created_at) values (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), user.id, 'imported_book', bookId, 'imported', JSON.stringify({ title: data.title }), now()).run()
    return bookId
  },

  async book_update(args: any, user: SessionUser) {
    const changes = args.changes ?? {}
    const fields: string[] = []
    const params: unknown[] = []
    const push = (column: string, value: unknown) => { fields.push(`${column} = ?`); params.push(value) }
    if (changes.title != null) push('title', String(changes.title))
    if (changes.author != null) push('author', changes.author)
    if (changes.description != null) push('description', changes.description)
    if (changes.cover_url !== undefined) push('cover_url', changes.cover_url)
    if (changes.genre != null) push('genre', changes.genre)
    if (changes.language != null) push('language', changes.language)
    if (changes.published_year !== undefined) push('published_year', changes.published_year)
    if (changes.publisher != null) push('publisher', changes.publisher)
    if (changes.tags != null) push('tags', JSON.stringify(changes.tags))
    if (!fields.length) return
    params.push(args.bookId, user.id)
    const result = await db().prepare(`update books set ${fields.join(', ')} where id = ? and user_id = ?`).bind(...params).run()
    if (!result.meta.changes) throw new Error('Livro não encontrado para este usuário.')
  },

  async book_delete(args: any, user: SessionUser) {
    const row = await db().prepare('select file_url from books where id = ? and user_id = ?').bind(args.bookId, user.id).first<Record<string, any>>()
    if (!row) throw new Error('Livro não encontrado para este usuário.')
    const statements = [
      db().prepare('delete from book_content where book_id = ?').bind(args.bookId),
      db().prepare('delete from books where id = ? and user_id = ?').bind(args.bookId, user.id),
    ]
    const fileId = fileUuidFromUrl(row.file_url)
    if (fileId) {
      statements.push(db().prepare('delete from file_chunks where file_id = ?').bind(fileId))
      statements.push(db().prepare('delete from files where id = ? and kind = ?').bind(fileId, 'book'))
    }
    await db().batch(statements)
  },

  /* ------------------------------ livros autorais ------------------------------ */

  async created_list_mine(_args: any, user: SessionUser) {
    const [books, { results: chapters }] = await Promise.all([
      db().prepare('select * from created_books where user_id = ? order by created_at desc').bind(user.id).all<Record<string, any>>(),
      db().prepare('select * from chapters where created_book_id in (select id from created_books where user_id = ?) order by order_index').bind(user.id).all<Record<string, any>>(),
    ])
    return (books.results || []).map((row) => createdBookOut(row, (chapters || []).filter((chapter) => chapter.created_book_id === row.id)))
  },

  async created_list_community(args: any, user: SessionUser | null) {
    const params: unknown[] = []
    let sql = "select * from created_books where status = 'published'"
    if (user?.id) { sql += ' and user_id <> ?'; params.push(user.id) }
    sql += ' order by created_at desc'
    const { results } = await db().prepare(sql).bind(...params).all<Record<string, any>>()
    const rows = (results || []).map((row) => createdBookOut(row))
    return addAggregates(rows as Record<string, any>[])
  },

  async created_book_get(args: any, user: SessionUser | null) {
    const row = await db().prepare('select * from created_books where id = ?').bind(String(args.bookId)).first<Record<string, any>>()
    if (!row) return null
    if (row.status !== 'published' && row.user_id !== user?.id) return null
    const { results: chapters } = await db().prepare('select * from chapters where created_book_id = ? order by order_index').bind(row.id).all<Record<string, any>>()
    return createdBookOut(row, (chapters || []) as Record<string, any>[])
  },

  async created_create(args: any, user: SessionUser) {
    const { chapters = [], ...metadata } = args
    const bookId = crypto.randomUUID()
    const statements = [
      db().prepare(`insert into created_books (id, user_id, title, author, description, cover_url, status, genre, language, published_year, publisher, tags, reads_count, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
        .bind(bookId, user.id, String(metadata.title || 'Livro sem título'), metadata.author || null, metadata.description || null,
          metadata.cover_url || null, metadata.status === 'published' ? 'published' : 'draft', metadata.genre || null, metadata.language || 'Português',
          metadata.published_year ?? null, metadata.publisher || null, JSON.stringify(Array.isArray(metadata.tags) ? metadata.tags : []), now()),
      ...chapters.map((chapter: Record<string, any>, index: number) =>
        db().prepare('insert into chapters (id, created_book_id, title, content, order_index) values (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), bookId, chapter.title || '', chapter.content || '', index)),
      db().prepare('insert into activities (id, user_id, activity_type, book_id, book_source, metadata, created_at) values (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), user.id, metadata.status === 'published' ? 'published_book' : 'created_book', bookId, 'created', JSON.stringify({ title: metadata.title }), now()),
    ]
    await db().batch(statements)
    return bookId
  },

  async created_update(args: any, user: SessionUser) {
    const { chapters = [], ...metadata } = args
    const owned = await db().prepare('select id from created_books where id = ? and user_id = ?').bind(args.bookId, user.id).first()
    if (!owned) throw new Error('Somente o proprietário pode editar este livro.')
    const updates = [
      db().prepare(`update created_books set title = ?, author = ?, description = ?, cover_url = ?, status = ?, genre = ?, language = ?, published_year = ?, publisher = ?, tags = ? where id = ? and user_id = ?`)
        .bind(
          String(metadata.title || 'Livro sem título'), metadata.author || null, metadata.description || null, metadata.cover_url || null,
          metadata.status === 'published' ? 'published' : 'draft', metadata.genre || null, metadata.language || 'Português',
          metadata.published_year ?? null, metadata.publisher || null, JSON.stringify(Array.isArray(metadata.tags) ? metadata.tags : []),
          args.bookId, user.id,
        ),
      db().prepare('delete from chapters where created_book_id = ?').bind(args.bookId),
      ...chapters.map((chapter: Record<string, any>, index: number) =>
        db().prepare('insert into chapters (id, created_book_id, title, content, order_index) values (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), args.bookId, chapter.title || '', chapter.content || '', index)),
    ]
    await db().batch(updates)
  },

  async read_register(args: any, user: SessionUser) {
    const source = args.bookSource === 'created' ? 'created' : 'imported'
    const table = source === 'imported' ? 'books' : 'created_books'
    const owner = source === 'imported'
      ? await db().prepare(`select user_id from ${table} where id = ?`).bind(args.bookId).first<Record<string, any>>()
      : await db().prepare(`select user_id from created_books where id = ? and status = 'published'`).bind(args.bookId).first<Record<string, any>>()
    if (!owner || owner.user_id === user.id) return false
    const insert = await db().prepare('insert or ignore into book_reads (user_id, book_id, book_source, read_at) values (?, ?, ?, ?)')
      .bind(user.id, args.bookId, source, now()).run()
    if (insert.meta.changes > 0) {
      await db().prepare(`update ${table} set reads_count = reads_count + 1 where id = ?`).bind(args.bookId).run()
    }
    return true
  },

  /* ------------------------------ social ------------------------------ */

  async social_get(args: any, _user: SessionUser | null) {
    const [reactions, reviews] = await Promise.all([
      db().prepare('select reaction, count(*) as count from book_reactions where book_id = ? and book_source = ? group by reaction')
        .bind(args.bookId, args.bookSource).all<Record<string, any>>(),
      db().prepare(`select r.*, p.display_name, p.nickname, p.avatar_url from reviews r join profiles p on p.id = r.user_id
        where r.book_id = ? and r.book_source = ? order by r.created_at desc`)
        .bind(args.bookId, args.bookSource).all<Record<string, any>>(),
    ])
    const typed = (reviews.results || []).map(reviewOut)
    let likes = 0
    let dislikes = 0
    ;(reactions.results || []).forEach((row) => {
      if (row.reaction === 'like') likes = Number(row.count)
      if (row.reaction === 'dislike') dislikes = Number(row.count)
    })
    return {
      likes,
      dislikes,
      reviews: typed,
      averageRating: typed.length ? typed.reduce((sum, item) => sum + item.rating, 0) / typed.length : 0,
    }
  },

  async reaction_set(args: any, user: SessionUser) {
    await db().prepare(`insert into book_reactions (user_id, book_id, book_source, reaction, created_at) values (?, ?, ?, ?, ?)
      on conflict (user_id, book_id, book_source) do update set reaction = excluded.reaction`)
      .bind(user.id, args.bookId, args.bookSource, args.reaction === 'dislike' ? 'dislike' : 'like', now()).run()
    return true
  },

  async reaction_remove(args: any, user: SessionUser) {
    await db().prepare('delete from book_reactions where user_id = ? and book_id = ? and book_source = ?')
      .bind(user.id, args.bookId, args.bookSource).run()
    return true
  },

  async review_save(args: any, user: SessionUser) {
    const rating = Math.min(5, Math.max(1, Math.round(Number(args.rating) || 0)))
    if (rating < 1) throw new Error('Avaliação precisa ir de 1 a 5 estrelas.')
    await db().prepare(`insert into reviews (id, user_id, book_id, book_source, rating, content, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (user_id, book_id, book_source) do update set rating = excluded.rating, content = excluded.content, updated_at = excluded.updated_at`)
      .bind(crypto.randomUUID(), user.id, args.bookId, args.bookSource, rating, String(args.content || ''), now(), now()).run()
    return true
  },

  async follow_toggle(args: any, user: SessionUser) {
    if (args.profileId === user.id) throw new Error('Você não pode seguir você mesmo.')
    if (args.following) {
      await db().prepare('delete from follows where follower_id = ? and following_id = ?').bind(user.id, args.profileId).run()
      return false
    }
    const { results } = await db().prepare('select id from profiles where id = ?').bind(args.profileId).all()
    if (!(results || []).length) throw new Error('Perfil não encontrado.')
    await db().prepare('insert or ignore into follows (follower_id, following_id, created_at) values (?, ?, ?)')
      .bind(user.id, args.profileId, now()).run()
    return true
  },

  async follow_get(args: any, user: SessionUser | null) {
    const [followers, following, relation] = await Promise.all([
      db().prepare('select count(*) as count from follows where following_id = ?').bind(args.profileId).first<Record<string, any>>(),
      db().prepare('select count(*) as count from follows where follower_id = ?').bind(args.profileId).first<Record<string, any>>(),
      user
        ? db().prepare('select 1 as present from follows where follower_id = ? and following_id = ?').bind(user.id, args.profileId).first()
        : Promise.resolve(null),
    ])
    return { followers: Number(followers?.count || 0), following: Number(following?.count || 0), isFollowing: Boolean(relation) }
  },

  async rankings_get(_args: any, _user: SessionUser | null) {
    const [profiles, metrics] = await Promise.all([
      db().prepare('select * from profiles order by created_at desc limit 100').all<Record<string, any>>(),
      db().prepare(`
        select p.id,
          (select count(*) from book_reads br where br.user_id = p.id) as books_read,
          coalesce((select sum(max(rp.current_page, 0)) from reading_progress rp where rp.user_id = p.id), 0) as pages_read,
          coalesce((select count(distinct date(br.read_at)) from book_reads br where br.user_id = p.id and br.read_at >= date('now', '-30 days')), 0) as streak_days
        from profiles p`).all<Record<string, any>>(),
    ])
    const metricMap = new Map((metrics.results || []).map((item) => [item.id, item]))
    return [(profiles.results || [])].flat().map((profile) => {
      const metric = metricMap.get(profile.id)
      return {
        profile: profileOut(profile),
        booksRead: Number(metric?.books_read || 0),
        pagesRead: Number(metric?.pages_read || 0),
        streak: Number(metric?.streak_days || 0),
      }
    }).sort((a, b) => b.pagesRead - a.pagesRead || b.booksRead - a.booksRead)
  },

  /* ------------------------------ perfis e atividades ------------------------------ */

  async profiles_search(args: any, _user: SessionUser | null) {
    const query = String(args.query || '').trim()
    if (!query) {
      const { results } = await db().prepare('select * from profiles order by created_at desc limit 30').all<Record<string, any>>()
      return (results || []).map(profileOut)
    }
    const like = `%${query}%`
    const { results } = await db().prepare('select * from profiles where display_name like ? or nickname like ? or public_id = ? order by created_at desc limit 30')
      .bind(like, like, query).all<Record<string, any>>()
    return (results || []).map(profileOut)
  },

  async profile_get(args: any, _user: SessionUser | null) {
    const row = await db().prepare('select * from profiles where id = ?').bind(String(args.profileId)).first<Record<string, any>>()
    return row ? profileOut(row) : null
  },

  async profile_update(args: any, user: SessionUser) {
    const changes = args.changes ?? {}
    const fields: string[] = []
    const params: unknown[] = []
    if (changes.display_name != null) { fields.push('display_name = ?'); params.push(String(changes.display_name).slice(0, 80)) }
    if (changes.bio != null) { fields.push('bio = ?'); params.push(String(changes.bio).slice(0, 600)) }
    if (changes.avatar_url !== undefined) { fields.push('avatar_url = ?'); params.push(changes.avatar_url) }
    if (!fields.length) return profileOut((await db().prepare('select * from profiles where id = ?').bind(user.id).first<Record<string, any>>()) || {})
    params.push(user.id)
    await db().prepare(`update profiles set ${fields.join(', ')} where id = ?`).bind(...params).run()
    const row = await db().prepare('select * from profiles where id = ?').bind(user.id).first<Record<string, any>>()
    return profileOut(row || {})
  },

  async activities_list(args: any, _user: SessionUser | null) {
    const { results } = await db().prepare('select * from activities where user_id = ? order by created_at desc limit 20')
      .bind(String(args.profileId)).all<Record<string, any>>()
    return (results || []).map(activityOut)
  },

  /* ------------------------------ leitura ------------------------------ */

  async progress_upsert(args: any, user: SessionUser) {
    const progress = args
    const bookId = progress.book_id ?? progress.bookId
    const bookSource = progress.book_source ?? progress.bookSource
    const currentPage = progress.current_page ?? progress.currentPage
    const anchorOffset = progress.anchor_offset ?? progress.anchorOffset
    const status = Number(progress.percent) >= 100 ? 'completed' : 'reading'
    await db().batch([
      db().prepare(`insert into reading_progress (id, user_id, book_id, book_source, current_page, anchor_offset, percent, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (user_id, book_id, book_source) do update set
          current_page = excluded.current_page, anchor_offset = excluded.anchor_offset, percent = excluded.percent, updated_at = excluded.updated_at`)
        .bind(crypto.randomUUID(), user.id, bookId, bookSource, Math.max(0, Number(currentPage) || 0), Number(anchorOffset || 0), Number(progress.percent) || 0, now()),
      db().prepare(`insert into shelf_items (user_id, book_id, book_source, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)
        on conflict (user_id, book_id, book_source) do update set status = excluded.status, updated_at = excluded.updated_at`)
        .bind(user.id, bookId, bookSource, status, now(), now()),
    ])
    return true
  },

  async progress_get(args: any, user: SessionUser) {
    const row = await db().prepare('select * from reading_progress where user_id = ? and book_id = ? and book_source = ?')
      .bind(user.id, String(args.bookId ?? args.book_id), String(args.bookSource ?? args.book_source)).first<Record<string, any>>()
    if (!row) return null
    return {
      id: row.id, user_id: row.user_id, book_id: row.book_id, book_source: row.book_source,
      current_page: Number(row.current_page || 0), anchor_offset: Number(row.anchor_offset || 0),
      percent: Number(row.percent || 0), updated_at: row.updated_at,
    }
  },

  async progress_latest(_args: any, user: SessionUser) {
    const row = await db().prepare('select * from reading_progress where user_id = ? order by updated_at desc limit 1')
      .bind(user.id).first<Record<string, any>>()
    if (!row) return null
    return {
      id: row.id, user_id: row.user_id, book_id: row.book_id, book_source: row.book_source,
      current_page: Number(row.current_page || 0), anchor_offset: Number(row.anchor_offset || 0),
      percent: Number(row.percent || 0), updated_at: row.updated_at,
    }
  },

  async shelf_list(args: any, user: SessionUser) {
    void args // a prateleira é sempre do usuário da sessão
    const { results } = await db().prepare('select * from shelf_items where user_id = ? order by updated_at desc').bind(user.id).all<Record<string, any>>()
    return (results || [])
  },

  async shelf_set(args: any, user: SessionUser) {
    await db().prepare(`insert into shelf_items (user_id, book_id, book_source, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?)
      on conflict (user_id, book_id, book_source) do update set status = excluded.status, updated_at = excluded.updated_at`)
      .bind(user.id, String(args.bookId), String(args.bookSource), String(args.status), now(), now()).run()
    return true
  },

  async bookmarks_list(args: any, user: SessionUser) {
    const { results } = await db().prepare('select * from bookmarks where user_id = ? and book_id = ? and book_source = ? order by page_number')
      .bind(user.id, String(args.bookId), String(args.bookSource)).all<Record<string, any>>()
    return (results || [])
  },

  async bookmarks_toggle(args: any, user: SessionUser) {
    const existing = await db().prepare('select id from bookmarks where user_id = ? and book_id = ? and book_source = ? and page_number = ?')
      .bind(user.id, String(args.bookId), String(args.bookSource), Number(args.pageNumber) || 0).first<Record<string, any>>()
    if (existing) {
      await db().prepare('delete from bookmarks where id = ?').bind(existing.id).run()
      return false
    }
    await db().prepare('insert into bookmarks (id, user_id, book_id, book_source, page_number, anchor_offset, note, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), user.id, String(args.bookId), String(args.bookSource), Number(args.pageNumber) || 0, Number(args.anchorOffset || 0), args.note || null, now()).run()
    return true
  },

  async highlights_list(args: any, user: SessionUser) {
    const { results } = await db().prepare('select * from highlights where user_id = ? and book_id = ? and book_source = ? order by anchor_start')
      .bind(user.id, String(args.bookId), String(args.bookSource)).all<Record<string, any>>()
    return (results || [])
  },

  async highlights_create(args: any, user: SessionUser) {
    const color = ['yellow', 'green', 'blue', 'pink'].includes(args.color) ? String(args.color) : 'yellow'
    const id = crypto.randomUUID()
    await db().prepare(`insert into highlights (id, user_id, book_id, book_source, anchor_start, anchor_end, selected_text, color, note, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, user.id, String(args.bookId), String(args.bookSource), Number(args.anchorStart) || 0, Number(args.anchorEnd) || 0,
        String(args.selectedText || '').slice(0, 2000), color, args.note || null, now(), now()).run()
    const row = await db().prepare('select * from highlights where id = ?').bind(id).first()
    return row
  },

  async highlights_update_note(args: any, user: SessionUser) {
    const result = await db().prepare('update highlights set note = ?, updated_at = ? where id = ? and user_id = ?')
      .bind(args.note ?? null, now(), String(args.id), user.id).run()
    if (!result.meta.changes) throw new Error('Destaque não encontrado.')
    return true
  },

  async highlights_delete(args: any, user: SessionUser) {
    const result = await db().prepare('delete from highlights where id = ? and user_id = ?').bind(String(args.id), user.id).run()
    if (!result.meta.changes) throw new Error('Destaque não encontrado.')
    return true
  },

  /* ------------------------------ exclusão de conta ------------------------------ */

  async account_delete(_args: any, user: SessionUser) {
    await db().batch([
      db().prepare('delete from highlights where user_id = ?').bind(user.id),
      db().prepare('delete from bookmarks where user_id = ?').bind(user.id),
      db().prepare('delete from activities where user_id = ?').bind(user.id),
      db().prepare('delete from follows where follower_id = ? or following_id = ?').bind(user.id, user.id),
      db().prepare('delete from reviews where user_id = ?').bind(user.id),
      db().prepare('delete from book_reactions where user_id = ?').bind(user.id),
      db().prepare('delete from shelf_items where user_id = ?').bind(user.id),
      db().prepare('delete from book_reads where user_id = ?').bind(user.id),
      db().prepare('delete from reading_progress where user_id = ?').bind(user.id),
      db().prepare('delete from customization_settings where user_id = ?').bind(user.id),
      db().prepare('delete from book_content where book_id in (select id from books where user_id = ?)').bind(user.id),
      db().prepare('delete from chapters where created_book_id in (select id from created_books where user_id = ?)').bind(user.id),
      db().prepare('delete from created_books where user_id = ?').bind(user.id),
      db().prepare('delete from books where user_id = ?').bind(user.id),
      db().prepare('delete from file_chunks where file_id in (select id from files where owner_id = ?)').bind(user.id),
      db().prepare('delete from files where owner_id = ?').bind(user.id),
      db().prepare('delete from profiles where id = ?').bind(user.id),
    ])
    return true
  },
}

/** Lista de ops que não exigem sessão (leitura pública). */
const PUBLIC_OPS = new Set([
  'library_public', 'created_list_community', 'created_book_get', 'book_get',
  'social_get', 'rankings_get', 'follow_get', 'profiles_search', 'profile_get', 'activities_list',
])

/** Ops que exigem sessão explícita mesmo quando args user_id estiver preenchido. */
const PRIVATE_OPS = new Set([
  'session_get', 'library_mine', 'book_create', 'book_update', 'book_delete', 'created_list_mine', 'created_create', 'created_update',
  'read_register', 'reaction_set', 'reaction_remove', 'review_save', 'follow_toggle', 'profile_update',
  'progress_upsert', 'progress_get', 'progress_latest', 'shelf_list', 'shelf_set', 'bookmarks_list', 'bookmarks_toggle',
  'highlights_list', 'highlights_create', 'highlights_update_note', 'highlights_delete', 'account_delete',
])

export async function dispatch(op: string, args: Record<string, any>, user: SessionUser | null) {
  const handler = (handlers as Record<string, any>)[op]
  if (!handler) throw new Error(`Operação desconhecida: ${op}`)
  if (PRIVATE_OPS.has(op) && !user) throw new Error('Entre na sua conta antes de continuar.')
  if (!PUBLIC_OPS.has(op) && !PRIVATE_OPS.has(op)) throw new Error('Operação desconhecida.')
  return handler(args ?? {}, user)
}

/** Gera o ID público de 8 dígitos sem colisão (port do generate_reader_id). */
export async function generatePublicId(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')
    const existing = await db().prepare('select 1 as present from profiles where public_id = ?').bind(candidate).first()
    if (!existing) return candidate
  }
  return randomHex(4).toUpperCase()
}
