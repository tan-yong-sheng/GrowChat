# Phase 2 Implementation - File Manifest

## Summary

Phase 2 adds RAG (Retrieval-Augmented Generation) with Vectorize and file upload management with R2. This document lists all files created, modified, and their purposes.

## Core Service Layer

### New Services

| File | Purpose | Key Functions |
|------|---------|---|
| `src/services/embeddings.js` | Vector embedding & search | `generateEmbedding()`, `upsertFAQ()`, `queryFAQs()`, `queryDocumentChunks()` |
| `src/services/extraction.js` | Document text extraction | `extractText()`, `extractTextFromImage()`, `chunkText()` |
| `src/services/uploads.js` | File validation & R2 ops | `validateFile()`, `uploadFileToR2()`, `storeFileMetadata()` |
| `src/utils/admin.js` | Authorization utilities | `isAdmin()`, `requireAdmin()` |

## API Routers

### New Routers

| File | Routes | Purpose |
|------|--------|---------|
| `src/routers/faqs.js` | `POST /api/admin/faqs`, `GET /api/admin/faqs`, `PUT /api/admin/faqs/:id`, `DELETE /api/admin/faqs/:id`, `GET /api/faqs/search` | FAQ CRUD & semantic search |
| `src/routers/files.js` | `POST /api/files/upload`, `GET /api/files`, `GET /api/files/:id`, `DELETE /api/files/:id` | File upload & document management |
| `src/routers/admin.js` | `GET /api/admin/stats`, `GET /api/admin/faqs/status`, `GET /api/admin/documents/status`, `POST /api/admin/faqs/reindex`, `POST /api/admin/documents/reindex` | Admin statistics & index management |

### Modified Routers

| File | Changes |
|------|---------|
| `src/routers/chat.js` | Added RAG context injection: queries FAQs & documents, injects as system message, tracks citations |
| `src/index.js` | Imported new routers: `faqsRouter`, `filesRouter`, `adminRouter` and added to `API_ROUTES` |

## Database Migrations

| File | Tables Created | Purpose |
|------|-----------------|---------|
| `migrations/002_phase2_faqs.sql` | `faqs`, `faq_usage` | FAQ storage with embedding tracking |
| `migrations/003_phase2_documents.sql` | `documents`, `document_chunks`, `message_documents` | Document storage, chunking, & references |

## Documentation

| File | Purpose |
|------|---------|
| `README.md` | Updated with Phase 2 features, deployment steps, API endpoints |
| `PHASE2_IMPLEMENTATION.md` | Comprehensive technical documentation |
| `PHASE2_QUICKSTART.md` | Quick start guide with cURL examples |
| `PHASE2_MANIFEST.md` | This file - implementation overview |

## Configuration Files

| File | Changes |
|------|---------|
| `wrangler.jsonc` | Uncommented Vectorize binding: `"vectorize": [{"binding": "VECTORIZE", "index_name": "faq-vectors"}]` |
| `package.json` | No changes (existing scripts used) |

## Key Implementation Details

### Service Layer (`src/services/`)

**embeddings.js** (~280 lines)
- `generateEmbedding()` - Workers AI model `@cf/baai/bge-base-en-v1.5` (768-dim vectors)
- `upsertFAQ()` - Async embedding generation with error tracking
- `queryFAQs()` - Vectorize query with similarity filtering
- `deleteFAQEmbedding()` - Vector cleanup
- `upsertDocumentChunks()` - Batch embedding with partial failure handling
- `queryDocumentChunks()` - Document chunk search with metadata loading

**extraction.js** (~170 lines)
- `extractText()` - Route by MIME type (text/markdown/image/pdf)
- `extractTextFromImage()` - Workers AI OCR `@cf/wit/ocr`
- `chunkText()` - Semantic chunking (500-char chunks, 50-char overlap)
- `extractAndChunk()` - Full pipeline with D1 persistence

**uploads.js** (~240 lines)
- `validateFile()` - Size limit (50MB) & MIME type validation
- `uploadFileToR2()` - R2 storage with unique key generation
- `storeFileMetadata()` - D1 document record creation
- `deleteDocument()` - Ownership-verified deletion with cascades

### Router Layer (`src/routers/`)

**faqs.js** (~280 lines)
- Admin CRUD endpoints with async embedding generation
- User-accessible semantic search (`GET /api/faqs/search`)
- Automatic embedding regeneration on FAQ updates

**files.js** (~200 lines)
- Multipart/form-data file upload handler
- Document metadata tracking
- Async text extraction and chunking pipeline
- Pagination support

**admin.js** (~250 lines)
- System statistics aggregation
- Embedding/extraction status reporting by user
- Bulk reindexing operations for recovery

**chat.js** (Modified)
- RAG context injection before LLM call
- FAQ & document chunk queries
- Citation tracking in messages
- System prompt with retrieved context

### Database Schema

**New Tables** (created by migrations)
- `faqs` (1M FAQ records per user)
- `faq_usage` (analytics)
- `documents` (file metadata)
- `document_chunks` (500-char semantic chunks)
- `message_documents` (citation references)

**Status Tracking**
- All extraction/embedding ops track: pending (0), completed (1), failed (-1)
- Error messages stored for debugging

## Integration Points

