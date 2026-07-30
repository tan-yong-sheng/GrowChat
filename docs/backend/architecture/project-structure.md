# Project Structure

## Root Layout

```
GrowChat/
├── src/                    # Backend (Cloudflare Workers)
├── public/                 # Frontend (vanilla JS SPA)
├── tests/                  # Unit + E2E + integration tests
├── migrations/             # D1 SQL migrations (forward-only)
├── docs/                   # This documentation
├── scripts/                # Dev/deploy scripts (init-local-db, test-e2e, seed-test-user, etc.)
├── tests/e2e/fixtures/     # E2E auth state data
├── tests/e2e/artifacts/    # E2E screenshots, traces
├── coverage/               # Test coverage reports (generated)
├── wrangler.jsonc          # Cloudflare Workers configuration
├── package.json            # Dependencies and scripts
├── tailwind.config.js      # Tailwind CSS config
├── DESIGN.md              # UX design guidelines
├── AGENTS.md              # Agent instructions (quick reference)
├── CLAUDE.md              # Project-level Claude instructions
├── .dev.vars.example      # Local environment variable template
└── .gitignore
```

## Backend (`src/`)

```
src/
├── index.js                # Worker entry point (fetch handler)
├── db.js                   # D1 database helpers
├── auth.js                 # Auth middleware (JWT validation)
├── session.js              # Session management (KV tokens)
├── llm.js                  # LLM provider entry point
├── realtime.js             # Realtime/EventSource handler
├── async-session-processor.js  # Background processing
├── bootstrap/              # Startup concerns
│   ├── router-registry.js  # API route registration (11 routers)
│   ├── migration-runner.js # D1 migration execution
│   ├── migration-audit.js  # Migration validation
│   └── worker-context.js   # Worker binding setup
├── routers/                # HTTP adapters (thin)
│   ├── public.js           # Health, shared chat, public models
│   ├── auth.js             # Login, register, refresh, logout, password reset
│   ├── chat/               # Chat sub-routers
│   │   ├── index.js       # Chat entry → chat.js
│   │   ├── chat-collection.js  # CRUD, list, share, pin, archive, clone
│   │   ├── chat-core.js   # Shared chat helpers
│   │   ├── chat-history.js # Chat history
│   │   └── chat-message.js # Messages: send, edit, delete, branch, regenerate
│   ├── user-settings.js    # User settings (re-exports services)
│   ├── users.js            # Profile + admin user management
│   ├── files.js            # File upload, R2, document management
│   ├── admin/              # Admin sub-routers
│   │   └── index.js       # Admin entry → admin.js
│   ├── models/             # Models sub-routers
│   │   └── index.js       # Models entry → models.js
│   ├── groups.js           # Group management (admin)
│   ├── rbac.js             # RBAC: roles, permissions, bindings, audit log
│   └── realtime.js         # SSE stream endpoint
├── services/               # Reusable business logic
│   ├── audit-logging.js    # Audit trail
│   ├── csrf.js            # CSRF token validation
│   ├── rate-limit.js      # Rate limiting
│   ├── realtime-bus.js    # Real-time pub/sub
│   ├── uploads.js         # Upload handling
│   ├── extraction.js      # Document text extraction
│   ├── workspace-settings.js # Shared workspace settings shaping
│   ├── email/             # Email service (Resend)
│   └── parsers/           # Input parsers
├── chat/                   # Chat-domain helpers
│   ├── assistant-runner.js # Orchestrates LLM calls with tools
│   ├── stream-lifecycle.js # Stream state machine
│   ├── stream-finalize.js  # Stream completion logic
│   ├── stream-utils.js    # Stream utilities
│   ├── tools.js           # Tool definitions
│   ├── attachments.js     # File attachment handling
│   └── mcp.js             # MCP tool server integration
├── llm/                    # LLM provider logic
│   ├── provider-registry.js # Registry of LLM providers
│   ├── provider-adapters.js # Provider-specific request shaping
│   ├── connections.js     # Connection management
│   ├── model-state.js     # Model state helpers
│   ├── turn-policy.js     # Turn policy selection
│   ├── turn-policies/     # Policy implementations
│   ├── system-prompt.js   # System prompt generation
│   └── stream-parser.js   # SSE stream parsing
├── admin/                  # Admin-specific services
│   └── tool-servers.js    # Tool server management
├── durable/                # Durable Objects
│   └── message-queue.js   # MessageQueueDO for SSE
├── validation/             # Input validation
├── errors/                 # Error types and handlers
├── repositories/           # Data access layer
├── config/                 # Configuration
├── features/               # Feature flagging
├── mcp/                    # MCP client/server logic
├── shared/                 # Shared backend utils
└── utils/                  # Backend utilities
    ├── app-config.js      # App configuration helpers
    ├── authorize.js       # Authorization checks
    └── user-role.js       # User role resolution
```

