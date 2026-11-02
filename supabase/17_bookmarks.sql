CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    book_source TEXT NOT NULL CHECK (book_source IN ('imported', 'created')),
    page_number INTEGER NOT NULL,
    anchor_offset INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, book_id, book_source, page_number)
);