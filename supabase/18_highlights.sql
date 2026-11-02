CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    book_source TEXT NOT NULL CHECK (book_source IN ('imported', 'created')),
    anchor_start INTEGER NOT NULL,
    anchor_end INTEGER NOT NULL,
    selected_text TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow', 'green', 'blue', 'pink')),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (anchor_end >= anchor_start)
);