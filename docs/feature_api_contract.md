# GrowChat Backend Feature API Contract

**Date**: 2026-03-06
**Version**: 1.0
**Status**: Complete (Feature Sprint P0-P2)

## Overview

This document describes the new backend API endpoints added in the feature sprint, organized by feature area. All authenticated endpoints require `Authorization: Bearer <token>` header.

## P0: Chat Share & Archive APIs

### 1. Create/Get Share Link
**Endpoint**: `POST /api/chats/:id/share`
**Auth**: Required
**Description**: Create a share link for a chat or get existing share link

**Request**:
```bash
curl -X POST http://localhost:8787/api/chats/{chat_id}/share \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json"
```

**Response** (200):
```json
{
  "share_id": "550e8400-e29b-41d4-a716-446655440000",
  "share_url": "/s/550e8400-e29b-41d4-a716-446655440000",
  "chat_id": "chat-uuid"
}
```

### 2. Revoke Share Link
**Endpoint**: `DELETE /api/chats/:id/share`
**Auth**: Required
**Description**: Remove share link and revoke public access

**Request**:
```bash
curl -X DELETE http://localhost:8787/api/chats/{chat_id}/share \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "ok": true
}
```

### 3. List Shared Chats
**Endpoint**: `GET /api/chats/shared`
**Auth**: Required
**Description**: Get all chats owned by user that have share links

**Request**:
```bash
curl -X GET http://localhost:8787/api/chats/shared \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "chats": [
    {
      "id": "chat-uuid",
      "title": "My Public Chat",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "pinned": 0,
      "tags": [],
      "share_id": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": 1741206000,
      "updated_at": 1741206000
    }
  ]
}
```

### 4. Archive Chat
**Endpoint**: `POST /api/chats/:id/archive`
**Auth**: Required
**Description**: Toggle chat archive state (exclude from default list)

**Request**:
```bash
curl -X POST http://localhost:8787/api/chats/{chat_id}/archive \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "chat": { /* full chat object */ },
  "archived": true
}
```

### 5. List Archived Chats
**Endpoint**: `GET /api/chats/archived`
**Auth**: Required
**Description**: Get all archived chats for user

**Request**:
```bash
curl -X GET http://localhost:8787/api/chats/archived \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "chats": [
    {
      "id": "chat-uuid",
      "title": "Old Chat",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "pinned": 0,
      "tags": [],
      "created_at": 1741206000,
      "updated_at": 1741206000
    }
  ]
}
```

### 6. View Shared Chat (Public)
**Endpoint**: `GET /s/:share_id`
**Auth**: Not Required
**Description**: Retrieve shared chat and messages (read-only, no user_id exposure)

**Request**:
```bash
curl -X GET http://localhost:8787/s/550e8400-e29b-41d4-a716-446655440000
```

**Response** (200):
```json
{
  "chat": {
    "id": "chat-uuid",
    "title": "Shared Chat",
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "created_at": 1741206000,
    "updated_at": 1741206000,
    "message_count": 5
  },
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user",
      "content": "Hello!",
      "model": "@cf/meta/llama-3.1-8b-instruct",
      "created_at": 1741206000
    }
  ],
  "shared": true
}
```

---

## P1: Files Feature Endpoints

### 1. Search Documents
**Endpoint**: `GET /api/files/search?q=&limit=&offset=`
**Auth**: Required
**Description**: Search user's documents by filename

**Query Parameters**:
- `q` (string, optional): Search query (max 200 chars)
- `limit` (integer, optional, default 20): Results per page (1-100)
- `offset` (integer, optional, default 0): Pagination offset

**Request**:
```bash
curl -X GET "http://localhost:8787/api/files/search?q=invoice&limit=20&offset=0" \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "documents": [
    {
      "id": "doc-uuid",
      "filename": "invoice-2026.pdf",
      "content_type": "application/pdf",
      "file_size": 245123,
      "text_excerpt": "Invoice #2026-001...",
      "extraction_status": 1,
      "embedding_generated": 1,
      "created_at": 1741206000,
      "updated_at": 1741206000
    }
  ],
  "query": "invoice",
  "limit": 20,
  "offset": 0
}
```

### 2. Get Processing Status
**Endpoint**: `GET /api/files/:id/process/status`
**Auth**: Required
**Description**: Check extraction and embedding progress

**Request**:
```bash
curl -X GET http://localhost:8787/api/files/{doc_id}/process/status \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "id": "doc-uuid",
  "filename": "document.pdf",
  "extraction": {
    "status": "done",
    "error": null
  },
  "embedding": {
    "status": "pending",
    "error": null
  },
  "created_at": 1741206000,
  "updated_at": 1741206000
}
```

**Status values**: `pending`, `done`, `failed`

### 3. Get Safe Content Representation
**Endpoint**: `GET /api/files/:id/content`
**Auth**: Required
**Description**: Retrieve safe text representation (no binary streaming)

