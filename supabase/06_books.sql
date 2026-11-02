CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    cover_url TEXT,
    format TEXT CHECK (format IN ('epub', 'pdf', 'docx')),
    file_data TEXT,
    total_pages INTEGER DEFAULT 1,
    content TEXT,
    genre TEXT,
    language TEXT DEFAULT 'Português',
    published_year INTEGER,
    publisher TEXT,
    tags TEXT,
    reads_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);