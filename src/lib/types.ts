export type BookSource = 'imported' | 'created'
export type BookFormat = 'epub' | 'pdf' | 'docx' | 'readr'
export type ReaderTheme = 'light' | 'sepia' | 'dark'
export type ReaderFontId = 'source-serif' | 'lora' | 'bitter' | 'merriweather' | 'atkinson' | 'inter' | 'public-sans' | 'serif' | 'sans'
export type ShelfStatus = 'saved' | 'wishlist' | 'reading' | 'completed'

export interface Book {
  id: string
  user_id?: string
  title: string
  author: string
  description?: string
  cover_url?: string | null
  format: BookFormat
  total_pages: number
  source: BookSource
  genre?: string
  language?: string
  published_year?: number | null
  publisher?: string
  tags?: string[]
  reads_count?: number
  average_rating?: number
  reviews_count?: number
  likes_count?: number
  dislikes_count?: number
  shelf_status?: ShelfStatus
  file_url?: string | null
  content?: Array<string | ReaderChapter>
  created_at?: string
}

export interface CreatedBook extends Book {
  user_id: string
  status: 'draft' | 'published'
  reads_count: number
  created_at: string
  chapters?: Chapter[]
}

export interface Chapter {
  id?: string
  created_book_id?: string
  title: string
  content: string
  order_index: number
}

export interface ReadingProgress {
  id?: string
  user_id: string
  book_id: string
  book_source: BookSource
  current_page: number
  anchor_offset?: number
  percent: number
  updated_at?: string
}

export interface UserProfile {
  id: string
  display_name: string
  nickname?: string
  public_id?: string
  avatar_url?: string | null
  bio?: string
  created_at?: string
}

export interface BookReview {
  id: string
  user_id: string
  book_id: string
  book_source: BookSource
  rating: number
  content: string
  created_at: string
  profiles?: Pick<UserProfile, 'display_name' | 'nickname' | 'avatar_url'>
}

export interface ShelfItem {
  user_id: string
  book_id: string
  book_source: BookSource
  status: ShelfStatus
  created_at: string
  updated_at: string
}

export interface CreateBookPayload {
  title: string
  author?: string
  description?: string
  cover_url?: string | null
  status: 'draft' | 'published'
  genre?: string
  language?: string
  published_year?: number | null
  publisher?: string
  tags?: string[]
  chapters: Omit<Chapter, 'id' | 'created_book_id'>[]
}

export type ReaderBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string; dropCap?: boolean; preserveBreaks?: boolean }
  | { type: 'blockquote'; text: string; preserveBreaks?: boolean }
  | { type: 'list-item'; text: string; ordered?: boolean }
  | { type: 'divider' }
  | { type: 'image'; src: string; alt?: string }

export interface ReaderChapter {
  id: string
  title: string
  href?: string
  blocks: ReaderBlock[]
}

export interface ReaderPage {
  chapterTitle: string
  pageNumber: number
  anchor: number
  blocks: ReaderBlock[]
  isFirstPageOfChapter?: boolean
  isCover?: boolean
  coverUrl?: string
}

export interface ReaderBookmark {
  id: string
  user_id: string
  book_id: string
  book_source: BookSource
  page_number: number
  anchor_offset?: number
  note?: string
  created_at: string
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface ReaderHighlight {
  id: string
  user_id: string
  book_id: string
  book_source: BookSource
  anchor_start: number
  anchor_end: number
  selected_text: string
  color: HighlightColor
  note?: string | null
  created_at: string
  updated_at?: string
}