**Request**:
```bash
curl -X GET http://localhost:8787/api/files/{doc_id}/content \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200, Text File):
```json
{
  "id": "doc-uuid",
  "filename": "notes.txt",
  "type": "text/plain",
  "content": "Meeting notes...",
  "extracted": true
}
```

**Response** (200, JSON File):
```json
{
  "id": "doc-uuid",
  "filename": "data.json",
  "type": "application/json",
  "content": { "data": "..." },
  "extracted": true
}
```

**Response** (200, Binary File):
```json
{
  "id": "doc-uuid",
  "filename": "image.png",
  "type": "image/png",
  "content": {
    "filename": "image.png",
    "type": "image/png",
    "status": "extracted",
    "note": "Binary file - text excerpt not available"
  },
  "extracted": false
}
```

---

## P1: Knowledge Base API

### 1. List Knowledge Bases
**Endpoint**: `GET /api/knowledge`
**Auth**: Required
**Description**: List user's knowledge bases

**Query Parameters**:
- `limit` (integer, optional, default 50): Results per page (1-100)
- `offset` (integer, optional, default 0): Pagination offset

**Request**:
```bash
curl -X GET "http://localhost:8787/api/knowledge?limit=50&offset=0" \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "knowledge_bases": [
    {
      "id": "kb-uuid",
      "user_id": "user-uuid",
      "name": "Company FAQs",
      "description": "Frequently asked questions",
      "is_public": 0,
      "created_at": 1741206000,
      "updated_at": 1741206000,
      "file_count": 5
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### 2. Create Knowledge Base
**Endpoint**: `POST /api/knowledge`
**Auth**: Required
**Description**: Create new knowledge base

**Request**:
```bash
curl -X POST http://localhost:8787/api/knowledge \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Company Documentation",
    "description": "Internal docs and guides",
    "is_public": false
  }'
```

**Response** (201):
```json
{
  "knowledge_base": {
    "id": "kb-uuid",
    "user_id": "user-uuid",
    "name": "Company Documentation",
    "description": "Internal docs and guides",
    "is_public": 0,
    "created_at": 1741206000,
    "updated_at": 1741206000
  }
}
```

### 3. Get Knowledge Base Details
**Endpoint**: `GET /api/knowledge/:id`
**Auth**: Required
**Description**: Retrieve specific knowledge base

**Request**:
```bash
curl -X GET http://localhost:8787/api/knowledge/{kb_id} \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "knowledge_base": { /* as above */ }
}
```

### 4. Update Knowledge Base
**Endpoint**: `PUT /api/knowledge/:id`
**Auth**: Required
**Description**: Update KB metadata

**Request**:
```bash
curl -X PUT http://localhost:8787/api/knowledge/{kb_id} \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "is_public": true}'
```

**Response** (200):
```json
{
  "knowledge_base": { /* updated object */ }
}
```

### 5. Delete Knowledge Base
**Endpoint**: `DELETE /api/knowledge/:id`
**Auth**: Required
**Description**: Delete knowledge base (cascade deletes knowledge_files join records)

**Request**:
```bash
curl -X DELETE http://localhost:8787/api/knowledge/{kb_id} \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "ok": true
}
```

### 6. List KB Documents
**Endpoint**: `GET /api/knowledge/:id/files`
**Auth**: Required
**Description**: Get documents in knowledge base

**Request**:
```bash
curl -X GET "http://localhost:8787/api/knowledge/{kb_id}/files?limit=50&offset=0" \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "files": [
    {
      "id": "doc-uuid",
      "filename": "guide.pdf",
      "content_type": "application/pdf",
      "file_size": 123456,
      "extraction_status": 1,
      "embedding_generated": 1,
      "created_at": 1741206000,
      "added_at": 1741206001
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### 7. Add Documents to KB (Batch)
**Endpoint**: `POST /api/knowledge/:id/files/batch/add`
**Auth**: Required
**Description**: Add multiple documents to knowledge base

**Request**:
```bash
curl -X POST http://localhost:8787/api/knowledge/{kb_id}/files/batch/add \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "document_ids": ["doc-uuid-1", "doc-uuid-2", "doc-uuid-3"]
  }'
```

**Response** (200):
```json
{
  "added_count": 3,
  "added_ids": ["doc-uuid-1", "doc-uuid-2", "doc-uuid-3"]
}
```

### 8. Remove Document from KB
**Endpoint**: `DELETE /api/knowledge/:id/files/:fileId`
**Auth**: Required
**Description**: Remove document from knowledge base

**Request**:
```bash
curl -X DELETE http://localhost:8787/api/knowledge/{kb_id}/files/{doc_id} \
  -H "Authorization: Bearer {access_token}"
```

**Response** (200):
```json
{
  "ok": true
}
```

---

## Error Responses

All endpoints return errors in consistent format:

```json
{
  "error": "Human-readable error message"
}
```

**Common HTTP Status Codes**:
- `400` - Invalid request (bad parameters, validation failed)
- `401` - Unauthorized (no valid JWT token)
- `403` - Forbidden (authenticated but insufficient permissions)
- `404` - Resource not found
- `409` - Conflict (e.g., duplicate command name)
- `500` - Server error (database, binding, or LLM issue)

---

## Database Schema

### Migrations Added

- **004_chat_share_archive.sql** - Adds `archived` column to chats, indexes
- **005_knowledge_base.sql** - Creates `knowledge_bases` and `knowledge_files` tables

### Entity Relationships

```
users
├── chats (1:N)
│   ├── share_id (unique, nullable)
│   └── archived (0/1)
├── documents (1:N)
│   └── document_chunks (1:N)
├── knowledge_bases (1:N)
│   └── knowledge_files (1:N) → documents
└── messages (1:N)
    └── message_documents (N:N) → documents
```

---

## Testing

Run the smoke matrix to validate all endpoints:

```bash
BASE_URL=http://localhost:8787 ./scripts/feature_smoke_matrix.sh
```

Expected output: All tests should pass ✓

---

## Frontend Integration Checklist

- [ ] Import `feature_api_contract.md` into frontend documentation
- [ ] Implement chat share/archive UI in sidebar
- [ ] Add public shared chat view
- [ ] Implement knowledge base selector in chat creation
- [ ] Implement file search and processing status in file manager
- [ ] Test all endpoints with frontend client
