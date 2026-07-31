# File Upload APIs

## `POST /api/files/upload`
**Responsibility**: Generates an R2 presigned URL and uploads the file directly from the client.

### Request (Multipart Form-Data)
- `file` (binary)
- Requires `file.upload` permission.

### Internal Calls & Side Effects
- Uploads directly to Cloudflare R2.
- Creates an entry in the `documents` database table with the `storage_key`.
- Document rows are inserted with `extraction_status = 1` (done); no async extraction job is scheduled.

---

## `GET /api/files/:id/blob`
**Responsibility**: Fetches the raw file object from R2.

### Response
- Raw binary stream with the original `content_type`.

---

## `GET /api/files/:id/content`
**Responsibility**: Returns the safely extracted, plain-text representation of a document. Used by the LLM Context injection system for Retrieval-Augmented Generation (RAG).

### Side Effects
- For text-like files (`text/*`, `application/json`, `.txt`, `.md`, `.csv`, etc.), the handler reads the stored blob from R2 on demand, decodes it as UTF-8, and returns the parsed content truncated to the first 500 characters.
- For JSON types, the response is the parsed JSON object, also bounded to the first 500 characters of decoded text.
- For binary files, the response is a status object indicating the file type and that no text preview is available.