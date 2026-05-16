# Codebase Structure

**Analysis Date:** [YYYY-MM-DD]

## Directory Layout

```
growchat/
├── .planning/       # Agent and project planning artifacts
├── docs/            # Project documentation (architecture, plans)
├── migrations/      # D1 SQLite database migrations
├── public/          # Frontend assets and Vanilla JS SPA
│   ├── css/         # Compiled stylesheets
│   ├── js/          # Frontend source modules
│   └── index.html   # Main application shell
├── scripts/         # Local utilities (dev, CI, deployments)
├── src/             # Backend source code (Cloudflare Worker)
│   ├── admin/       # Admin-specific logic/helpers
│   ├── bootstrap/   # Initialization and router registration
│   ├── chat/        # Core chat domain logic and runners
│   ├── config/      # Application configurations
│   ├── durable/     # Cloudflare Durable Objects definitions
│   ├── errors/      # Custom error models
│   ├── features/    # Isolated backend business logic implementations
│   ├── llm/         # Integrations with external AI/LLM providers
│   ├── mcp/         # Model Context Protocol implementations (Tools)
│   ├── middleware/  # HTTP interceptors (CORS)
│   ├── repositories/# Database access wrappers (Data layer)
│   ├── routers/     # API request endpoints
│   ├── services/    # External integrations (Email, Realtime Bus)
│   ├── shared/      # Constants/models shared across backend layers
│   ├── utils/       # Utility functions and standard responses
│   └── validation/  # Zod schemas and validation logic
└── tests/           # Integration, E2E, and smoke tests
```

## Directory Purposes

**`src/routers/`:**
- Purpose: Houses the HTTP endpoint controllers for the Worker.
- Contains: Individual files mapping to REST resources (e.g., `users.js`, `chat.js`).
- Key files: `src/routers/auth.js`, `src/routers/chat.js`

**`src/bootstrap/`:**
- Purpose: Application startup, router aggregation, and context evaluation.
- Contains: Route registries and request context augmenters.
- Key files: `src/bootstrap/router-registry.js`, `src/bootstrap/worker-context.js`

**`src/features/`:**
- Purpose: Contains complex, distinct operational boundaries.
- Contains: Service orchestration (realtime synchronization, admin flows, asynchronous chat processing).
- Key files: `src/features/realtime/realtime.js`, `src/features/chat/async-session-processor.js`

**`src/durable/`:**
- Purpose: Houses Cloudflare Durable Object classes.
- Contains: Stateful classes acting as singletons over WebSocket/Queues.
- Key files: `src/durable/message-queue.js`

**`public/js/`:**
- Purpose: Primary source for the Frontend UI.
- Contains: Vanilla JS implementation of Bootstrap, Features, and Shared utilities.
- Key files: `public/js/bootstrap/app.js`, `public/js/shared/store.js`

## Key File Locations

**Entry Points:**
- `src/index.js`: Backend Cloudflare Worker main fetch handler.
- `public/js/bootstrap/app.js`: Frontend application bootstrap logic.

**Configuration:**
- `wrangler.jsonc`: Cloudflare Worker setup, KV/D1/DO bindings, and env variables.
- `package.json`: NPM dependencies and build scripts.
- `tailwind.config.js`: Tailwind CSS rules for the UI.

**Core Logic:**
- `src/routers/chat.js`: Drives the primary conversation endpoint logic.
- `src/chat/assistant-runner.js`: Governs how the LLM produces and parses streams/tools.

**Testing:**
- `tests/e2e/`: Playwright end-to-end tests covering frontend behavior.
- `tests/unit/`: Vitest specifications for backend utilities and routers.
- `src/**/*.test.js`: Colocated unit tests for specific modules.

## Naming Conventions

**Files:**
- Kebab-case: `user-settings.js`, `router-registry.js`
- Test files: `[name].test.js` or `[name].spec.js`

**Directories:**
- Kebab-case, typically plural for groupings (`routers`, `features`, `services`) but singular for domain specifics (`chat`, `admin`).

## Where to Add New Code

**New API Endpoint:**
- Primary code: Create a new router in `src/routers/my-new-route.js` and export it.
- Registration: Add the exported router to the array in `src/bootstrap/router-registry.js`.
- Tests: Create `src/routers/my-new-route.test.js`.

**New Backend Domain Logic/Service:**
- Implementation: Create a module inside `src/features/` or `src/services/` depending on whether it represents app behavior or external connectivity.
- Database access: Direct `DB.prepare` calls can live in `src/repositories/` if they are heavily reused, or tightly coupled queries can remain within domain logic.

**New Frontend Component:**
- Implementation: Place shared UI components in `public/js/shared/components/` and feature-specific logic in `public/js/features/`.

**Utilities:**
- Shared helpers: Put isolated pure functions in `src/utils/` for the backend, or `public/js/shared/utils/` for the frontend.

## Special Directories

**`.planning/codebase/`:**
- Purpose: Contains GSD agent generated analysis markdown.
- Generated: Yes (by agents)
- Committed: Yes

**`migrations/`:**
- Purpose: D1 SQLite database structural schema files (`.sql`).
- Generated: No
- Committed: Yes

---

*Structure analysis: [YYYY-MM-DD]*