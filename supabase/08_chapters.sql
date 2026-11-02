CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    created_book_id TEXT NOT NULL,
    title TEXT,
    content TEXT,
    order_index INTEGER
);