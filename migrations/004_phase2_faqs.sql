-- Phase 2: RAG with Vectorize
-- FAQ management and embeddings tracking

CREATE TABLE IF NOT EXISTS faqs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  tags TEXT DEFAULT '[]',          -- JSON array of tags
  vector_id TEXT,                   -- Vectorize ID for embedding
  embedding_generated INTEGER DEFAULT 0,  -- 0=pending, 1=done, -1=failed
  embedding_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS faq_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT,
  faq_id TEXT NOT NULL,
  relevance_score REAL,            -- Cosine similarity from Vectorize
  used_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE SET NULL,
  FOREIGN KEY(faq_id) REFERENCES faqs(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_faqs_user_id ON faqs(user_id);
CREATE INDEX IF NOT EXISTS idx_faqs_embedding_status ON faqs(embedding_generated);
CREATE INDEX IF NOT EXISTS idx_faq_usage_faq_id ON faq_usage(faq_id);
CREATE INDEX IF NOT EXISTS idx_faq_usage_chat_id ON faq_usage(chat_id);
CREATE INDEX IF NOT EXISTS idx_faq_usage_used_at ON faq_usage(used_at DESC);

-- Update messages table to include citations
ALTER TABLE messages ADD COLUMN citations TEXT;  -- JSON array of FAQ IDs used as citations
