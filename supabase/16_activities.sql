CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    book_id TEXT,
    book_source TEXT CHECK (book_source IN ('imported', 'created')),
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);