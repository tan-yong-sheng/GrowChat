# GrowChat Architecture Guide

This file provides guidance to Claude Code when working with the GrowChat repository.

## Project Overview

**GrowChat** is a multi-user Cloudflare Workers chat application with support for multiple LLM providers (Workers AI and OpenAI-compatible APIs).

### Core Components
- **Backend API**: Cloudflare Worker in `src/index.js` handling all API routes
- **Database**: SQLite (D1) for persistent user/chat/message storage
- **Session Management**: KV namespace for refresh token storage with TTL
- **Frontend**: Vanilla JS SPA in `public/` (auth page + chat app)
- **Styling**: Tailwind CSS compiled to `public/styles.css`

## Common Commands

From repository root:

- Install dependencies: `npm install`
- Build CSS: `npm run build:css`
- Local dev (CSS build + Wrangler dev): `npm run dev`
- Deploy to Cloudflare: `npm run deploy`

### Testing & Linting Status

- **No test framework** currently configured (`package.json` has no `test` script)
- **No linter** currently configured (`package.json` has no `lint` script)
- See **Phase 3 Roadmap** for testing infrastructure plans

## Architecture Overview

### Phase 1: User Authentication & Multi-User Chat (Current)

#### Database Schema (D1)

```sql
users (id, email, password_hash, name, role, settings, created_at, updated_at)
chats (id, user_id, title, model, pinned, tags, created_at, updated_at)
messages (id, chat_id, role, content, model, citations, created_at)
refresh_tokens (hash, user_id, expires_at)  -- Reserved for audit trail; tokens stored in KV at runtime
```

#### Request Flow

`src/index.js` entry point:
1. Parses request path and HTTP method
2. Reads `Authorization: Bearer <JWT>` header and verifies JWT with `env.JWT_SECRET`
3. Routes authenticated requests to API handlers
4. Falls back to `env.ASSETS.fetch(req)` for static files

#### API Routes

**Authentication** (`src/routers/auth.js`):
- `POST /api/auth/register` - Create account with email/password
- `POST /api/auth/login` - Get access token + refresh token
- `POST /api/auth/refresh` - Exchange refresh token for new access token
- `POST /api/auth/logout` - Revoke refresh token (optional)

**Users** (`src/routers/users.js`):
- `GET /api/users/me` - Get current user profile (requires auth)
- `PUT /api/users/me` - Update user profile (name, settings)

**Chats** (`src/routers/chat.js`):
- `GET /api/chats` - List all user chats (paginated, limited to 100)
- `POST /api/chats` - Create new chat with optional title/model
- `GET /api/chats/:id` - Get chat with message history
- `PUT /api/chats/:id` - Update chat title/pinned/tags
- `DELETE /api/chats/:id` - Delete chat (cascade deletes messages)
- `POST /api/chats/:id/messages` - Send message + stream LLM response via SSE

#### Authentication System

**JWT Tokens**:
- **Access Token**: Signed with `env.JWT_SECRET`, expires in 15 minutes, payload `{ sub, email, role, name }`
- **Refresh Token**: Opaque 32-byte token hashed with SHA-256, stored in `SESSIONS` KV, expires in 7 days

**Password Security**:
- Hashed with PBKDF2 (100,000 iterations, SHA-256)
- Uses Web Crypto API for constant-time comparison

#### LLM Model Routing

In `src/llm.js`:
- If model starts with `@cf/` → use `env.AI.run(model, { messages, stream: true })`
- Otherwise → call OpenAI-compatible endpoint at `env.OPENAI_BASE_URL/chat/completions`

**Model Selection** (in order of precedence):
1. User-provided `model` in request body
2. Chat's stored `model` field
3. `env.DEFAULT_MODEL` environment variable (set in `wrangler.jsonc` or `wrangler secret`)
4. Fallback to `@cf/meta/llama-3.1-8b-instruct` (free Workers AI model)

#### Streaming Pipeline

`src/routers/chat.js` + `src/llm.js`:
1. Inserts user message into D1
2. Loads chat history (last 30 messages)
3. Calls `streamLLM()` which returns raw response body stream
4. Wraps stream in `ReadableStream` with `SseLineParser` for chunk-safe parsing
5. Parses SSE lines and buffers incomplete JSON across chunk boundaries
6. On stream end, flushes parser buffer for final token
7. Inserts complete assistant message into D1
8. Updates chat's `updated_at` timestamp

