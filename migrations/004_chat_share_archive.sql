-- Phase 2: Chat sharing and archiving features
-- Adds support for sharing chats publicly and archiving conversations

-- Add archived column to chats table (idempotent)
-- This tracks whether a chat is archived (excluded from default list)
ALTER TABLE chats ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

-- Add index for efficient filtering of non-archived chats
CREATE INDEX IF NOT EXISTS idx_chats_archived ON chats(user_id, archived);

-- Index for finding shared chats
CREATE INDEX IF NOT EXISTS idx_chats_shared ON chats(user_id, share_id) WHERE share_id IS NOT NULL;

-- Index for archived chats lookup
CREATE INDEX IF NOT EXISTS idx_chats_archived_user ON chats(user_id) WHERE archived = 1;