1. **Auth Layer**: All endpoints require JWT token with role-based access
2. **D1 Database**: Foreign keys enforce referential integrity
3. **R2 Storage**: Unique key generation per user (`/user/{userId}/files/{uuid}.{ext}`)
4. **Vectorize Index**: Cosine similarity search with configurable thresholds
5. **Workers AI**: Both embedding model and OCR model
6. **Context Propagation**: `ctx.waitUntil()` for async background work

## Processing Pipelines

### FAQ Creation (Admin)
```
POST /api/admin/faqs
→ Validate input
→ Insert D1 record (embedding_generated=0)
→ Return 201 immediately
→ [Background] generateEmbedding + upsertFAQ
→ Update D1 status (embedding_generated=1 or -1)
```

### Document Upload (User)
```
POST /api/files/upload
→ Validate file
→ Upload to R2
→ Insert D1 document record
→ Return 201 immediately
→ [Background] extractAndChunk
  → Extract text (direct/OCR)
  → Create chunks in D1
  → [Sub-background] upsertDocumentChunks
```

### Chat with RAG (User)
```
POST /api/chats/:id/messages
→ Insert user message
→ [Parallel] queryFAQs + queryDocumentChunks
→ Build system prompt with context
→ Call LLM with RAG-enhanced history
→ Track citations in response
→ Insert assistant message with citations JSON
```

## Testing Checklist

Before deploying to production:
- [ ] FAQ creation with embedding generation
- [ ] FAQ semantic search with similarity filtering
- [ ] FAQ update with embedding regeneration
- [ ] FAQ deletion with vector cleanup
- [ ] File upload with extraction
- [ ] Document metadata retrieval
- [ ] Document deletion with R2 cleanup
- [ ] Chat message with RAG context
- [ ] Citation tracking in messages
- [ ] Admin statistics aggregation
- [ ] Embedding status reporting
- [ ] Reindexing operations
- [ ] Error handling for failed extractions
- [ ] Graceful degradation when Vectorize unavailable

## Performance Characteristics

| Operation | Expected Time | Async? |
|-----------|---------------|--------|
| FAQ creation | <100ms | Embedding async |
| File upload (1MB) | <500ms | Extraction async |
| FAQ search (top-3) | <200ms | Sync |
| Document search (top-5) | <200ms | Sync |
| Text extraction (1MB) | 2-5s | Background |
| Embedding generation (1 item) | 500-1000ms | Background |
| Chat message with RAG | <1s response | RAG queries sync |

## Cloudflare Resource Usage

### R2
- Storage: One file per upload (user-managed)
- Operations: GET on upload, PUT for retrieval, DELETE on document removal
- Pricing: Pay per GB stored + per 1M API calls

### Vectorize
- Vectors: One per FAQ + one per document chunk
- Dimensions: 768 (bge-base-en-v1.5 model)
- Index: `faq-vectors` (cosine similarity)
- Queries: One per chat message (FAQ + documents)
- Pricing: Pay per vector + per 1M query operations

### D1
- Storage: FAQs + documents + chunks metadata
- Queries: CRUD per admin op, queries during chat
- Pricing: Included in Workers plan (up to limits)

### Workers AI
- Embeddings: `@cf/baai/bge-base-en-v1.5` (768-dim)
- OCR: `@cf/wit/ocr` (images only)
- Pricing: Included in Workers plan (monthly quota)

## Deployment Checklist

Before `npm run deploy`:
- [ ] R2 bucket created: `wrangler r2 bucket create growchat-files`
- [ ] Vectorize index created: `wrangler vectorize create faq-vectors --dimensions=768 --metric=cosine`
- [ ] `wrangler.jsonc` has R2 and Vectorize bindings
- [ ] Env vars set: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `JWT_SECRET`
- [ ] Migrations files exist: `002_phase2_faqs.sql`, `003_phase2_documents.sql`
- [ ] CSS built: `npm run build:css`
- [ ] All files in place (see manifest above)

## Known Limitations & Deferred Items

- **PDF Support**: Deferred to Phase 3 (currently text/markdown/images only)
- **Max File Size**: 50MB (configurable in `validateFile()`)
- **Vectorize Results**: Max 10 per query (Vectorize API limit)
- **Chunk Overlap**: Fixed at 50 chars (could be parameterized)
- **OCR Quality**: Depends on image quality and Workers AI model
- **Embedding Model**: Fixed at BGE base (could support multiple models)

## Migration from Phase 1

Phase 2 is backward compatible with Phase 1:
- Existing chats, messages, users unchanged
- New tables added via migrations (non-destructive)
- Chat endpoint enhanced with RAG (gracefully degrades if unavailable)
- Citations field added to messages (nullable for existing messages)
- Admin routers require admin role (existing users unaffected)

To preserve existing chat data during deployment:
1. Run Phase 1 migrations (auto on first deploy)
2. Run Phase 2 migrations (auto on subsequent deploy)
3. No data loss - all existing chats/messages preserved
4. New features available immediately upon deployment

## File Statistics

- **New Files**: 7 (services: 3, routers: 3, utilities: 1)
- **Modified Files**: 3 (chat router, main index, README)
- **Migrations**: 2 (faqs, documents)
- **Docs**: 3 (implementation, quickstart, manifest)
- **Total New Lines**: ~2000 lines of production code
- **Database Tables**: 5 new tables (with indexes)
- **API Endpoints**: 13 new endpoints (9 admin/user, 4 search/stat)
