# File Upload APIs

## `POST /api/files/upload`
**Responsibility**: Generates an R2 presigned URL and uploads the file directly from the client.

### Request (Multipart Form-Data)
- `file` (binary)
- Requires `file.upload` permission.

### Internal Calls & Side Effects
- Uploads directly to Cloudflare R2.
- Creates an entry in the `documents` database table with the `storage_key`.
- Background Trigger: Initiates an async text-extraction job for RAG processing.

---

## `GET /api/files/:id/blob`
**Responsibility**: Fetches the raw file object from R2.

### Response
- Raw binary stream with the original `content_type`.

---

## `GET /api/files/:id/content`
**Responsibility**: Returns the safely extracted, plain-text representation of a document. Used by the LLM Context injection system for Retrieval-Augmented Generation (RAG).

### Side Effects
- Reads the `documents.text` column, which was populated asynchronously by the extraction job.
