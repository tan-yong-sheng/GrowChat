# AGENTS.md

## Project Overview

**GrowChat** is a multi-user Cloudflare Workers chat application with support for multiple LLM providers via user-configured OpenAI-compatible connections.

**Stack:** Cloudflare Workers (D1, KV, R2, Durable Objects) + Vanilla JS SPA + Tailwind CSS + Vitest + Playwright

**Website:** local dev defaults to `localhost:8787`, but Playwright and browser tests should take the target URL from `TEST_URL` (with `PLAYWRIGHT_TEST_BASE_URL` as legacy fallback) plus `TEST_EMAIL`/`TEST_PASSWORD` for auth flows. E2E credentials are read from `.dev.vars` (copy `.dev.vars.example` → `.dev.vars`).

**ESM only** — `"type": "module"` in package.json.

## Developer Wiki & Knowledge Graph 📚

The core structure, architecture, and behavior of GrowChat are fully mapped as an interconnected wiki inside the `docs/` folder. **Always start here when debugging or building new features:**

- **Entry point:** [`docs/index.md`](docs/index.md)
- **UI/UX Mapping (`docs/ui-ux/`)**: Contains detailed Interaction Maps, UI State Machines, wireflows, and component guidelines outlining the strict "Action Blue" and "Pill" geometry aesthetics (dictated by `DESIGN.md`).
- **Backend Architecture (`docs/backend/`)**: Contains HTTP API contracts, RBAC authorization flows, data models, and Mermaid sequence diagrams (e.g., the Chat Streaming & SSE flow).
- **Design Guidelines**: Refer to `DESIGN.md` for the strict low-density, minimal UI aesthetics.
- **UI/UX Bug Tracker**: Refer to `docs/ui-ux/BUGS.md` for known limitations or edge cases.

## Development

```bash
# Full dev setup: CSS build → DB init → local server
pnpm run dev                         # localhost:8787, --log-level debug

# Individual steps
pnpm run build:css                   # Tailwind: src/input.css → public/styles.css
pnpm run dev:db                      # Initialize local D1 database only
pnpm run dev:remote                  # Connect to remote DB (skip local setup)
```

## Testing (Vitest + Playwright)

```bash
# Unit tests - frontend coverage on public/js/** modules
pnpm test                           # Run all tests (src/**/*.test.js + tests/unit/**)
pnpm run test:watch                 # Watch mode
pnpm run test:coverage              # Coverage report (coverage/ folder)

# E2E tests (Playwright) - tests exist in tests/e2e/frontend/
# `pnpm run test:e2e` uses scripts/test-e2e.js which starts its own wrangler dev (port 8788),
# initializes D1, applies migrations, enables public registration, seeds the test user,
# and runs Playwright — no separate dev server needed.
# E2E credentials: copy .dev.vars.example → .dev.vars
pnpm run test:e2e                   # Run E2E tests (wrapper: scripts/test-e2e.js)
pnpm run test:e2e:ui                # Playwright UI mode (requires separate dev server)
pnpm run test:e2e:update-snapshots  # Update visual snapshots

# Mutation testing
pnpm run check:mutation             # Stryker mutation test (threshold break: 55%)

# Full pre-push gate
pnpm run prepush:checks             # Unit tests + typecheck + lint + all scoped checks
```

## Code Quality (ESLint & Prettier)

```bash
pnpm run format                     # Format files using Prettier
pnpm run lint                       # Check for ESLint warnings/errors
pnpm run lint:fix                   # Auto-fix ESLint issues
```

## Deployment

```bash
# Required secrets (set once via wrangler)
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY

# Deploy to Cloudflare
pnpm run deploy                     # Triggers predeploy → tests → coverage → CSS → migrations → wrangler deploy
```

## Database & Migrations

