# Architecture Overview

## Platform

GrowChat runs on **Cloudflare Workers** using the `nodejs_compat` compatibility flag. It is a single-worker deployment with:

- **Static Assets** via the `ASSETS` binding (`./public`)
- **D1 Database** (`growchat`) for users, chats, messages, admin config, audit logs
- **R2 Bucket** (`growchat-files`) for file uploads
- **KV Namespaces** — `SESSIONS` (auth tokens), `CHAT_SESSIONS` (chat state), `CACHE` (API cache)
- **Durable Objects** — `MessageQueueDO` for real-time SSE streaming per user

## Request Lifecycle

All requests enter through `src/index.js` (the Worker `fetch` handler). The pipeline is:

```
Request → handleRequest()
  ├── handleOptions()          → CORS preflight
  ├── /api/* or /s/*          → handleApiRequest()
  │   ├── validateOrigin()     → CORS origin check
  │   ├── checkApiBindings()   → DB/SESSIONS binding validation
  │   ├── resolveAuthenticatedUser()
  │   │   ├── isPublicRoute()  → public routes skip auth
  │   │   └── resolveAuthUser()+loadPrimaryRole()+loadUserAccountStatus()
  │   └── dispatchApiRoutes()  → iterate API_ROUTES, return first match
  └── static / SPA            → handleAssetRequest()
      ├── maybeServeLandingPage() → landing.html for unauthenticated /
      ├── env.ASSETS.fetch()      → serve static files
      └── handleSpaFallback()     → index.html for SPA routes
```

### API Route Registry

Defined in `/src/bootstrap/router-registry.js`. Routes are an ordered array of router functions; the first to return a non-null response wins. Route modules are imported and registered in this order:

1. `publicRouter` — Health check, shared chats, public model listing
2. `authRouter` — Login, register, refresh, logout, verify email
3. `chatRouter` — CRUD chats, messages, branching, streaming
4. `userSettingsRouter` — User preferences
5. `usersRouter` — MCP OAuth, profile, user resources
6. `filesRouter` — Upload, list, search, delete files
7. `adminRouter` — Admin panels (connections, models, tool servers, users, RBAC)
8. `modelsRouter` — Model metadata listing
9. `groupsRouter` — User groups CRUD
10. `rbacRouter` — Roles, permissions, bindings
11. `realtimeRouter` — SSE realtime connections
12. `sessionManagementRouter` — Active sessions listing/revocation

## Data Storage

### D1 Database Schema (`/migrations/`)

| Migration                       | Changes                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001_initial.sql`               | Core tables: users, chats, messages, connections, models, tool_servers, files, message_votes, user_role, system_config, audit_log, groups, role_permissions, user_bindings |
| `002_settings_permissions.sql`  | Settings, permission keys, workspace settings                                                                                                                              |
| `003_password_reset_tokens.sql` | Password reset tokens table                                                                                                                                                |
| `004_email_verification.sql`    | Email verification codes table                                                                                                                                             |
| `005_message_editing.sql`       | Message edit history tracking                                                                                                                                              |
| `006_audit_logging.sql`         | Enhanced audit log support                                                                                                                                                 |

### KV Usage

- **SESSIONS** — JWT refresh token storage (keyed by token hash, value = user ID + expiry)
- **CHAT_SESSIONS** — Real-time SSE session coordination
- **CACHE** — Model discovery cache, SRI hash cache, workspace settings cache

### R2 Bucket

- **growchat-files** — User-uploaded files (images, documents, text). Files are validated, processed (text extraction, OCR), and optionally vectorized for RAG search.

## Frontend Architecture

The frontend is a **vanilla JS single-page application** with ES modules. It uses:

- **Tailwind CSS** (compiled via `pnpm run build:css`)
- **Custom routing** via URL hash (`#/settings`, `#/admin`, `#/chat/...`)
- **Shared store** (`/public/js/shared/store.js`) for global state
- **API layer** (`/public/js/shared/api/`) — modular API clients for each domain
- **Reusable components** (`/public/js/shared/components/`) — modal shells, search, settings panels, sidebar, markdown renderers
- **Feature modules** under `/public/js/features/` — chat, account, admin, auth

No frontend framework (React, Vue, etc.) — all DOM manipulation is done with vanilla JS.

## Durable Objects: MessageQueueDO

Located in `/src/durable/message-queue.js`. Each user gets a Durable Object instance (`user:{userId}`) that manages real-time SSE connections. It supports:

- **GET /connect** — Opens an SSE stream for a client session
- **POST /publish** — Broadcasts a realtime event to all connected sessions for that user

The realtime system (`/src/features/realtime/realtime.js`) provides helpers to create, publish, and connect to these events.

## Key Architectural Decisions

1. **No session cookies** — Bearer-token auth only. Server-side auth detection for `/` is impossible, so landing page serving relies on absence of `Authorization` header and `?app=1` query param.
2. **Workers AI disabled** — Only OpenAI-compatible connections are supported (removed `@cf/` model support). See `src/llm.js`.
3. **Model ID format** — `{providerId}:{modelId}` (e.g., `openai:gpt-4o`). Parsed and formatted by `/src/llm/provider-registry.js`.
4. **Compatibility decomposition** — The project has been systematically extracting logic into smaller helpers to reduce function complexity, guided by `fallow` tooling metrics.
