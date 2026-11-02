CREATE TABLE IF NOT EXISTS customization_settings (
    user_id TEXT PRIMARY KEY,
    font TEXT DEFAULT 'serif',
    theme TEXT DEFAULT 'light',
    margin INTEGER DEFAULT 24,
    line_spacing REAL DEFAULT 1.4
);