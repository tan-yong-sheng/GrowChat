ALTER TABLE users ADD COLUMN last_active_at INTEGER;

UPDATE users
SET last_active_at = COALESCE(updated_at, created_at)
WHERE last_active_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at DESC);
