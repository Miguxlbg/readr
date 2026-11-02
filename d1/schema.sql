-- Readr — schema D1 (SQLite). Idempotente: pode rodar mais de uma vez.
-- Backend 100% Cloudflare: sem Supabase, sem R2. Arquivos vivem em `files`/`file_chunks`.

create table if not exists profiles (
  id text primary key,
  email text not null,
  password_hash text not null,
  kdf_salt text not null,
  display_name text,
  nickname text collate nocase,
  public_id text,
  avatar_url text,
  bio text,
  created_at text not null
);
create unique index if not exists profiles_email_unique on profiles (email);
create unique index if not exists profiles_nickname_unique on profiles (nickname) where nickname is not null and nickname <> '';
create unique index if not exists profiles_public_id_unique on profiles (public_id) where public_id is not null;

create table if not exists books (
  id text primary key,
  user_id text not null references profiles(id) on delete cascade,
  title text not null,
  author text,
  description text,
  cover_url text,
  format text check (format in ('epub','pdf','docx')),
  file_url text,
  total_pages integer not null default 1,
  genre text,
  language text,
  published_year integer,
  publisher text,
  tags text not null default '[]',
  reads_count integer not null default 0,
  created_at text not null
);
create index if not exists books_user_idx on books (user_id, created_at desc);

-- Conteúdo do livro importado (JSON de blocos) dividido em chunks <= 500 KB por linha (limite de linha do D1: 1 MB).
create table if not exists book_content (
  book_id text not null,
  chunk_index integer not null,
  data text not null,
  primary key (book_id, chunk_index)
);

create table if not exists created_books (
  id text primary key,
  user_id text not null references profiles(id) on delete cascade,
  title text not null,
  author text,
  description text,
  cover_url text,
  status text not null default 'draft' check (status in ('draft','published')),
  genre text,
  language text,
  published_year integer,
  publisher text,
  tags text not null default '[]',
  reads_count integer not null default 0,
  created_at text not null
);
create index if not exists created_books_user_idx on created_books (user_id, created_at desc);
create index if not exists created_books_status_idx on created_books (status, created_at desc);

create table if not exists chapters (
  id text primary key,
  created_book_id text not null references created_books(id) on delete cascade,
  title text,
  content text,
  order_index integer not null default 0
);
create index if not exists chapters_book_idx on chapters (created_book_id, order_index);

create table if not exists reading_progress (
  id text primary key,
  user_id text not null,
  book_id text not null,
  book_source text not null check (book_source in ('imported','created')),
  current_page integer not null default 0,
  anchor_offset integer not null default 0,
  percent real not null default 0,
  updated_at text not null
);
create unique index if not exists reading_progress_unique on reading_progress (user_id, book_id, book_source);

create table if not exists customization_settings (
  user_id text primary key references profiles(id) on delete cascade,
  font text default 'serif',
  theme text default 'light',
  margin integer default 24,
  line_spacing real default 1.4
);

create table if not exists book_reads (
  user_id text not null,
  book_id text not null,
  book_source text not null check (book_source in ('imported','created')),
  read_at text not null,
  primary key (user_id, book_id, book_source)
);

create table if not exists shelf_items (
  user_id text not null,
  book_id text not null,
  book_source text not null check (book_source in ('imported','created')),
  status text not null default 'saved' check (status in ('saved','wishlist','reading','completed')),
  created_at text not null,
  updated_at text not null,
  primary key (user_id, book_id, book_source)
);

create table if not exists book_reactions (
  user_id text not null,
  book_id text not null,
  book_source text not null check (book_source in ('imported','created')),
  reaction text not null check (reaction in ('like','dislike')),
  created_at text not null,
  primary key (user_id, book_id, book_source)
);

create table if not exists reviews (
  id text primary key,
  user_id text not null,
  book_id text not null,
  book_source text not null check (book_source in ('imported','created')),
  rating integer not null check (rating between 1 and 5),
  content text default '',
  created_at text not null,
  updated_at text not null
);
create unique index if not exists reviews_unique on reviews (user_id, book_id, book_source);

create table if not exists follows (
  follower_id text not null,
  following_id text not null,
  created_at text not null,
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_following_idx on follows (following_id);

create table if not exists activities (
  id text primary key,
  user_id text not null,
  activity_type text not null,
  book_id text,
  book_source text check (book_source in ('imported','created')),
  metadata text not null default '{}',
  created_at text not null
);
create index if not exists activities_user_idx on activities (user_id, created_at desc);

create table if not exists bookmarks (
  id text primary key,
  user_id text not null,
  book_id text not null,
  book_source text not null check (book_source in ('imported','created')),
  page_number integer not null,
  anchor_offset integer not null default 0,
  note text,
  created_at text not null
);
create unique index if not exists bookmarks_page_unique on bookmarks (user_id, book_id, book_source, page_number);

create table if not exists highlights (
  id text primary key,
  user_id text not null,
  book_id text not null,
  book_source text not null check (book_source in ('imported','created')),
  anchor_start integer not null,
  anchor_end integer not null,
  selected_text text not null,
  color text not null default 'yellow' check (color in ('yellow','green','blue','pink')),
  note text,
  created_at text not null,
  updated_at text not null,
  check (anchor_end >= anchor_start)
);
create index if not exists highlights_reader_lookup on highlights (user_id, book_id, book_source, anchor_start, anchor_end);

-- Armazenamento de arquivos em D1 (substitui Supabase Storage e R2).
-- Capas e avatares são públicos; arquivos de livro são privados do dono. Gravação em chunks de ~500 KB.
create table if not exists files (
  id text primary key,
  kind text not null check (kind in ('cover','avatar','book')),
  owner_id text,
  mime text not null,
  size integer not null,
  chunk_count integer not null default 1,
  is_public integer not null default 0,
  created_at text not null
);
create index if not exists files_owner_idx on files (owner_id);

create table if not exists file_chunks (
  file_id text not null references files(id) on delete cascade,
  chunk_index integer not null,
  data blob not null,
  primary key (file_id, chunk_index)
);
