CREATE TABLE IF NOT EXISTS book_reads (
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    book_source TEXT NOT NULL CHECK (book_source IN ('imported', 'created')),
    read_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, book_id, book_source)
);