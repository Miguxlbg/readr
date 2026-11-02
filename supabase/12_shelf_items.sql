CREATE TABLE IF NOT EXISTS shelf_items (
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    book_source TEXT NOT NULL CHECK (book_source IN ('imported', 'created')),
    status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'wishlist', 'reading', 'completed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, book_id, book_source)
);