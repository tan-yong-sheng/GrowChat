-- Phase 2: Knowledge Base management
-- Support for organizing documents into knowledge bases

-- Knowledge bases table - collection of documents for organized RAG
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,  -- 0=private, 1=public (read-only)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Knowledge base files - join table linking documents to knowledge bases
CREATE TABLE IF NOT EXISTS knowledge_files (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE(knowledge_base_id, document_id)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_user_id ON knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_kb_id ON knowledge_files(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_doc_id ON knowledge_files(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_added ON knowledge_files(added_at DESC);
