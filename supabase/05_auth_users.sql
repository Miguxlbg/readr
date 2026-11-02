CREATE TABLE IF NOT EXISTS auth_users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    nickname TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);