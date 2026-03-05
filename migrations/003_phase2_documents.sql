-- Phase 2: File uploads with R2
-- Document storage and management

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT,                    -- Can associate with chat
  filename TEXT NOT NULL,
  content_type TEXT,               -- "text/plain", "image/png", "image/jpeg", "application/pdf"
  file_size INTEGER,               -- bytes
  r2_key TEXT NOT NULL,            -- R2 object path: /user/{userId}/files/{uuid}.{ext}
  r2_url TEXT,                     -- Signed retrieval URL (updated periodically)
  text_excerpt TEXT,               -- First 500 chars of extracted text
  extraction_status INTEGER DEFAULT 0,  -- 0=pending, 1=done, -1=failed
  extraction_error TEXT,
  embedding_generated INTEGER DEFAULT 0,  -- 0=pending, 1=done, -1=failed
  embedding_error TEXT,
  tags TEXT DEFAULT '[]',          -- JSON array of tags
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE SET NULL
);

-- Document chunks for semantic search
-- Each document can be split into multiple chunks (e.g., paragraphs)
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER,             -- 0, 1, 2, ... for ordering
  chunk_text TEXT NOT NULL,        -- 500-char chunks with 50-char overlap
  vector_id TEXT,                  -- Vectorize ID for embedding
  embedding_generated INTEGER DEFAULT 0,
  embedding_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Message-to-document references
-- Track which documents are referenced in which messages
CREATE TABLE IF NOT EXISTS message_documents (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  mention_type TEXT,               -- "reference", "analysis", "source"
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_extraction_status ON documents(extraction_status);
CREATE INDEX IF NOT EXISTS idx_documents_embedding_status ON documents(embedding_generated);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_status ON document_chunks(embedding_generated);
CREATE INDEX IF NOT EXISTS idx_msg_docs_message_id ON message_documents(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_docs_document_id ON message_documents(document_id);