**Error Handling**:
- If LLM setup fails (missing key, bad model, network error), returns SSE error event instead of crashing:
  ```
  event: start
  data: {"event": "start", "chat_id": "..."}

  data: {"error": "llm_unavailable", "message": "LLM setup failed"}
  data: [DONE]
  ```

#### Frontend Architecture

**Pages**:
- `public/auth.html` - Login/register form with tab switcher
- `public/index.html` - Main app entry point

**Modules** (`public/js/`):
- `auth.js` - Login/register form handler, token refresh, logout
- `api.js` - Fetch wrapper with bearer token, automatic token refresh on 401
- `app.js` - Bootstrap auth check, load chats, initialize chat view
- `chat.js` - Chat list + message display, message sending with SSE parsing

**Authentication State**:
- Stored in `localStorage` under key `growchat_auth`: object with `access_token`, `refresh_token`, `user`
- Auto-refresh on 401 response from API
- Redirect to `/auth.html` if no valid token

**SSE Parsing** (`public/js/chat.js`):
- Accumulates chunks in buffer until complete SSE line
- Parses `data: {"response": "..."}` payloads
- Handles error payloads: `data: {"error": "...", "message": "..."}`
- Incremental DOM updates to message UI

### Cloudflare Bindings (wrangler.jsonc)

```jsonc
{
  "ai": { "binding": "AI" },  // Workers AI inference
  "d1_databases": [{ "binding": "DB", "database_id": "..." }],  // SQLite
  "kv_namespaces": [
    { "binding": "CHAT_SESSIONS", "id": "..." },  // Legacy session storage (Phase 0)
    { "binding": "SESSIONS", "id": "..." },  // Refresh token storage
    { "binding": "CACHE", "id": "..." }  // Future caching layer
  ],
  "vars": {
    "OPENAI_BASE_URL": "https://proxy.tanyongsheng.site/v1",
    "DEFAULT_MODEL": "gpt-5-mini",
    "APP_NAME": "GrowChat"
  }
}
```

**Secrets** (set via `wrangler secret`):
- `JWT_SECRET` - For signing/verifying JWT tokens
- `OPENAI_API_KEY` - For OpenAI-compatible API calls

### Configuration

**Environment Variables** (`.env` or `wrangler.jsonc` vars):
- `OPENAI_BASE_URL` - Base URL for OpenAI-compatible endpoint (e.g., `https://api.openai.com/v1`)
- `OPENAI_API_KEY` - API key for OpenAI-compatible endpoint (set as secret)
- `DEFAULT_MODEL` - Default LLM model (checked before hardcoded fallback)
- `JWT_SECRET` - Secret for JWT signing/verification (set as secret)

## Phase 2 Roadmap (Planned)

- [ ] RAG integration with Cloudflare Vectorize
  - Embed FAQ documents with Workers AI embeddings model
  - Query vector index before sending to LLM
  - Include relevant FAQ snippets in system prompt
- [ ] File uploads with R2
  - Upload documents/images to R2 bucket
  - Generate embeddings for uploaded files
  - Support file references in messages
- [ ] Admin panel
  - View user statistics
  - Manage FAQs and vector index
  - Monitor API usage

## Phase 3 Roadmap (Planned)

- [ ] Testing infrastructure
  - Jest or Vitest for unit tests
  - Playwright E2E tests
  - Target 80%+ code coverage
- [ ] Advanced features
  - Message sharing/public links
  - Conversation export (PDF/JSON)
  - Model-specific system prompts
  - User preferences UI

## Repository Structure

```
GrowChat/
├── public/                  # Static assets & frontend
│   ├── index.html          # Chat app entry point
│   ├── auth.html           # Login/register page
│   ├── js/                 # Frontend modules
│   │   ├── app.js
│   │   ├── auth.js
│   │   ├── api.js
│   │   └── chat.js
│   └── styles.css          # Compiled Tailwind CSS
├── src/                     # Backend API
│   ├── index.js            # Worker entry point & routing
│   ├── auth.js             # JWT signing/verification
│   ├── db.js               # D1 database abstraction
│   ├── llm.js              # LLM streaming & SSE parsing
│   ├── session.js          # Refresh token management
│   ├── routers/
│   │   ├── auth.js         # Auth endpoints
│   │   ├── chat.js         # Chat & message endpoints
│   │   └── users.js        # User profile endpoints
│   ├── utils/
│   │   └── response.js     # HTTP response helpers
│   └── input.css           # Tailwind input
├── migrations/
│   └── 001_initial.sql     # D1 schema
├── wrangler.jsonc          # Cloudflare Worker config
├── tailwind.config.js      # Tailwind configuration
├── package.json
└── AGENTS.md               # This file

```

