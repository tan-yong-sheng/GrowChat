-- Migration: Message Editing
-- Adds edited_at column to messages table

ALTER TABLE messages ADD COLUMN edited_at INTEGER;

-- Optional: track edit history
CREATE TABLE IF NOT EXISTS message_edits (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  previous_content TEXT NOT NULL,
  edited_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_message_edits_message ON message_edits(message_id);
