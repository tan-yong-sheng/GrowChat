-- Phase 2: Prompt templates
-- System and user prompts for reusable instructions

-- Prompts table - reusable prompt templates
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  command TEXT,                        -- Unique identifier for lookup (e.g., "translate", "summarize")
  category TEXT DEFAULT 'general',     -- Category for organization (e.g., "writing", "analysis")
  is_global INTEGER NOT NULL DEFAULT 0,-- 0=user, 1=admin-managed global prompts
  is_active INTEGER NOT NULL DEFAULT 1,-- 0=inactive, 1=active (for soft-delete)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, command) -- Ensure unique command per user (or global)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_command ON prompts(command);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_active ON prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_prompts_user_active ON prompts(user_id, is_active) WHERE is_active = 1;
