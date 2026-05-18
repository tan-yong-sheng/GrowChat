# GrowChat

A multi-user Cloudflare Workers chat application with support for multiple LLM providers.

## Features

✅ **Phase 1 (Deployed)**

- User authentication with JWT tokens and refresh token rotation
- Multi-user chat management with persistent D1 database
- Streaming LLM responses via Server-Sent Events (SSE)
- Support for Workers AI and OpenAI-compatible APIs
- PBKDF2 password hashing with Web Crypto
- Responsive web UI built with vanilla JS and Tailwind CSS

✅ **Phase 2 (In Progress)**

- RAG with Cloudflare Vectorize for FAQ and document vector search
- File uploads with R2 cloud storage
- Document text extraction (plain text, markdown, images with OCR)
- Semantic chunking for document embeddings
- Admin panel for managing FAQs and documents
- Citation tracking for LLM responses
- Vector index management and reindexing

🚀 **Phase 3 (Planned)**

- PDF file support
- Testing infrastructure
- Chat sharing and exports
- Advanced analytics dashboard

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account with:
  - Workers (free tier)
  - D1 database (free tier)
  - KV namespaces (free tier)
  - Workers AI (free tier)

### Installation

```bash
git clone https://github.com/tan-yong-sheng/GrowChat.git
cd GrowChat
pnpm install
```

### Local Development

```bash
pnpm run dev
```

Open `http://localhost:8787` in your browser.

### Deployment

1. **Create D1 Database**

   ```bash
   wrangler d1 create growchat
   ```

   Copy the database ID from the output into `wrangler.jsonc`.

2. **Create KV Namespaces**

   ```bash
   wrangler kv:namespace create SESSIONS
   wrangler kv:namespace create CHAT_SESSIONS
   wrangler kv:namespace create CACHE
   ```

   Update `wrangler.jsonc` with the namespace IDs.

3. **Create R2 Bucket (Phase 2)**

   ```bash
   wrangler r2 bucket create growchat-files
   ```

   Update `wrangler.jsonc` with the bucket name and binding.

4. **Create Vectorize Index (Phase 2)**

   ```bash
   wrangler vectorize create faq-vectors --dimensions=768 --metric=cosine
   ```

   Update `wrangler.jsonc` with the index name and binding.

5. **Set Secrets**

   ```bash
   wrangler secret put JWT_SECRET
   wrangler secret put OPENAI_API_KEY
   wrangler secret put OPENAI_BASE_URL
   ```

6. **Deploy**

   ```bash
   pnpm run deploy
   ```

7. **Apply D1 Migrations**
   D1 migrations are applied automatically on first deployment. For manual execution:
   ```bash
   wrangler d1 execute growchat --file=./migrations/001_initial.sql
   wrangler d1 execute growchat --file=./migrations/002_phase2_faqs.sql
   wrangler d1 execute growchat --file=./migrations/003_phase2_documents.sql
   ```

## Architecture

See [AGENTS.md](./AGENTS.md) for detailed architecture documentation and [ADR 003](./docs/adr/003-workspace-settings-boundaries.md) for the shared workspace settings boundary split.

### Core Components

- **Backend**: Cloudflare Worker (`src/index.js`) with D1 database
- **Frontend**: Vanilla JS SPA with localStorage auth state
- **LLM Integration**: Pluggable model support (Workers AI + OpenAI-compatible)
- **Database**: SQLite with users, chats, messages tables
- **Authentication**: JWT tokens with refresh token rotation

## API Routes

All routes (except auth) require `Authorization: Bearer <token>` header.

### Authentication

- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login and get tokens
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout

### Users

- `GET /api/users/me` - Get current user
- `PUT /api/users/me` - Update profile

### Chats

- `GET /api/chats` - List chats
- `POST /api/chats` - Create chat
- `GET /api/chats/:id` - Get chat with messages
- `PUT /api/chats/:id` - Update chat
- `DELETE /api/chats/:id` - Delete chat
- `POST /api/chats/:id/messages` - Send message (streams LLM response via SSE with RAG context)

### FAQs (Admin)

- `POST /api/admin/faqs` - Create FAQ with embedding
- `GET /api/admin/faqs` - List user's FAQs
- `PUT /api/admin/faqs/:id` - Update FAQ and embedding
- `DELETE /api/admin/faqs/:id` - Delete FAQ
- `GET /api/faqs/search?q=query` - Search FAQs (semantic search, user-accessible)

### Files & Documents

- `POST /api/files/upload` - Upload file to R2 with extraction
- `GET /api/files` - List user's documents
- `GET /api/files/:id` - Get document metadata
- `DELETE /api/files/:id` - Delete document and R2 file

### Admin Panel

