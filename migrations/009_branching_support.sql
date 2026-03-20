-- Migration: Add branching and regenerate support (Phase 3)
-- Adds parent_id to messages for tree structure
-- Adds current_message_id to chats to track active branch

-- Add parent_id column to messages table (nullable for backward compatibility)
ALTER TABLE messages ADD COLUMN parent_id TEXT DEFAULT NULL;

-- Add index for efficient parent lookups in chat branching
CREATE INDEX IF NOT EXISTS idx_messages_chat_parent_id ON messages(chat_id, parent_id);

-- Add current_message_id to chats table (tracks active branch/thread)
ALTER TABLE chats ADD COLUMN current_message_id TEXT DEFAULT NULL;

-- Index for potential filters on current_message_id
CREATE INDEX IF NOT EXISTS idx_chats_current_message_id ON chats(current_message_id);
