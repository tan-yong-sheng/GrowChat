-- Custom Models Table Migration
-- Stores custom LLM model configurations as D1 fallback
-- Primary storage is in KV (CACHE binding) for scalability
-- This table serves as a legacy/backfill option

CREATE TABLE IF NOT EXISTS custom_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  description TEXT,
  max_tokens INTEGER DEFAULT 4096,
  temperature REAL DEFAULT 0.7,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_custom_models_provider ON custom_models(provider);
CREATE INDEX IF NOT EXISTS idx_custom_models_created_at ON custom_models(created_at DESC);
