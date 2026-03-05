# Phase 2 Quick Start Guide

## Prerequisites

Ensure Phase 1 is fully deployed. Phase 2 adds:
- R2 bucket for file storage
- Vectorize index for semantic search
- D1 tables for FAQs and documents

## Setup

### 1. Create R2 Bucket

```bash
wrangler r2 bucket create growchat-files
```

Update `wrangler.jsonc`:
```jsonc
"r2_buckets": [
  {
    "binding": "FILES",
    "bucket_name": "growchat-files"
  }
]
```

### 2. Create Vectorize Index

```bash
wrangler vectorize create faq-vectors --dimensions=768 --metric=cosine
```

Update `wrangler.jsonc`:
```jsonc
"vectorize": [
  {
    "binding": "VECTORIZE",
    "index_name": "faq-vectors"
  }
]
```

### 3. Deploy

```bash
npm run deploy
```

Migrations apply automatically. Monitor the deployment:
```
✓ Deployed worker to https://your-worker.workers.dev
```

## Features

### FAQ Management

#### Create FAQ (Admin)
```bash
curl -X POST https://your-worker/api/admin/faqs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is GrowChat?",
    "answer": "GrowChat is an AI chatbot built on Cloudflare Workers.",
    "category": "General",
    "tags": ["product", "intro"]
  }'
```

Response:
```json
{
  "id": "faq-123",
  "question": "What is GrowChat?",
  "answer": "GrowChat is...",
  "category": "General",
  "tags": ["product", "intro"],
  "embedding_generated": 0,
  "created_at": 1709637600
}
```

*Note: `embedding_generated: 0` means embedding is being processed. Check status with `GET /api/admin/faqs` to see when it completes.*

#### List FAQs (Admin)
```bash
curl https://your-worker/api/admin/faqs?limit=20&offset=0 \
  -H "Authorization: Bearer $TOKEN"
```

#### Search FAQs (User)
```bash
curl "https://your-worker/api/faqs/search?q=What+is+GrowChat" \
  -H "Authorization: Bearer $TOKEN"
```

Response includes similarity scores:
```json
{
  "faqs": [
    {
      "id": "faq-123",
      "question": "What is GrowChat?",
      "answer": "...",
      "similarity_score": 0.89
    }
  ]
}
```

#### Update FAQ (Admin)
```bash
curl -X PUT https://your-worker/api/admin/faqs/faq-123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is GrowChat?",
    "answer": "GrowChat is an enterprise AI chatbot platform...",
    "category": "General"
  }'
```

#### Delete FAQ (Admin)
```bash
curl -X DELETE https://your-worker/api/admin/faqs/faq-123 \
  -H "Authorization: Bearer $TOKEN"
```

### File Uploads

#### Upload Document
```bash
curl -X POST https://your-worker/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf" \
  -F "chat_id=optional-chat-id"
```

Response:
```json
{
  "id": "doc-456",
  "filename": "document.pdf",
  "content_type": "application/pdf",
  "file_size": 102400,
  "r2_key": "/user/user-123/files/doc-456.pdf",
  "r2_url": "https://...",
  "extraction_status": 0,
  "embedding_generated": 0,
  "created_at": 1709637600
}
```

Supported file types:
- Text: `text/plain`, `text/markdown`
- Images: `image/jpeg`, `image/png`, `image/webp` (OCR via Workers AI)
- PDF: `application/pdf` (Phase 3)

Max file size: 50MB

#### List Documents
```bash
curl https://your-worker/api/files?limit=20&offset=0 \
  -H "Authorization: Bearer $TOKEN"
```

#### Get Document Details
```bash
curl https://your-worker/api/files/doc-456 \
  -H "Authorization: Bearer $TOKEN"
```

Check extraction status:
- `extraction_status: 0` = Processing
- `extraction_status: 1` = Complete
- `extraction_status: -1` = Failed (check `extraction_error`)

#### Delete Document
```bash
curl -X DELETE https://your-worker/api/files/doc-456 \
  -H "Authorization: Bearer $TOKEN"
```

### Chat with RAG Context

