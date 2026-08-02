import { createClient } from '@/lib/supabase/client'
import { parseBookFile } from '@/lib/reader/parseBook'
import { CreatedBookSource, ImportedBookSource, readerPageText, repaginateReaderContent } from '@/lib/reader/ReaderSource'
import type { Book, BookReview, BookSource, CreateBookPayload, CreatedBook, HighlightColor, ReaderHighlight, ReadingProgress, ShelfStatus, UserProfile } from '@/lib/types'

export interface ImportOptions {
  title?: string
  author?: string
  description?: string
  coverFile?: File | null
  genre?: string
  language?: string
  publishedYear?: number | null
  publisher?: string
  tags?: string[]
}
export interface ContinueReadingData { book: Book; progress: ReadingProgress; pageHtml: string; chapterTitle: string }

function imported(row: Record<string, any>): Book {
  return {
    id: row.id, user_id: row.user_id, title: row.title || '', author: row.author || '', description: row.description || '', cover_url: row.cover_url,
    format: row.format, file_url: row.file_url, total_pages: Math.max(1, row.total_pages || 1), source: 'imported', content: Array.isArray(row.content) ? row.content : [],
    genre: row.genre || '', language: row.language || 'Português', published_year: row.published_year, publisher: row.publisher || '', tags: row.tags || [],
    reads_count: Number(row.reads_count || 0), created_at: row.created_at,
  }
}
function created(row: Record<string, any>): CreatedBook {
  const chapters = Array.isArray(row.chapters) ? [...row.chapters].sort((a, b) => a.order_index - b.order_index) : []
  const words = chapters.reduce((sum, chapter) => sum + String(chapter.content || '').trim().split(/\s+/).filter(Boolean).length, 0)
  return {
    ...row, title: row.title || '', author: row.author || '', description: row.description || '', chapters, format: 'readr', source: 'created',
    total_pages: Math.max(1, row.total_pages || Math.ceil(words / 280)), reads_count: Number(row.reads_count || 0), tags: row.tags || [],
  } as CreatedBook
}

async function addAggregates(books: Book[]) {
  if (!books.length) return books
  const supabase = createClient()
  const ids = books.map((book) => book.id)
  const [{ data: reviews }, { data: reactions }] = await Promise.all([
    supabase.from('reviews').select('book_id,book_source,rating').in('book_id', ids),
    supabase.from('book_reactions').select('book_id,book_source,reaction').in('book_id', ids),
  ])
  return books.map((book) => {
    const ownReviews = (reviews || []).filter((item) => item.book_id === book.id && item.book_source === book.source)
    const rating = ownReviews.reduce((sum, item) => sum + Number(item.rating), 0)
    return {
      ...book,
      average_rating: ownReviews.length ? rating / ownReviews.length : 0,
      reviews_count: ownReviews.length,
      likes_count: (reactions || []).filter((item) => item.book_id === book.id && item.book_source === book.source && item.reaction === 'like').length,
    }
  })
}

export async function getImportedLibrary(userId: string): Promise<Book[]> {
  if (!userId) return []
  const { data, error } = await createClient().from('books').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(imported)
}
export async function getPublicImportedBooks(userId?: string): Promise<Book[]> {
  let query = createClient().from('books').select('id,user_id,title,author,description,cover_url,format,total_pages,genre,language,published_year,publisher,tags,reads_count,created_at').order('created_at', { ascending: false })
  if (userId) query = query.neq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(imported)
}
export async function getImportedBook(bookId: string): Promise<Book | null> {
  const { data, error } = await createClient().from('books').select('*').eq('id', bookId).maybeSingle()
  if (error) throw error
  return data ? imported(data) : null
}
export async function getPublicBook(bookId: string, source: BookSource): Promise<Book | null> {
  if (source === 'created') return getCreatedBook(bookId)
  const { data, error } = await createClient().from('books').select('id,user_id,title,author,description,cover_url,format,total_pages,genre,language,published_year,publisher,tags,reads_count,created_at').eq('id', bookId).maybeSingle()
  if (error) throw error
  return data ? imported(data) : null
}
export async function getPublicLibrary(): Promise<Book[]> {
  const [imports, authored] = await Promise.all([getPublicImportedBooks(), getCommunityBooks()])
  return addAggregates([...imports, ...authored])
}

