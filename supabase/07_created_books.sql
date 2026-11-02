CREATE TABLE IF NOT EXISTS created_books (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    cover_url TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    genre TEXT,
    language TEXT DEFAULT 'Português',
    published_year INTEGER,
    publisher TEXT,
    tags TEXT,
    reads_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);