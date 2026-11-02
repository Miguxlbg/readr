CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    book_source TEXT NOT NULL CHECK (book_source IN ('imported', 'created')),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, book_id, book_source)
);