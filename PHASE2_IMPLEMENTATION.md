# Phase 2 Implementation Summary

## Overview

Phase 2 implements **Retrieval-Augmented Generation (RAG)** with Cloudflare Vectorize and **file upload management** with R2 storage. The system now integrates semantic search into chat responses, allowing the LLM to reference FAQs and document content.

## Architecture

### RAG Pipeline

```
User Message
    ↓
Query Vectorize (FAQs + Document Chunks)
    ↓
Retrieve Relevant Context (top-k by cosine similarity)
    ↓
Inject into LLM Prompt as System Context
    ↓
Generate Response with Citations
    ↓
Store Message with FAQ IDs as Citations
```

### Data Flow

**File Upload:**
```
Upload File → Validate → Store in R2 → Extract Text → Chunk Text → Generate Embeddings → Store Vectors
```

**FAQ Management:**
```
Create FAQ → Generate Embedding → Upsert to Vectorize → Track Status in D1
```

**Chat with RAG:**
```
User Message → Query FAQs + Documents → Build Context → Call LLM → Track Citations → Return Response
```

## New Database Tables (D1)

### `faqs` Table
```sql
CREATE TABLE faqs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  tags TEXT DEFAULT '[]',
  vector_id TEXT,
  embedding_generated INTEGER DEFAULT 0,  -- 0=pending, 1=done, -1=failed
  embedding_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### `documents` Table
```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT,
  filename TEXT NOT NULL,
  content_type TEXT,
  file_size INTEGER,
  r2_key TEXT NOT NULL,
  r2_url TEXT,
  text_excerpt TEXT,
  extraction_status INTEGER DEFAULT 0,  -- 0=pending, 1=done, -1=failed
  extraction_error TEXT,
  embedding_generated INTEGER DEFAULT 0,
  embedding_error TEXT,
  tags TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE SET NULL
);
```

### `document_chunks` Table
```sql
CREATE TABLE document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER,
  chunk_text TEXT NOT NULL,
  vector_id TEXT,
  embedding_generated INTEGER DEFAULT 0,
  embedding_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

### `message_documents` Table
```sql
CREATE TABLE message_documents (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  mention_type TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

### `faq_usage` Table
```sql
CREATE TABLE faq_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chat_id TEXT,
  faq_id TEXT NOT NULL,
  relevance_score REAL,
  used_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE SET NULL,
  FOREIGN KEY(faq_id) REFERENCES faqs(id) ON DELETE CASCADE
);
```

## New Services

### `src/services/embeddings.js`
Handles embedding generation and vector operations:
- `generateEmbedding(env, text)` - Generate 768-dim vector via Workers AI
- `upsertFAQ(env, db, faqId, question, answer, metadata)` - Create/update FAQ embedding
- `queryFAQs(env, db, query, topK, minSimilarity)` - Semantic search FAQs
- `deleteFAQEmbedding(env, faqId)` - Remove FAQ vector
- `upsertDocumentChunks(env, db, chunks)` - Batch embed document chunks
- `queryDocumentChunks(env, db, query, topK, minSimilarity)` - Search document chunks

### `src/services/extraction.js`
Handles document text extraction and chunking:
- `extractText(env, contentType, buffer)` - Route extraction by MIME type
- `extractTextFromImage(env, buffer)` - OCR via Workers AI
- `chunkText(text, chunkSize, overlap)` - Create semantic chunks
- `extractAndChunk(env, db, documentId, contentType, buffer)` - Full pipeline

### `src/services/uploads.js`
Handles file validation and R2 operations:
- `validateFile(filename, contentType, fileSize)` - Validate file constraints
- `uploadFileToR2(env, userId, filename, contentType, buffer)` - Store in R2
- `deleteFileFromR2(env, r2Key)` - Remove R2 object
- `storeFileMetadata(db, fileMetadata)` - Insert document record
- `getFileMetadata(db, documentId)` - Retrieve document
- `listUserDocuments(db, userId, limit, offset)` - Paginated list
- `deleteDocument(env, db, documentId, userId)` - Delete with cascade

## New Routers

### `src/routers/faqs.js`
FAQ management endpoints:
- `POST /api/admin/faqs` - Create FAQ (generates embedding async)
- `GET /api/admin/faqs` - List user's FAQs
- `PUT /api/admin/faqs/:id` - Update FAQ (regenerates embedding)
- `DELETE /api/admin/faqs/:id` - Delete FAQ and vector
- `GET /api/faqs/search?q=query` - Semantic search (user-accessible)

### `src/routers/files.js`
File and document management:
- `POST /api/files/upload` - Upload file (multipart/form-data)
- `GET /api/files` - List documents with pagination
- `GET /api/files/:id` - Get document metadata
- `DELETE /api/files/:id` - Delete document (ownership verified)

### `src/routers/admin.js`
Admin statistics and management:
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/faqs/status` - FAQ embedding status
- `GET /api/admin/documents/status` - Document extraction/embedding status
- `POST /api/admin/faqs/reindex` - Regenerate all FAQ embeddings
- `POST /api/admin/documents/reindex` - Regenerate all document embeddings

