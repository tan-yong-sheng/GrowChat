CREATE TABLE IF NOT EXISTS model_access (
  model_id TEXT PRIMARY KEY,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_model_access_enabled ON model_access (is_enabled);