- `GET /api/admin/stats` - System statistics
- `GET /api/admin/faqs/status` - FAQ embedding status
- `GET /api/admin/documents/status` - Document extraction/embedding status
- `POST /api/admin/faqs/reindex` - Regenerate all FAQ embeddings
- `POST /api/admin/documents/reindex` - Regenerate all document embeddings

## Configuration

### Environment Variables

```env
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...  # Set via wrangler secret
DEFAULT_MODEL=gpt-4
JWT_SECRET=...  # Set via wrangler secret
```

### Model Selection

The system checks for models in this order:

1. User-provided model in request
2. Chat's stored model
3. `DEFAULT_MODEL` environment variable
4. Falls back to `@cf/meta/llama-3.1-8b-instruct` (free Workers AI)

## Database Schema

```sql
users
  id (UUID)
  email (unique)
  password_hash (PBKDF2)
  name
  role (admin|user)
  settings (JSON)
  created_at, updated_at

chats
  id (UUID)
  user_id (foreign key)
  title
  model
  pinned (0|1)
  tags (JSON array)
  created_at, updated_at

messages
  id (UUID)
  chat_id (foreign key)
  role (user|assistant)
  content
  model
  citations (JSON array of FAQ IDs)
  created_at

faqs (Phase 2)
  id (UUID)
  user_id (foreign key)
  question
  answer
  category
  tags (JSON array)
  vector_id (Vectorize ID)
  embedding_generated (0=pending, 1=done, -1=failed)
  created_at, updated_at

documents (Phase 2)
  id (UUID)
  user_id (foreign key)
  chat_id (optional, foreign key)
  filename
  content_type (text/plain, text/markdown, image/*, application/pdf)
  file_size (bytes)
  r2_key (R2 storage path)
  r2_url (signed retrieval URL)
  text_excerpt (first 500 chars of extracted text)
  extraction_status (0=pending, 1=done, -1=failed)
  embedding_generated (0=pending, 1=done, -1=failed)
  created_at, updated_at

document_chunks (Phase 2)
  id (UUID)
  document_id (foreign key)
  chunk_index (order within document)
  chunk_text (500-char semantic chunks with 50-char overlap)
  vector_id (Vectorize ID)
  embedding_generated (0=pending, 1=done, -1=failed)
  created_at

faq_usage (Phase 2, analytics)
  id (UUID)
  user_id (foreign key)
  chat_id (optional, foreign key)
  faq_id (foreign key)
  relevance_score (cosine similarity 0-1)
  used_at
```

## Development

### Build CSS

```bash
pnpm run build:css
```

### Run Tests

Tests not yet configured (Phase 3 roadmap).

### Code Quality

No linter currently configured (Phase 3 roadmap).

## Deployment Status

- **Latest Version**: Deployed to Cloudflare Workers
- **URL**: `https://growchat.tanyongsheng-net.workers.dev`
- **Test Status**: Manual smoke tests passing (register, login, chat creation, streaming)

## Troubleshooting

### JWT_SECRET not configured

```bash
wrangler secret put JWT_SECRET
# Re-deploy: pnpm run deploy
```

### OPENAI_API_KEY missing

```bash
wrangler secret put OPENAI_API_KEY
# Re-deploy: pnpm run deploy
```

### D1 Database errors

Check that `wrangler.jsonc` has correct database ID from `wrangler d1 list`.

## Roadmap

### Phase 1 (✅ Deployed)

- ✅ User authentication with JWT and refresh tokens
- ✅ Multi-user chat with persistent storage
- ✅ Streaming LLM responses via SSE
- ✅ Multi-model support (Workers AI + OpenAI-compatible)
- ✅ PBKDF2 password hashing
- ✅ Responsive web UI

### Phase 2 (🚀 In Progress)

- 🚀 Vector embeddings with Cloudflare Vectorize (768-dim, cosine similarity)
- 🚀 FAQ management with semantic search
- 🚀 File uploads with R2 storage
- 🚀 Document text extraction:
  - Plain text and markdown: direct extraction
  - Images: OCR via Workers AI @cf/wit/ocr
  - PDF: deferred to Phase 3
- 🚀 Semantic chunking (500-char chunks with 50-char overlap)
- 🚀 RAG context injection into LLM prompts
- 🚀 Citation tracking in messages
- 🚀 Admin panel with statistics and vector management

### Phase 3 (Planned)

- [ ] PDF file support with text extraction
- [ ] Testing infrastructure (unit + E2E)
- [ ] Chat sharing and export
- [ ] Advanced analytics dashboard
- [ ] Prompt templates and workflows
- [ ] Rate limiting and quotas

## License

MIT

## Support

For issues or questions, open an issue on GitHub.
