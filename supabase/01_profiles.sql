CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    nickname TEXT,
    public_id TEXT,
    avatar_url TEXT,
    bio TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);