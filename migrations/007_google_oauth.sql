-- Google OAuth integration
-- Adds google_id column to users table for linking Google accounts

-- Add nullable google_id column (existing users have no Google account linked)
ALTER TABLE users ADD COLUMN google_id TEXT;

-- Create unique index on google_id for fast lookups and to enforce uniqueness
-- (partial index via WHERE clause to allow multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