```bash
# Local DB init applies migrations automatically via scripts/init-local-db.js
# Schema in migrations/ (6 files)
001_initial.sql                    # Core tables (22 tables)
002_settings_permissions.sql       # RBAC + settings
003_password_reset_tokens.sql      # Password reset system
004_email_verification.sql         # Email verification tokens
005_message_editing.sql            # Message edit history
006_audit_logging.sql              # Audit log schema

# Validate migrations before deploy (included in predeploy)
pnpm run validate:migrations

# Local D1 management
pnpm exec wrangler d1 migrations apply growchat --local  # Apply migrations manually
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

1. **No CSRF on API routes** (only session-based via Bearer token)
2. **No email verification** for registration (Planned for future)
3. **SRI hashes** injected into HTML automatically (plus DOMPurify CDN import)
4. **Account status check:** `'active'` required, `'pending'` returns 403

### Testing

1. **Coverage includes** only specific `public/js/` modules (not all frontend files)
2. **Coverage excludes:** `*.test.js`, `components/`, `bootstrap/auth.js`, `chat.js`, `admin.js`
3. **E2E tests** use `scripts/test-e2e.js` as the entry point. This wrapper starts `wrangler dev` on port 8788 (configurable via `TEST_PORT`), initializes D1 with migrations, enables public registration, seeds the test user from `.dev.vars`, then runs Playwright. No separate dev server needed.
4. **E2E has 3 projects:** `setup` (auth.setup.spec.ts — generates `auth-state.json`), `chromium-guest` (auth.spec.ts, auth-workflows.spec.ts, bootstrap.spec.ts, accessibility.spec.ts), and `chromium-auth` (chat.spec.ts, admin-settings.spec.ts, connections.spec.ts, visual-regression.spec.ts; depends on `setup` for storageState).
5. **E2E test specs:** `tests/e2e/frontend/` with: auth.spec.ts, auth-workflows.spec.ts, auth.setup.spec.ts, bootstrap.spec.ts, chat.spec.ts, admin-settings.spec.ts, connections.spec.ts, visual-regression.spec.ts, accessibility.spec.ts, button-responsive.spec.ts
6. **Visual regression** uses Playwright's `toHaveScreenshot()`. Baselines stored in `tests/e2e/frontend/visual-regression.spec.ts-snapshots/`. Run `pnpm run test:e2e:update-snapshots` to update.
7. **No `.only()`/`.skip()` in test files** (checked by grep)

### Development

1. **CSS must be built before dev:** `pnpm run dev` handles this
2. **Local DB init required:** `pnpm run dev:db` if using local D1
3. **Workers AI disabled:** Only OpenAI-compatible APIs via user connections
4. **Durable Objects:** MessageQueueDO for real-time SSE (15s keepalive)
5. **Predeploy hook** (`predeploy` in package.json) runs: lint → format check → test → coverage → build:css → validate migrations → wrangler deploy
6. **ESLint max-params** enforced as `error` with max 2 (legacy multi-param functions in ignore list in eslint.config.cjs)
7. **Lint-staged** runs `eslint --fix --max-warnings 0` — any warning or error blocks the commit

### Performance

1. **Chat list paginated:** Default 30 chats, `has_more` flag
2. **Frontend lazy loading:** Admin/chat modules loaded on demand
3. **Message deltas no cleanup:** Persistent storage, no auto-purge

## When Making Changes

1. **CSS changes:** Always run `pnpm run build:css`
2. **Schema changes:** Add migration file, run `pnpm run validate:migrations`
3. **Deploy:** Set secrets first, `pnpm run deploy` runs full predeploy gate
4. **Testing:** Frontend coverage expected on key modules in `public/js/`
5. **Documentation:** Update the `docs/` Developer Wiki Knowledge Graph if new states, components, endpoints, or flows are introduced.

## File Reference

- **Developer Wiki Knowledge Graph:** `docs/index.md` (Central Hub for all system behavior)
- **Backend routes:** `src/routers/` + `src/bootstrap/router-registry.js`
- **Frontend modules:** `public/js/bootstrap/` → `public/js/features/` → `public/js/shared/`
- **LLM integration:** `src/llm/` + `src/chat/assistant-runner.js`
- **DB migrations:** `migrations/`
- **Build/scripts:** `scripts/` (init-local-db.js, pre-deploy.js, validate-graphs.js, test-e2e.js, seed-test-user.js, prepush-e2e.sh, secret-scan.cjs, parse-lint.js, check-jscpd-budgets.js, run-scoped-guardrails.js)
- **E2E tests:** `tests/e2e/frontend/` — auth, auth-workflows, auth.setup, bootstrap, chat, admin-settings, connections, visual-regression, accessibility, button-responsive
- **Unit tests:** `src/**/*.test.js` + `tests/unit/` + `tests/rbac.test.js`, `rbac.integration.test.js`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **GrowChat** (10548 symbols, 18019 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/GrowChat/context` | Codebase overview, check index freshness |
| `gitnexus://repo/GrowChat/clusters` | All functional areas |
| `gitnexus://repo/GrowChat/processes` | All execution flows |
| `gitnexus://repo/GrowChat/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
