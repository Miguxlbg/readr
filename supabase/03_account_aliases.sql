CREATE TABLE IF NOT EXISTS account_aliases (
    user_id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    email TEXT NOT NULL
);