export const getCatalogBooks = getPublicLibrary
export const getCatalogBook = getPublicBook

export async function getShelf(userId: string): Promise<Book[]> {
  if (!userId) return []
  const [items, catalog, ownedImports] = await Promise.all([
    getShelfItems(userId),
    getPublicLibrary(),
    getImportedLibrary(userId),
  ])
  const available = new Map<string, Book>()
  ;[...catalog, ...ownedImports].forEach((book) => available.set(`${book.source}:${book.id}`, book))
  return items.flatMap((item) => {
    const book = available.get(`${item.book_source}:${item.book_id}`)
    return book ? [{ ...book, shelf_status: item.status as ShelfStatus }] : []
  })
}

export async function importBook(file: File, userId: string, options: ImportOptions = {}) {
  if (!userId) throw new Error('Entre na sua conta antes de importar um livro.')
  const parsed = await parseBookFile(file)
  const supabase = createClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')
  const filePath = `${userId}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await supabase.storage.from('uploads').upload(filePath, file, { contentType: file.type || undefined })
  if (uploadError) throw uploadError
  try {
    const extractedCover = parsed.coverBlob
      ? new File(
          [parsed.coverBlob],
          `${safeName.replace(/\.[^.]+$/, '')}-cover.${parsed.coverExtension || 'jpg'}`,
          { type: parsed.coverBlob.type || 'image/jpeg' },
        )
      : null
    const coverFile = options.coverFile || extractedCover
    const coverUrl = coverFile ? await uploadCover(coverFile, userId) : null
    const { data, error } = await supabase.from('books').insert({
      user_id: userId, title: options.title?.trim() || parsed.title, author: options.author?.trim() || parsed.author,
      description: options.description?.trim() || parsed.description || '', cover_url: coverUrl, format: parsed.format, file_url: filePath,
      total_pages: parsed.pages.length, content: parsed.pages, genre: options.genre || '', language: options.language || parsed.language || 'Português',
      published_year: options.publishedYear || parsed.publicationYear || null, publisher: options.publisher || parsed.publisher || '', tags: options.tags || [],
    }).select('*').single()
    if (error) throw error
    await supabase.from('activities').insert({ user_id: userId, activity_type: 'imported_book', book_id: data.id, book_source: 'imported', metadata: { title: data.title } })
    return imported(data)
  } catch (error) {
    await supabase.storage.from('uploads').remove([filePath])
    throw error
  }
}
export async function updateImportedBook(bookId: string, userId: string, changes: Partial<Pick<Book, 'title' | 'author' | 'description' | 'cover_url' | 'genre' | 'language' | 'published_year' | 'publisher' | 'tags'>>) {
  const { error } = await createClient().from('books').update(changes).eq('id', bookId).eq('user_id', userId)
  if (error) throw error
}
export async function deleteImportedBook(bookId: string, userId: string) {
  const supabase = createClient()
  const { data } = await supabase.from('books').select('file_url').eq('id', bookId).eq('user_id', userId).maybeSingle()
  const { error } = await supabase.from('books').delete().eq('id', bookId).eq('user_id', userId)
  if (error) throw error
  if (data?.file_url) await supabase.storage.from('uploads').remove([data.file_url])
}

export async function getCreatedBooks(userId: string): Promise<CreatedBook[]> {
  if (!userId) return []
  const { data, error } = await createClient().from('created_books').select('*, chapters(*)').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(created)
}
export async function getCommunityBooks(userId?: string): Promise<CreatedBook[]> {
  let query = createClient().from('created_books').select('*').eq('status', 'published').order('created_at', { ascending: false })
  if (userId) query = query.neq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(created)
}
export async function getCreatedBook(bookId: string): Promise<CreatedBook | null> {
  const { data, error } = await createClient().from('created_books').select('*, chapters(*)').eq('id', bookId).maybeSingle()
  if (error) throw error
  return data ? created(data) : null
}
export async function createBook(payload: CreateBookPayload, userId: string) {
  const supabase = createClient()
  const { chapters: chapterPayload, ...metadata } = payload
  const { data: book, error } = await supabase.from('created_books').insert({ user_id: userId, ...metadata }).select().single()
  if (error) throw error
  const chapters = chapterPayload.map((chapter, index) => ({ ...chapter, created_book_id: book.id, order_index: index }))
  const { error: chapterError } = await supabase.from('chapters').insert(chapters)
  if (chapterError) { await supabase.from('created_books').delete().eq('id', book.id); throw chapterError }
  await supabase.from('activities').insert({ user_id: userId, activity_type: payload.status === 'published' ? 'published_book' : 'created_book', book_id: book.id, book_source: 'created', metadata: { title: payload.title } })
  return book.id as string
}
export async function updateBook(bookId: string, payload: CreateBookPayload, userId: string) {
  const supabase = createClient()
  const { chapters: chapterPayload, ...metadata } = payload
  const { data: owned, error: ownershipError } = await supabase.from('created_books').select('id').eq('id', bookId).eq('user_id', userId).maybeSingle()
  if (ownershipError) throw ownershipError
  if (!owned) throw new Error('Somente o proprietário pode editar este livro.')
  const { error } = await supabase.from('created_books').update(metadata).eq('id', bookId).eq('user_id', userId)
  if (error) throw error
  const { error: deleteError } = await supabase.from('chapters').delete().eq('created_book_id', bookId)
  if (deleteError) throw deleteError
  const chapters = chapterPayload.map((chapter, index) => ({ ...chapter, created_book_id: bookId, order_index: index }))
  const { error: chapterError } = await supabase.from('chapters').insert(chapters)
  if (chapterError) throw chapterError
}

export async function updateReadingProgress(progress: Omit<ReadingProgress, 'id' | 'updated_at'>) {
  const { error } = await createClient().from('reading_progress').upsert({ ...progress, updated_at: new Date().toISOString() }, { onConflict: 'user_id,book_id,book_source' })
  if (error) throw error
  await setShelfStatus(progress.user_id, progress.book_id, progress.book_source, progress.percent >= 100 ? 'completed' : 'reading')
}
export async function getReadingProgress(userId: string, bookId: string, source: BookSource) {
  const { data, error } = await createClient().from('reading_progress').select('*').eq('user_id', userId).eq('book_id', bookId).eq('book_source', source).maybeSingle()
  if (error) throw error
  return data as ReadingProgress | null
}
export async function getContinueReading(userId: string): Promise<ContinueReadingData | null> {
  const { data, error } = await createClient().from('reading_progress').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!data) return null
  const progress = data as ReadingProgress
  const book = progress.book_source === 'imported' ? await getImportedBook(progress.book_id) : await getCreatedBook(progress.book_id)
  if (!book) return null
  const source = progress.book_source === 'imported'
    ? await new ImportedBookSource(book).load()
    : await new CreatedBookSource(book, (book as CreatedBook).chapters || []).load()
  const pages = repaginateReaderContent(source, 165)
  const anchor = Number(progress.anchor_offset || 0)
  const index = anchor
    ? Math.max(0, pages.findLastIndex((page) => Number(page.anchor || 0) <= anchor))
    : Math.min(progress.current_page, Math.max(0, pages.length - 1))
  const page = pages[index]
  return { book: { ...book, total_pages: pages.length }, progress: { ...progress, current_page: index }, pageHtml: page ? readerPageText(page) : '', chapterTitle: page?.chapterTitle || '' }
}
export async function registerBookRead(bookId: string, source: BookSource) {
  const { error } = await createClient().rpc('register_book_read', { target_book_id: bookId, target_source: source })
  if (error) throw error
}

export async function setShelfStatus(userId: string, bookId: string, source: BookSource, status: ShelfStatus) {
  const { error } = await createClient().from('shelf_items').upsert({ user_id: userId, book_id: bookId, book_source: source, status, updated_at: new Date().toISOString() }, { onConflict: 'user_id,book_id,book_source' })
  if (error) throw error
}
export async function getShelfItems(userId: string) {
  const { data, error } = await createClient().from('shelf_items').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function setBookReaction(userId: string, bookId: string, source: BookSource, reaction: 'like' | 'dislike') {
  const { error } = await createClient().from('book_reactions').upsert({ user_id: userId, book_id: bookId, book_source: source, reaction }, { onConflict: 'user_id,book_id,book_source' })
  if (error) throw error
}
export async function getBookSocial(bookId: string, source: BookSource) {
  const supabase = createClient()
  const [{ data: reactions, error: reactionError }, { data: reviews, error: reviewError }] = await Promise.all([
    supabase.from('book_reactions').select('*').eq('book_id', bookId).eq('book_source', source),
    supabase.from('reviews').select('*, profiles(display_name,nickname,avatar_url)').eq('book_id', bookId).eq('book_source', source).order('created_at', { ascending: false }),
  ])
  if (reactionError) throw reactionError
  if (reviewError) throw reviewError
  const typedReviews = (reviews || []) as BookReview[]
  return {
    likes: (reactions || []).filter((item) => item.reaction === 'like').length,
    dislikes: (reactions || []).filter((item) => item.reaction === 'dislike').length,
    reviews: typedReviews,
    averageRating: typedReviews.length ? typedReviews.reduce((sum, item) => sum + item.rating, 0) / typedReviews.length : 0,
  }
}
export async function saveReview(userId: string, bookId: string, source: BookSource, rating: number, content: string) {
  const { error } = await createClient().from('reviews').upsert({ user_id: userId, book_id: bookId, book_source: source, rating, content, updated_at: new Date().toISOString() }, { onConflict: 'user_id,book_id,book_source' })
  if (error) throw error
}

export async function getBookReviews(bookId: string, source: BookSource) {
  return (await getBookSocial(bookId, source)).reviews
}

export async function saveBookToShelf(userId: string, book: Book, status: 'want_to_read' | 'reading' | 'saved' | 'wishlist' | 'completed') {
  const normalized: ShelfStatus = status === 'want_to_read' ? 'wishlist' : status
  return setShelfStatus(userId, book.id, book.source, normalized)
}

export async function toggleBookLike(userId: string, book: Book, liked: boolean) {
  const supabase = createClient()
  if (liked) return setBookReaction(userId, book.id, book.source, 'like')
  const { error } = await supabase.from('book_reactions').delete().eq('user_id', userId).eq('book_id', book.id).eq('book_source', book.source)
  if (error) throw error
}

export async function getProfiles(query = '') {
  let request = createClient().from('profiles').select('*').order('created_at', { ascending: false }).limit(30)
  if (query.trim()) request = request.or(`display_name.ilike.%${query.trim()}%,nickname.ilike.%${query.trim()}%,public_id.eq.${query.trim()}`)
  const { data, error } = await request
  if (error) throw error
  return (data || []) as UserProfile[]
}
export async function toggleFollow(currentUserId: string, profileId: string, following: boolean) {
  const supabase = createClient()
  const request = following ? supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', profileId) : supabase.from('follows').insert({ follower_id: currentUserId, following_id: profileId })
  const { error } = await request
  if (error) throw error
}
export async function getFollowCounts(profileId: string, currentUserId?: string) {
  const supabase = createClient()
  const [{ count: followers }, { count: following }, { data: relation }] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileId),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileId),
    currentUserId ? supabase.from('follows').select('*').eq('follower_id', currentUserId).eq('following_id', profileId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return { followers: followers || 0, following: following || 0, isFollowing: Boolean(relation) }
}
export async function getRankings() {
  const supabase = createClient()
  const [{ data: profiles, error }, { data: metrics }] = await Promise.all([
    supabase.from('profiles').select('*').limit(100),
    supabase.rpc('get_reader_rankings'),
  ])
  if (error) throw error
  const metricMap = new Map((metrics || []).map((item: any) => [item.user_id, item]))
  return (profiles || []).map((profile) => {
    const metric: any = metricMap.get(profile.id)
    return { profile: profile as UserProfile, booksRead: Number(metric?.books_read || 0), pagesRead: Number(metric?.pages_read || 0), streak: Number(metric?.streak_days || 0) }
  }).sort((a, b) => b.pagesRead - a.pagesRead || b.booksRead - a.booksRead)
}

export async function getPublicProfile(profileId: string) {
  const { data, error } = await createClient().from('profiles').select('*').eq('id', profileId).maybeSingle()
  if (error) throw error
  return data as UserProfile | null
}

export async function getProfileActivities(profileId: string) {
  const { data, error } = await createClient().from('activities').select('*').eq('user_id', profileId).order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return data || []
}

export async function getBookmarks(userId: string, bookId: string, source: BookSource) {
  const { data, error } = await createClient().from('bookmarks').select('*').eq('user_id', userId).eq('book_id', bookId).eq('book_source', source).order('page_number')
  if (error) throw error
  return data || []
}

export async function toggleBookmark(userId: string, bookId: string, source: BookSource, pageNumber: number, note = '', anchorOffset = 0) {
  const supabase = createClient()
  const { data, error } = await supabase.from('bookmarks').select('id').eq('user_id', userId).eq('book_id', bookId).eq('book_source', source).eq('page_number', pageNumber).maybeSingle()
  if (error) throw error
  if (data) {
    const { error: deleteError } = await supabase.from('bookmarks').delete().eq('id', data.id)
    if (deleteError) throw deleteError
    return false
  }
  const { error: insertError } = await supabase.from('bookmarks').insert({ user_id: userId, book_id: bookId, book_source: source, page_number: pageNumber, anchor_offset: anchorOffset, note })
  if (insertError) throw insertError
  return true
}

export async function getHighlights(userId: string, bookId: string, source: BookSource): Promise<ReaderHighlight[]> {
  const { data, error } = await createClient().from('highlights').select('*').eq('user_id', userId).eq('book_id', bookId).eq('book_source', source).order('anchor_start')
  if (error) throw error
  return (data || []) as ReaderHighlight[]
}

export async function createHighlight(input: {
  userId: string
  bookId: string
  source: BookSource
  anchorStart: number
  anchorEnd: number
  selectedText: string
  color: HighlightColor
  note?: string
}) {
  const { data, error } = await createClient().from('highlights').insert({
    user_id: input.userId,
    book_id: input.bookId,
    book_source: input.source,
    anchor_start: input.anchorStart,
    anchor_end: input.anchorEnd,
    selected_text: input.selectedText,
    color: input.color,
    note: input.note || null,
  }).select('*').single()
  if (error) throw error
  return data as ReaderHighlight
}

export async function updateHighlightNote(id: string, userId: string, note: string) {
  const { error } = await createClient().from('highlights').update({ note, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  if (error) throw error
}

export async function deleteHighlight(id: string, userId: string) {
  const { error } = await createClient().from('highlights').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}

export async function uploadCover(file: File, userId: string) {
  if (!file.type.startsWith('image/')) throw new Error('A capa precisa ser uma imagem.')
  const supabase = createClient()
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from('covers').upload(path, file, { contentType: file.type })
  if (error) throw error
  return supabase.storage.from('covers').getPublicUrl(path).data.publicUrl
}
export async function getCurrentProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session?.user) return null
  const user = session.user
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  return data || { id: user.id, display_name: String(user.user_metadata.display_name || user.email?.split('@')[0] || ''), nickname: user.user_metadata.nickname, avatar_url: null }
}