## Development Workflow

### Local Development
```bash
npm install
npm run dev  # Runs wrangler dev with CSS rebuild watch
```

Visit `http://localhost:8787` to test locally.

### Deployment
```bash
# Set secrets (one-time setup)
wrangler secret put JWT_SECRET
wrangler secret put OPENAI_API_KEY

# Deploy
npm run deploy  # Builds CSS and deploys Worker
```

### Creating Database Migrations

D1 applies `migrations/` SQL files **only on initial database creation**. For schema changes to an existing database, you must apply them manually:

```bash
wrangler d1 execute growchat --file=./migrations/changes.sql
```

Or via the Cloudflare dashboard SQL editor.

## Important Notes

1. **Token-based auth**: All API requests (except `/api/auth/*`) require `Authorization: Bearer <token>` header
2. **SSE format**: Responses stream as `data: <JSON>\n\n` lines; incomplete JSON across chunks is buffered and reconstructed
3. **Error handling**: LLM failures return SSE error events, not HTTP 500 responses
4. **Model fallback**: If user doesn't specify a model, the system checks (in order): request body → chat record → `DEFAULT_MODEL` env var → hardcoded Workers AI model
5. **SESSIONS KV**: Stores hashed refresh tokens only; user records live in D1 for consistency
6. **Vectorize binding**: Currently commented out in `wrangler.jsonc` (Phase 2 feature); uncomment when ready to implement RAG

## UI Performance Notes

When optimizing frontend lag in GrowChat, prefer fixing render and request patterns before adding complexity like code splitting.

1. Avoid full-shell rerenders for subview data refreshes.
2. Keep persistent UI mounted once: sidebar, nav, footer, modal roots.
3. Update local state in place after row-level mutations instead of refetching the entire view by default.
4. Do not recreate components that trigger their own fetches during unrelated content updates.
5. Use lazy loading only after measuring whether interaction lag is caused by bundle size rather than DOM churn or redundant network calls.
6. For admin tables, prefer partial updates, optimistic row replacement/removal, and scoped loading indicators over page-wide reload spinners.
7. When debugging route-transition lag, first distinguish between SPA state swaps and full document navigations; full navigations re-run bootstrap, auth/profile fetches, RBAC init, realtime startup, and primary data loads.

## Network & Latency Reduction Architecture

1. **Bootstrap consolidation**: Keep `/api/users/me` as the single bootstrap call by supporting `include=permissions,roles` and passing the data directly into `initRBAC` to eliminate separate permissions/roles requests.
2. **Route-aware boot**: Skip chat list/message fetches when visiting `/admin` or other non-chat routes; avoid loading chat modules until the route needs them.
3. **On-demand modules**: Lazy-load non-critical UI modules (search modal, files modal, icon picker, tag modal, folder sidebar, profile footer) and only initialize when the user opens those features.
4. **Optimistic UI**: Render new chats and deletes optimistically in the sidebar and message list to avoid latency gaps while the API call completes.
5. **Avoid duplicate fetches**: Keep a per-route cache (in-memory) of chats/messages and re-use when navigating back; only refetch when data is stale or a mutation occurred.
6. **Realtime guard**: Defer realtime stream connect until after first paint and guard against repeated 500 reconnect loops; disable realtime for routes that do not need it.
7. **Incremental payloads**: Prefer paging and deltas over full list reloads after each mutation; update local state in place on success.
8. **Server-side pruning**: Limit initial `/api/chats` payload (default 30) and return `has_more`; load more only on scroll or user request.
9. **Asset discipline**: Keep third-party scripts `defer`/`async` and load markdown/rendering libraries only when the first assistant message is rendered.
10. **Shared chat route**: Resolve shared chat metadata without pulling the full chat list; avoid bootstrapping the whole app if landing directly on `/s/:id`.