When you send a message, the system automatically:
1. Queries relevant FAQs (top-3, similarity > 0.5)
2. Queries document chunks (top-5, similarity > 0.5)
3. Injects context into LLM prompt
4. Tracks citations in response

#### Send Message
```bash
curl -X POST https://your-worker/api/chats/chat-123/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is GrowChat?"
  }'
```

The LLM response will include context from your FAQs and documents.

#### Check Citations
```bash
curl https://your-worker/api/chats/chat-123 \
  -H "Authorization: Bearer $TOKEN"
```

Messages now include `citations` field with FAQ IDs used:
```json
{
  "messages": [
    {
      "id": "msg-789",
      "role": "assistant",
      "content": "GrowChat is...",
      "citations": ["faq-123", "faq-124"]
    }
  ]
}
```

## Admin Panel

### View Statistics
```bash
curl https://your-worker/api/admin/stats \
  -H "Authorization: Bearer $TOKEN"
```

Response:
```json
{
  "stats": {
    "total_users": 42,
    "total_chats": 156,
    "total_messages": 3421,
    "user_faqs": 12,
    "user_documents": 8,
    "active_sessions": 5,
    "timestamp": "2026-03-05T19:30:00Z"
  }
}
```

### Check FAQ Embedding Status
```bash
curl https://your-worker/api/admin/faqs/status \
  -H "Authorization: Bearer $TOKEN"
```

### Check Document Processing Status
```bash
curl https://your-worker/api/admin/documents/status \
  -H "Authorization: Bearer $TOKEN"
```

Includes separate counts for:
- **Extraction** (text extraction from documents): pending/completed/failed
- **Embedding** (vector generation): pending/completed/failed

### Reindex FAQs
If you need to regenerate embeddings for all FAQs:
```bash
curl -X POST https://your-worker/api/admin/faqs/reindex \
  -H "Authorization: Bearer $TOKEN"
```

### Reindex Documents
Regenerate embeddings for all document chunks:
```bash
curl -X POST https://your-worker/api/admin/documents/reindex \
  -H "Authorization: Bearer $TOKEN"
```

## Troubleshooting

### FAQ Embedding Not Generating

Check status:
```bash
curl https://your-worker/api/admin/faqs/status \
  -H "Authorization: Bearer $TOKEN"
```

If `failed > 0`, manually reindex:
```bash
curl -X POST https://your-worker/api/admin/faqs/reindex \
  -H "Authorization: Bearer $TOKEN"
```

### Document Extraction Failed

Check status:
```bash
curl https://your-worker/api/admin/documents/status \
  -H "Authorization: Bearer $TOKEN"
```

Common causes:
- Unsupported file type (only text, markdown, images in Phase 2)
- File too large (max 50MB)
- OCR failed on poor quality image

Retry:
```bash
curl -X DELETE https://your-worker/api/files/doc-456 \
  -H "Authorization: Bearer $TOKEN"
# Then re-upload
```

### RAG Context Not Appearing in Chat

1. Verify FAQs are indexed:
   ```bash
   curl https://your-worker/api/faqs/search?q=test \
     -H "Authorization: Bearer $TOKEN"
   ```

2. Verify documents are extracted:
   ```bash
   curl https://your-worker/api/files \
     -H "Authorization: Bearer $TOKEN"
   ```

3. Check similarity threshold (default 0.5):
   ```bash
   # Try with lower threshold
   curl "https://your-worker/api/faqs/search?q=test&minsimilarity=0.3" \
     -H "Authorization: Bearer $TOKEN"
   ```

### Worker Deployment Issues

```bash
# Verify bindings are configured
wrangler deployments tail
```

Look for errors related to:
- R2 binding (FILES)
- Vectorize binding (VECTORIZE)
- D1 binding (DB)

## Next Steps

1. Create 5-10 FAQs for your use case
2. Upload sample documents
3. Send messages and verify RAG context appears
4. Check admin panel for statistics
5. Monitor processing status for async operations
6. Phase 3: Add PDF support and advanced analytics

For detailed implementation docs, see [PHASE2_IMPLEMENTATION.md](./PHASE2_IMPLEMENTATION.md)