## Chat Integration

Updated `src/routers/chat.js` to include RAG context:

1. When user sends a message, the system:
   - Queries FAQs for similar content (top-3, min similarity 0.5)
   - Queries document chunks (top-5, min similarity 0.5)
   - Builds a system prompt with relevant context
   - Injects into LLM history as system message

2. LLM response includes context in its generation

3. Citations (FAQ IDs) are tracked and stored with the message

## Vector Embeddings

- **Model**: `@cf/baai/bge-base-en-v1.5` (768 dimensions)
- **Index**: Cloudflare Vectorize with cosine similarity
- **Similarity Threshold**: 0.5 (configurable per query)
- **Text Truncation**: 8192 tokens max per embedding

## Document Processing

### Supported File Types
- **Text**: `text/plain` - Direct extraction
- **Markdown**: `text/markdown` - Direct extraction
- **Images**: `image/jpeg`, `image/png`, `image/webp` - OCR via Workers AI
- **PDF**: `application/pdf` - Phase 3 (deferred)

### Chunking Strategy
- **Chunk Size**: 500 characters
- **Overlap**: 50 characters (preserves context across chunks)
- **Overlap Example**:
  ```
  Chunk 1: [char 0-500]
  Chunk 2: [char 450-950]  (50 char overlap)
  Chunk 3: [char 900-1400] (50 char overlap)
  ```

## Status Tracking

All embedding and extraction operations track status in D1:
- `0` = Pending (async work queued)
- `1` = Completed successfully
- `-1` = Failed (error message stored)

This allows admins to identify and retry failed processing.

## Authorization

- **Public endpoints**: None (all require auth)
- **User endpoints**: `GET /api/faqs/search`, file operations
- **Admin endpoints**: FAQ CRUD, document management, admin stats
- **Authorization**: JWT token with `role` claim (admin/user)

## Asynchronous Processing

File uploads, text extraction, and embedding generation use `ctx.waitUntil()` to avoid blocking the response:

1. File uploaded → Returns immediately
2. Text extraction queued → Runs in background
3. Embedding generation queued → Runs in background
4. Status tracked in D1 for admin visibility

This keeps response times <1s even for large documents.

## Error Handling

- **Validation failures**: Return 400 with error message
- **Authorization failures**: Return 403 (admin only)
- **Resource not found**: Return 404
- **Processing failures**: Mark document as failed (-1), store error message
- **RAG unavailable**: Graceful degradation - continue chat without context
- **Vectorize unavailable**: Return empty search results

## Performance Optimizations

1. **Batch Embedding Generation**: Multiple document chunks embedded in parallel
2. **Pagination**: Document and FAQ lists paginated (default 20, max 100)
3. **Similarity Filtering**: Results filtered by cosine similarity threshold
4. **Text Truncation**: Embeddings truncated to 8192 tokens
5. **Error Handling**: Non-fatal R2 deletion errors don't block processing
6. **Graceful Degradation**: Missing RAG sources don't break chat

## Testing Checklist

- [ ] Create FAQ via `POST /api/admin/faqs`
- [ ] Verify FAQ embedding generated (check status)
- [ ] Search FAQs via `GET /api/faqs/search?q=test`
- [ ] Upload document via `POST /api/files/upload`
- [ ] Verify text extraction and chunking
- [ ] Verify embeddings generated for chunks
- [ ] Send chat message and verify RAG context injected
- [ ] Verify citations tracked in message
- [ ] Update FAQ and verify embedding regenerated
- [ ] Delete FAQ and verify vector removed
- [ ] Delete document and verify R2 file removed
- [ ] Check admin stats via `GET /api/admin/stats`
- [ ] Check FAQ status via `GET /api/admin/faqs/status`
- [ ] Check document status via `GET /api/admin/documents/status`
- [ ] Trigger reindexing via `POST /api/admin/faqs/reindex`

## Deployment Prerequisites

Before deploying, ensure:
1. R2 bucket created: `wrangler r2 bucket create growchat-files`
2. Vectorize index created: `wrangler vectorize create faq-vectors --dimensions=768 --metric=cosine`
3. Bindings configured in `wrangler.jsonc`:
   ```jsonc
   "r2_buckets": [
     {
       "binding": "FILES",
       "bucket_name": "growchat-files"
     }
   ],
   "vectorize": [
     {
       "binding": "VECTORIZE",
       "index_name": "faq-vectors"
     }
   ]
   ```
4. D1 migrations applied (auto-applied on first deploy)

## Known Limitations

- **PDF Support**: Deferred to Phase 3
- **Max File Size**: 50MB (configurable in `validateFile()`)
- **Vectorize Query**: Returns max 10 results (limit in Vectorize API)
- **Chunk Overlap**: Fixed at 50 characters (could be optimized)
- **OCR Accuracy**: Depends on image quality and Workers AI model

## Future Enhancements (Phase 3+)

- PDF extraction with proper text layout preservation
- Fine-tuned embedding model selection
- Document reranking with cross-encoders
- Custom RAG prompt engineering
- Citation generation from chunk metadata
- Document versioning and diffs
- Advanced analytics dashboards
