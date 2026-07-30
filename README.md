# GrowChat

A multi-user Cloudflare Workers chat application with support for multiple LLM providers.

## Features

✅ **Phase 1 (Deployed)**

- User authentication with JWT tokens and refresh token rotation
- Multi-user chat management with persistent D1 database
- Streaming LLM responses via Server-Sent Events (SSE)
- Multi-provider LLM support via user-configured OpenAI-compatible connections
- PBKDF2 password hashing with Web Crypto
- Responsive web UI built with vanilla JS and Tailwind CSS

✅ **Phase 2 (Deployed)**

- RAG with Cloudflare Vectorize for FAQ and document vector search
- File uploads with R2 cloud storage
- Document text extraction (plain text, markdown, images with OCR)
- Semantic chunking for document embeddings
- Admin panel for managing FAQs and documents
- Citation tracking for LLM responses
- Vector index management and reindexing
- Comprehensive test suite (unit + E2E)
- CI quality gates (type check, format check, ESLint, Fallow hygiene / dupes / security / flags)

🚀 **Phase 3 (Planned)**

- PDF file support
- Chat sharing and exports
- Advanced analytics dashboard

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [pnpm](https://pnpm.io) (auto-installed via corepack)
- Cloudflare account ([free tier](https://dash.cloudflare.com/sign-up))

### One-Command Deploy (recommended)

```bash
git clone https://github.com/tan-yong-sheng/GrowChat.git
cd GrowChat
pnpm install
pnpm run setup          # Creates resources + sets secrets + deploys
```

The setup wizard will:

1. Create all required Cloudflare resources (D1, R2, KV)
2. Apply database migrations automatically
3. Prompt for secrets (JWT_SECRET, optional RESEND_API_KEY)
4. Deploy to Cloudflare Workers

> **`pnpm run setup` includes deployment.** You do not need to run `pnpm run deploy` afterward. For re-deploying after code changes, use `pnpm run deploy`.

> **Tip:** Pre-set env vars to skip interactive prompts: `JWT_SECRET=xxx RESEND_API_KEY=xxx pnpm run setup`

That's it — your instance is live. See [docs/DEPLOY.md](docs/DEPLOY.md) for the full deployment guide.

### Post-Deploy: Create Admin

1. Open your Workers URL (shown in the wizard output)
2. Register your account
3. Promote to admin:

```bash
pnpm exec wrangler d1 execute growchat --remote \
  --command="UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'"
```

### Local Development

```bash
pnpm run dev
```

Open `http://localhost:8787` in your browser.

### Manual Setup (advanced)

If you prefer full control over each step:

1. **Create D1 Database**

```bash
pnpm exec wrangler d1 create growchat
```

Copy the `database_id` from the output into `wrangler.jsonc` → `d1_databases[0].database_id`.

2. **Create KV Namespaces**

```bash
pnpm exec wrangler kv:namespace create SESSIONS
pnpm exec wrangler kv:namespace create CHAT_SESSIONS
pnpm exec wrangler kv:namespace create CACHE
```

Update `wrangler.jsonc` with the namespace IDs.

3. **Create R2 Bucket**

```bash
pnpm exec wrangler r2 bucket create growchat-files
```

4. **Apply D1 Migrations**

```bash
pnpm exec wrangler d1 migrations apply growchat --remote
```

5. **Set Secrets**

```bash
pnpm exec wrangler secret put JWT_SECRET
pnpm exec wrangler secret put RESEND_API_KEY   # optional
```

6. **Deploy**

```bash
pnpm run deploy
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
- `POST /api/auth/forgot-password` - Request password reset email
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/resend-verification` - Resend email verification

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
# Copy .dev.vars.example → .dev.vars for local development
JWT_SECRET=...  # Set via wrangler secret or .dev.vars for local dev
RESEND_API_KEY=...  # Set via wrangler secret (Resend email delivery)
EMAIL_FROM=noreply@resend.dev
APP_URL=http://localhost:8787
ALLOWED_ORIGINS=*

# E2E test credentials (read from .dev.vars by test-e2e.js)
TEST_EMAIL=admin@localhost
TEST_PASSWORD=admin123

# Disable rate limiting in local dev
DISABLE_RATE_LIMIT=true
```

### Model Selection

The system checks for models in this order:

1. User-provided model in request
2. Chat's stored model
3. `DEFAULT_MODEL` environment variable
4. Available model from user's enabled connections (Workers AI disabled — only OpenAI-compatible APIs via user connections)

## Database Schema

```sql
users
  id (UUID)
  email (unique)
  password_hash (PBKDF2)
  name
  role (admin|user)
  account_status (active|pending)
  primary_role (member|admin)
  settings (JSON)
  preferences (JSON)
  last_active_at (unix timestamp)
  created_at, updated_at

chats
  id (UUID)
  user_id (foreign key)
  title
  model
  pinned (0|1)
  tags (JSON array)
  current_message_id (UUID, FK to messages)
  created_at, updated_at

messages
  id (UUID)
  chat_id (foreign key)
  parent_id (UUID, for branching)
  role (user|assistant)
  content
  model
  status (streaming|completed|cancelled|error)
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

```bash
pnpm test                     # Unit tests (Vitest)
pnpm run test:coverage        # Coverage report
pnpm run test:e2e             # E2E tests (via scripts/test-e2e.js — starts wrangler dev, seeds DB, runs Playwright)
pnpm run test:e2e:ui          # Playwright UI mode (interactive)
pnpm run test:e2e:update-snapshots  # Update E2E baselines
```

### Code Quality

```bash
pnpm run lint                     # ESLint (max-params enforced as error)
pnpm run lint:fix                 # Auto-fix ESLint (fails on warnings with --max-warnings 0)
pnpm run format                   # Prettier
pnpm run format:check             # Check formatting
pnpm run typecheck                # TypeScript guardrails
pnpm run lint:dupes:scoped        # Scoped duplication check
pnpm run lint:dupes:budget        # Duplication budget check
pnpm run lint:hygiene             # Dead code / dependency detection
pnpm run prepush                  # Pre-push gate (typecheck + format + Fallow checks)
```

## Deployment Status

- **Latest Version**: Deployed to Cloudflare Workers
- **URL**: `https://growchat.tanyongsheng-net.workers.dev`

## Troubleshooting

### JWT_SECRET not configured

```bash
wrangler secret put JWT_SECRET
# Re-deploy: pnpm run deploy
```

### RESEND_API_KEY missing

```bash
wrangler secret put RESEND_API_KEY
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

### Phase 2 (✅ Deployed)

- ✅ Vector embeddings with Cloudflare Vectorize (768-dim, cosine similarity)
- ✅ FAQ management with semantic search
- ✅ File uploads with R2 storage
- ✅ Document text extraction:
  - Plain text and markdown: direct extraction
  - Images: OCR via Workers AI @cf/wit/ocr
  - PDF: deferred to Phase 3
- ✅ Semantic chunking (500-char chunks with 50-char overlap)
- ✅ RAG context injection into LLM prompts
- ✅ Citation tracking in messages
- ✅ Admin panel with statistics and vector management
- ✅ Comprehensive test suite (unit + E2E)
- ✅ CI quality gates (typecheck, format, ESLint, Fallow hygiene/dupes/security/flags)

### Phase 3 (Planned)

- [ ] PDF file support with text extraction
- [ ] Chat sharing and export
- [ ] Advanced analytics dashboard
- [ ] Prompt templates and workflows

## License

MIT

## Support

For issues or questions, open an issue on GitHub.
