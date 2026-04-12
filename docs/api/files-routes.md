# File Upload & Document Routes

Source: `src/routers/files.js`

## Overview

File uploads use R2 presigned URLs. Uploads are multipart to R2, then metadata is registered in the `documents` table. Text extraction happens asynchronously for RAG support.

## Routes

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| POST | `/api/files/upload` | `file.upload` | Upload file (multipart/form-data → R2) |
| GET | `/api/files` | (authenticated) | List user's documents |
| GET | `/api/files/search` | (authenticated) | Search user's documents |
| GET | `/api/files/health` | (authenticated) | R2 bucket health check |
| GET | `/api/files/:id` | (owned) | Get document metadata |
| GET | `/api/files/:id/blob` | (owned) | Get raw file contents |
| GET | `/api/files/:id/content` | (owned) | Get safe text representation (extracted) |
| GET | `/api/files/:id/process/status` | (owned) | Get text extraction status |
| DELETE | `/api/files/:id` | `file.delete` | Delete document + R2 file |

## Upload Flow

```
1. POST /api/files/upload → R2 presigned URL
2. Client uploads file directly to R2
3. POST /api/files → register metadata in documents table
4. Async text extraction for RAG (stored in documents.text)
```
