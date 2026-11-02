CREATE TABLE IF NOT EXISTS reading_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    book_source TEXT CHECK (book_source IN ('imported', 'created')),
    current_page INTEGER DEFAULT 0,
    anchor_offset INTEGER NOT NULL DEFAULT 0,
    percent REAL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, book_id, book_source)
);