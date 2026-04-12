# GrowChat Agent Instructions

## Project Overview
**GrowChat** is a multi-user Cloudflare Workers chat application with support for multiple LLM providers via user-configured OpenAI-compatible connections.

**Stack:** Cloudflare Workers (D1, KV, R2, Durable Objects) + Vanilla JS SPA + Tailwind CSS

**Website:** `localhost:8787` (use `TEST_EMAIL`/`TEST_PASSWORD` env vars for local testing)

**ESM only** — `"type": "module"` in package.json.

## Exact Commands

### Development
```bash
# Full dev setup: CSS build → DB init → local server
npm run dev                         # localhost:8787, --log-level debug

# Individual steps
npm run build:css                   # Tailwind: src/input.css → public/styles.css
npm run dev:db                      # Initialize local D1 database only
npm run dev:remote                  # Connect to remote DB (skip local setup)
```

### Testing (Vitest + Playwright)
```bash
# Unit tests - frontend coverage on public/js/** modules
npm test                           # Run all tests (src/**/*.test.js + tests/unit/**)
npm run test:watch                 # Watch mode
npm run test:coverage              # Coverage report (coverage/ folder)

# E2E tests (Playwright) - tests exist in tests/e2e/frontend/
npm run test:e2e                   # Run E2E tests against python3 http.server on port 3007
npm run test:e2e:ui                # Playwright UI mode
npm run test:e2e:update-snapshots  # Update visual snapshots
```

### Deployment
```bash
# Required secrets (set once via wrangler)
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY

# Deploy to Cloudflare
npm run deploy                     # Triggers predeploy → tests → coverage → CSS → migrations → wrangler deploy
```

### Database & Migrations
```bash
# Local DB init applies migrations automatically via scripts/init-local-db.js
# Schema in migrations/ (3 files)
001_initial.sql                    # Core tables (22 tables)
002_settings_permissions.sql       # RBAC + settings
003_password_reset_tokens.sql      # Password reset system

# Validate migrations before deploy (included in predeploy)
npm run validate:migrations

# Local D1 management
npx wrangler d1 migrations apply growchat --local  # Apply migrations manually
```

**Email:** Uses Resend for transactional emails (password reset). Configure via `RESEND_API_KEY` secret + `RESEND_FROM_EMAIL` in app config.

## Key Architecture Points

### Cloudflare Bindings (wrangler.jsonc)
```jsonc
"assets": { "directory": "./public", "binding": "ASSETS" },
"d1_databases": [{ "binding": "DB", "database_name": "growchat" }],
"r2_buckets": [{ "binding": "FILES", "bucket_name": "growchat-files" }],
"durable_objects": [{ "name": "MESSAGE_QUEUE", "class_name": "MessageQueueDO" }],
"kv_namespaces": ["CHAT_SESSIONS", "SESSIONS", "CACHE"]
```

### Entry Points
- **Worker:** `src/index.js` → `router-registry.js` → API_ROUTES
- **Frontend:** `public/index.html` → `public/js/bootstrap/app.js` → route matching
- **CSS:** `src/input.css` (Tailwind config) → `public/styles.css` (must be built)

### Model ID Format
`{connectionId}__{modelId}` (e.g., `conn_123__gpt-4`) or user's single enabled connection

### Authentication
- **Access Token:** JWT with HS256, 15-minute TTL
- **Refresh Token:** SHA-256 hashed, stored in KV, 7-day TTL
- **Password:** PBKDF2 100k iterations + constant-time comparison

### File Upload Flow
1. `POST /api/files/upload` → R2 presigned URL
2. Upload to R2 directly
3. `POST /api/files` → register metadata in `documents` table
4. Async text extraction for RAG

### Streaming LLM Responses
- `POST /api/chats/:id/messages` returns SSE stream
- Max 100 tool steps, 20 follow-ups, 10-minute timeout
- Message deltas stored in `message_deltas` for resume capability

## Gotchas & Constraints

### Security
1. **No CSRF on API routes** (only session-based)
2. **No email verification** for registration
3. **SRI hashes** injected into HTML automatically
4. **Account status check:** `'active'` required, `'pending'` returns 403

### Testing
1. **Coverage includes** only specific `public/js/` modules (not all frontend files)
2. **Coverage excludes:** `*.test.js`, `components/`, `bootstrap/auth.js`, `chat.js`, `admin.js`
3. **E2E tests serve static files** via `python3 -m http.server 3007` (NOT wrangler dev server)
4. **E2E has 2 projects:** `chromium-guest` (auth.spec.ts) and `chromium-auth` (chat, admin-settings; requires `tests/e2e/fixtures/auth-state.json`)
5. **E2E test directory:** `tests/e2e/frontend/` with specs: auth.spec.ts, chat.spec.ts, admin-settings.spec.ts
6. **No `.only()`/`.skip()` in test files** (checked by grep)

### Development
1. **CSS must be built before dev:** `npm run dev` handles this
2. **Local DB init required:** `npm run dev:db` if using local D1
3. **Workers AI disabled:** Only OpenAI-compatible APIs via user connections
4. **Durable Objects:** MessageQueueDO for real-time SSE (15s keepalive)
5. **Predeploy hook** (`predeploy` in package.json) runs: test → coverage → build:css → validate migrations → wrangler deploy

### Performance
1. **Chat list paginated:** Default 30 chats, `has_more` flag
2. **Frontend lazy loading:** Admin/chat modules loaded on demand
3. **Message deltas no cleanup:** Persistent storage, no auto-purge

## When Making Changes

1. **CSS changes:** Always run `npm run build:css`
2. **Schema changes:** Add migration file, run `npm run validate:migrations`
3. **Deploy:** Set secrets first, `npm run deploy` runs full predeploy gate
4. **Testing:** Frontend coverage expected on key modules in `public/js/`

## File Reference
- **Backend routes:** `src/routers/` + `src/bootstrap/router-registry.js`
- **Frontend modules:** `public/js/bootstrap/` → `public/js/features/` → `public/js/shared/`
- **LLM integration:** `src/llm/` + `src/chat/assistant-runner.js`
- **DB migrations:** `migrations/` (3 files)
- **Build/scripts:** `scripts/` (init-local-db.js, pre-deploy.js, generate-api-docs.js)
- **E2E tests:** `tests/e2e/frontend/` — auth, chat, admin-settings, visual
- **Unit tests:** `src/**/*.test.js` + `tests/unit/` + `tests/rbac.test.js`, `rbac.integration.test.js`