## Frontend (`public/`)

```
public/
├── index.html              # Main SPA
├── auth.html               # Auth page (standalone)
├── styles.css              # Tailwind output (built from src/input.css)
├── _routes.json            # Cloudflare asset routing rules
├── favicon.png
├── logo.png
└── js/
    ├── bootstrap/          # App entry + session setup
    │   ├── app.js         # Main entry: bootstrap(), route matching, popstate
    │   ├── app-route-utils.js
    │   ├── app-shells.js  # Skeleton renderers
    │   ├── auth.js        # Auth page logic
    │   └── session-bootstrap.js  # Token → RBAC → chat → models → realtime
    ├── features/           # Lazy-loaded on demand
    │   ├── chat/          # 39 files — messages, streaming, UI, input, models
    │   ├── admin/         # Admin pages — users, settings, system
    │   └── account/       # Account settings drawer
    ├── shared/             # Shared by all features
    │   ├── api/           # API client (request, response, auth, cache, etc.)
    │   ├── components/    # 36 reusable UI components
    │   └── utils/         # 23 shared utilities
    └── utils/              # Standalone (vestigial — prefer shared/utils/)
```

## Tests (`tests/`)

```
tests/
├── unit/                   # Vitest unit tests
├── e2e/                    # Playwright E2E tests
│   ├── frontend/          # auth, chat, admin-settings, connections, visual-regression, etc.
│   └── fixtures/          # auth-state.json (⚠️ contains real credentials — sanitize)
├── rbac.test.js            # RBAC design spec (not executable)
└── rbac.integration.test.js # RBAC integration spec (not executable)
```

Test files in `src/`: `src/**/*.test.js` — colocated unit tests.

### E2E Test Specs (`tests/e2e/frontend/`)

- `auth.setup.spec.ts` — Generates `auth-state.json` (storageState) from `TEST_EMAIL`/`TEST_PASSWORD`
- `auth.spec.ts` — Guest auth flows (register, login, password reset)
- `auth-workflows.spec.ts` — Complex auth workflows
- `bootstrap.spec.ts` — App bootstrap tests
- `chat.spec.ts` — Chat creation, messaging, streaming
- `admin-settings.spec.ts` — Admin settings CRUD
- `connections.spec.ts` — LLM connection management
- `visual-regression.spec.ts` — Playwright `toHaveScreenshot()` baselines (desktop + mobile)
- `accessibility.spec.ts` — axe-core a11y audits
- `button-responsive.spec.ts` — Button responsive behavior tests

## Migrations (`migrations/`)

```
migrations/
├── 001_initial.sql         # Core schema: 22 tables + seed (roles, permissions)
├── 002_settings_permissions.sql # Additive: 28 new permissions + role bindings
├── 004_email_verification.sql   # Email verification tokens
├── 005_message_editing.sql      # Message edit history
└── 006_audit_logging.sql        # Audit log schema
```

Policy: Forward-only, sequential filenames, additive-only after baseline.

## Configuration

### Cloudflare Bindings (`wrangler.jsonc`)

| Binding         | Type           | Name             |
| --------------- | -------------- | ---------------- |
| `ASSETS`        | Assets         | `./public`       |
| `DB`            | D1             | `growchat`       |
| `FILES`         | R2             | `growchat-files` |
| `MESSAGE_QUEUE` | Durable Object | `MessageQueueDO` |
| `CHAT_SESSIONS` | KV             | —                |
| `SESSIONS`      | KV             | —                |
| `CACHE`         | KV             | —                |

### Required Secrets

```bash
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY
```

## Key Commands

```bash
# Development
pnpm run dev              # CSS build → DB init → local server (localhost:8787)
pnpm run build:css        # Tailwind: src/input.css → public/styles.css
pnpm run dev:db           # Initialize local D1 database

# Testing
pnpm test                 # All unit tests (Vitest)
pnpm run test:watch       # Watch mode
pnpm run test:coverage   # Coverage report
pnpm run test:e2e        # E2E (via scripts/test-e2e.js: starts wrangler dev, seeds DB, runs Playwright)
pnpm run test:e2e:ui     # Playwright UI mode
pnpm run prepush         # Pre-push gate (typecheck + format:check + lint:hygiene + lint:dupes + lint:security + lint:flags)

# Deployment
pnpm run deploy           # predeploy: typecheck → format:check → build:css → validate migrations → lint:hygiene → lint:dupes → lint:security → lint:flags → wrangler deploy
```
