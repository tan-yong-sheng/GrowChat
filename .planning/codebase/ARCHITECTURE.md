<!-- refreshed: [YYYY-MM-DD] -->
# Architecture

**Analysis Date:** [YYYY-MM-DD]

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                 Cloudflare Worker (Entry & Routing)         │
├──────────────────┬──────────────────┬───────────────────────┤
│   Fetch Handler  │     Routing      │    Context Auth       │
│  `src/index.js`  │ `src/bootstrap/` │ `src/bootstrap/`      │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Business & Features                       │
│    `src/routers/`, `src/features/`, `src/chat/`             │
└─────────────────────────────────────────────────────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare D1 (SQLite) / Durable Objects / KV / LLM APIs    │
│  `src/db.js`, `src/durable/`, `src/llm.js`                   │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Worker Entry | Primary `fetch` handler, SPA asset serving, error handling | `src/index.js` |
| Router Registry | Aggregates all API routers, defines public/private scopes | `src/bootstrap/router-registry.js` |
| Worker Context | Evaluates JWT authentication, role resolution, route binding validation | `src/bootstrap/worker-context.js` |
| Chat Router | Handles AI turn lifecycle, tool execution (MCP), and streaming responses | `src/routers/chat.js`, `src/chat/*` |
| Realtime | WebSocket upgrades and message broadcasting | `src/features/realtime/realtime.js` |
| Frontend App | Vanilla JS SPA initialization, store subscription | `public/js/bootstrap/app.js` |

## Pattern Overview

**Overall:** Serverless Monolith (Cloudflare Workers) + Vanilla JS SPA

**Key Characteristics:**
- **Lightweight Routing:** Array of pure functions evaluating `Request` against standard URL paths instead of heavy frameworks (e.g., Express).
- **Service/Domain encapsulation:** Features like Chat, Admin, Realtime have dedicated isolated modules.
- **Stateless edge compute with Durable Objects:** Compute is stateless (`src/index.js`) but utilizes stateful components for real-time presence (`src/durable/message-queue.js`).

## Layers

**API Routing Layer:**
- Purpose: Route incoming requests, parse parameters, and return responses.
- Location: `src/routers/`
- Contains: Endpoint handlers structured by resource (`chat`, `users`, `files`).
- Depends on: `src/bootstrap/` for auth, `src/features/` for logic, `src/db.js` for data.
- Used by: `src/bootstrap/router-registry.js` via `src/index.js`.

**Feature / Domain Logic Layer:**
- Purpose: Core application business logic encapsulation (e.g., LLM integrations, async chat sessions).
- Location: `src/features/`, `src/chat/`
- Contains: Complex operations like AI chat runner, MCP server tool orchestration, background task processing.
- Depends on: DB interfaces, LLM clients.
- Used by: API Routers.

**Data Access / Infrastructure Layer:**
- Purpose: Wrapper around external storage/state (Cloudflare D1, KV, Durable Objects).
- Location: `src/db.js`, `src/durable/`
- Contains: Direct SQLite queries, Durable Object classes (`MessageQueueDO`).
- Depends on: Cloudflare Worker environment bindings (`env.DB`, `env.KV`).
- Used by: Almost all routes and features.

## Data Flow

### Primary Request Path (API)

1. Entry point evaluation (`src/index.js:52`)
2. Context and binding validation (`src/bootstrap/worker-context.js:77`)
3. Route handler matching (`src/bootstrap/router-registry.js:33`)
4. Data access and response formulation (`src/routers/chat.js:80`)

### Streaming LLM Chat Path

1. User sends message (`src/routers/chat-message.js`)
2. Request routed to assistant runner (`src/chat/assistant-runner.js`)
3. External model contacted via stream parser (`src/llm.js`)
4. Stream flushed back to client progressively using SSE helpers (`src/utils/response.js`)

**State Management:**
- Application state is persisted in Cloudflare D1.
- Real-time/transient synchronization happens via `RealtimeHubDO` Durable Object and `src/services/realtime-bus.js`.
- Client-side uses a lightweight reactive store (`public/js/shared/store.js`).

## Key Abstractions

**Route Definitions:**
- Purpose: Uniform handling of Request/Response per URL pattern.
- Examples: `src/routers/auth.js`, `src/routers/users.js`
- Pattern: Standard Cloudflare Worker Fetch signatures (`async (req, env, ctx, user, path) => Response`).

**Streaming SSE / Responses:**
- Purpose: Wrapping Standard HTTP fetch output into Server-Sent Events easily.
- Examples: `src/utils/response.js` (`sseData`, `sseHeaders`)

## Entry Points

**Worker Fetch Handler:**
- Location: `src/index.js`
- Triggers: Any incoming HTTP request to the worker
- Responsibilities: Pre-flight CORS, serving static assets, invoking API routers, top-level error capture.

**SPA Bootstrap:**
- Location: `public/js/bootstrap/app.js`
- Triggers: User landing on the browser UI
- Responsibilities: Initializing state, establishing routing, hydrating sessions.

## Architectural Constraints

- **Threading:** Cloudflare Workers use a single-threaded V8 isolate event loop model. CPU intensive work must be asynchronous or scheduled.
- **Global state:** In-memory caching/variables inside the worker are wiped on cold starts. Persistent state must utilize KV or D1.
- **Resource Limits:** Operations are subject to Cloudflare Worker limits (e.g., CPU time, Subrequest limits), meaning heavy tasks (like processing async sessions) use `ctx.waitUntil` or background processing.

## Anti-Patterns

### Heavy Business Logic in index.js

**What happens:** Defining specific URL matching and database calls directly inside `src/index.js`.
**Why it's wrong:** Clutters the entry point, bypasses context validation, makes the application monolithic and hard to test.
**Do this instead:** Define a new router in `src/routers/` and export it through `src/bootstrap/router-registry.js`.

### Bypassing Worker Context

**What happens:** Re-implementing JWT parsing or role checking directly in a router.
**Why it's wrong:** Creates security vulnerabilities or drift.
**Do this instead:** Rely on the `user` object passed down from `src/index.js` which derives from `src/bootstrap/worker-context.js`.

## Error Handling

**Strategy:** Centralized failure catching and graceful degradation.

**Patterns:**
- General try/catch around the `fetch` handler inside `src/index.js` emitting 500s safely.
- Specialized response utilities (`src/utils/response.js` using `error()`) returning consistent JSON payload shapes.

## Cross-Cutting Concerns

**Logging:** Standard `console.log` inside workers (which pushes to Cloudflare Logpush if observability is enabled in `wrangler.jsonc`).
**Validation:** Zod schemas are used heavily within domain modules and input bounds (`package.json` confirms `zod` usage).
**Authentication:** Custom JWT-based stateless auth checking in `src/bootstrap/worker-context.js`.

---

*Architecture analysis: [YYYY-MM-DD]*