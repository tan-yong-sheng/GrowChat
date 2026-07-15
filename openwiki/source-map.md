# Source Map

## `/src/` — Backend (Cloudflare Worker)

### Entrypoint and Core

| File            | Purpose                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `index.js`      | Worker fetch handler, request dispatch, asset serving, SPA fallback            |
| `index.test.js` | Integration tests for fetch handler                                            |
| `db.js`         | D1 database client factory                                                     |
| `realtime.js`   | Re-exports realtime helpers from `features/realtime/`                          |
| `auth.js`       | Re-exports auth router                                                         |
| `llm.js`        | Primary LLM streaming entrypoint — resolves connections, streams from provider |

### Bootstrap (`/src/bootstrap/`)

| File                                         | Purpose                                                      |
| -------------------------------------------- | ------------------------------------------------------------ |
| `router-registry.js`                         | Ordered array of API route modules, public route definitions |
| `worker-context.js`                          | Auth resolution, user status, route binding validation       |
| `migration-audit.js` / `migration-runner.js` | Migration verification and execution                         |

### LLM System (`/src/llm/`)

| File                                                               | Purpose                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `provider-registry.js`                                             | Model ID format/parsing, provider family aliases (openai/google/anthropic) |
| `provider-adapters.js`                                             | Builds provider-specific request payloads                                  |
| `provider-adapters-google.js`                                      | Google/Gemini-specific adapter                                             |
| `provider-adapters-utils.js`                                       | Shared adapter utilities (builder helpers)                                 |
| `provider-adapters-shared.js`                                      | Common content formatting for all providers                                |
| `connections.js`                                                   | Connection config loading and model discovery                              |
| `connections-user.js`                                              | User-level connection helpers                                              |
| `connections-utils.js`                                             | Connection utility functions                                               |
| `stream-parser.js`                                                 | SSE stream parsing for LLM responses                                       |
| `stream-parser-handler.js`                                         | Provider-specific stream event handlers                                    |
| `stream-parser-handler-openai.js` / `-anthropic.js` / `-google.js` | Per-provider stream delta parsing                                          |
| `stream-parser-utils.js` / `-handler-helpers.js`                   | Shared stream parsing utilities                                            |
| `system-prompt.js`                                                 | System prompt builder                                                      |
| `model-state.js`                                                   | Model state tracking                                                       |
| `turn-policies/`                                                   | Per-provider turn continuation policies (openai/google/anthropic)          |

### Chat Engine (`/src/chat/`)

| File                               | Purpose                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `assistant-runner.js`              | Core streaming assistant — loads tools, builds request, manages streaming with tool call loops |
| `assistant-runner-stream-event.js` | SSE event creation for assistant streaming                                                     |
| `assistant-stream-utils.js`        | Constants (MAX_TOOL_STEPS, MAX_FOLLOW_UPS), heartbeat, chunk reading                           |
| `assistant-tool-executor.js`       | Executes tool calls from LLM (MCP tools)                                                       |
| `stream-lifecycle.js`              | Manages stream lifecycle — init, progress, completion                                          |
| `stream-finalize.js`               | Finalizes stream — saves messages, updates chat state                                          |
| `stream-utils.js`                  | Stream processing utilities                                                                    |
| `attachments.js`                   | File attachment processing for chat context                                                    |
| `mcp.js`                           | MCP tool server integration — loads servers, normalizes tools, builds MCP tool functions       |
| `tools.js`                         | Tool call delta application and normalization                                                  |

### Routers (`/src/routers/`)

Each router typically follows the pattern `(req, env, ctx, user, path, {requestId, logger}) => Response|null`.

| Router                               | Endpoints                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `public.js`                          | Health, shared chat viewing                                                        |
| `auth.js`                            | Login, token refresh, logout                                                       |
| `auth-register.js`                   | User registration                                                                  |
| `auth-password-reset.js`             | Password reset flow                                                                |
| `auth-change-password.js`            | Authenticated password change                                                      |
| `email-verification.js`              | Email verification                                                                 |
| `chat.js`                            | Chat CRUD (list, create, delete, update)                                           |
| `chat-core.js`                       | Core message operations, streaming session management                              |
| `chat-message.js`                    | Message retrieval                                                                  |
| `chat-message-send.js`               | Send message, stream initialization                                                |
| `chat-message-branch.js`             | Message branching                                                                  |
| `chat-message-helpers.js`            | Message formatting and citation helpers                                            |
| `chat-message-edit.js`               | Message editing                                                                    |
| `chat-history.js`                    | Chat history retrieval                                                             |
| `chat-collection.js` / `-ops.js`     | Chat collection operations                                                         |
| `files.js` + `files-*.js` (10 files) | File upload, download, delete, search, process status                              |
| `users.js` + `users/`                | User profile, user resources (connections, models, integrations)                   |
| `user-settings.js`                   | User preference settings                                                           |
| `user-profile.js`                    | Profile update                                                                     |
| `workspace-settings.js`              | Workspace-level settings                                                           |
| `models.js` + `models/`              | Model listing and discovery                                                        |
| `admin.js` + `admin/` (13 files)     | Admin: connections, models, tool servers, users, groups, roles, config, audit logs |
| `rbac.js` + `rbac-*.js`              | Role CRUD, permissions, bindings                                                   |
| `groups.js` + `groups-*.js`          | Group CRUD and membership                                                          |
| `realtime.js`                        | Real-time SSE endpoint                                                             |
| `session-management.js`              | Session listing and revocation                                                     |
| `oauth-shared.js`                    | MCP OAuth shared utilities                                                         |

### Admin Panel Backend (`/src/routers/admin/`)

| File                           | Purpose                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `admin-connections-list.js`    | List/provider-filter connections                                   |
| `admin-connections-access.js`  | Connection ACL management                                          |
| `admin-connections-save.js`    | Connection CRUD save operations                                    |
| `admin-tool-servers-crud.js`   | Tool server CRUD                                                   |
| `admin-tool-servers-access.js` | Tool server ACL management                                         |
| `admin-tool-servers-oauth.js`  | MCP OAuth registration                                             |
| `admin-config.js` + helpers    | System configuration (attachment caps, audit logs, general config) |
| `admin-email-security.js`      | Email security configuration                                       |
| `admin-helpers.js`             | Shared admin response utilities                                    |
| `admin-acl-groups-shared.js`   | ACL group helpers                                                  |

### Middleware

| File      | Purpose                                            |
| --------- | -------------------------------------------------- |
| `cors.js` | CORS origin validation (`ALLOWED_ORIGINS` env var) |

### Services (`/src/services/`)

| File                                | Purpose                                               |
| ----------------------------------- | ----------------------------------------------------- |
| `uploads.js`                        | File validation, R2 upload, metadata persistence      |
| `extraction.js`                     | Text extraction from uploaded files (OCR, plain text) |
| `parsers/`                          | File format parsers                                   |
| `email/`                            | Email sending via Resend                              |
| `audit-log.js` / `audit-logging.js` | Audit log write and query                             |
| `rate-limit.js`                     | Rate limiting                                         |
| `csrf.js`                           | CSRF token generation/validation                      |
| `realtime-bus.js`                   | Realtime event bus                                    |
| `workspace-settings.js`             | Workspace settings CRUD with caching                  |

### Utilities (`/src/utils/`)

| File                 | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| `authorize.js`       | Centralized authorization — permission resolution, denial codes |
| `authorize-audit.js` | Authorization audit event logging                               |
| `connection-acl.js`  | Per-connection ACL enforcement                                  |
| `model-acl.js`       | Per-model ACL enforcement                                       |
| `tool-server-acl.js` | Per-tool-server ACL enforcement                                 |
| `acl-shared.js`      | Shared ACL utilities (resolve scope, apply rules)               |
| `acl-rule-filter.js` | ACL rule matching                                               |
| `response.js`        | Response helpers (JSON, SSE, errors, SRI injection)             |
| `validation.js`      | Input validation utilities                                      |
| `sanitize.js`        | HTML sanitization                                               |
| `sri-hashes.js`      | SRI hash generation and injection                               |
| `logger.js`          | Structured JSON logging                                         |
| `memory-monitor.js`  | Memory usage monitoring                                         |
| `app-config.js`      | Application configuration loader                                |
| `db-helpers.js`      | Database helper utilities                                       |
| `rbac.js`            | RBAC utility re-exports                                         |

### Other Backend

| File                                                     | Purpose                                           |
| -------------------------------------------------------- | ------------------------------------------------- |
| `durable/message-queue.js`                               | Durable Object for realtime SSE                   |
| `errors/http-errors.js`                                  | HTTP error class hierarchy                        |
| `repositories/chat-repository.js` / `user-repository.js` | Data access repositories                          |
| `config/app.js`                                          | App configuration                                 |
| `validation/request.js`                                  | Request validation                                |
| `features/realtime/realtime.js`                          | Realtime SSE helpers                              |
| `features/chat/async-session-processor.js`               | Async session processing                          |
| `mcp/client.js`                                          | MCP protocol client (SSE parsing, retry, request) |

## `/public/js/` — Frontend (SPA)

### App Entry (`/public/js/`)

Key entry files (no `*.js` at root — look in `bootstrap/`):

| File                  | Purpose                |
| --------------------- | ---------------------- |
| `bootstrap/router.js` | Client-side SPA router |
| `bootstrap/app.js`    | Application bootstrap  |

### Features

| Directory  | Contents                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `chat/`    | 40+ files — full chat UI including message input, model selector, streaming display, sidebar, keyboard navigation, wire controllers |
| `account/` | 15 files — user settings: connections, models, integrations, security, account management                                           |
| `admin/`   | 20+ files — admin panel: users, roles, groups, connections, models, policies, audit logs, settings                                  |
| `auth/`    | 2 files — email verification pending/success pages                                                                                  |

### Shared

| Directory                        | Contents                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `components/`                    | 40+ reusable UI components (modals, search, sidebar, markdown, file modals, connection forms)                                           |
| `api/`                           | 12 API client modules — auth, chats, files, admin, models, resources, cache                                                             |
| `utils/`                         | 35+ utility modules — model filtering/search, connection helpers, SSE event handler, markdown rendering, form validation, DOM utilities |
| `store.js`                       | Global shared state store                                                                                                               |
| `realtime.js`                    | Client-side realtime SSE client                                                                                                         |
| `markdown-renderer.js` + related | Markdown parsing and rendering with LaTeX, code blocks, thinking blocks                                                                 |

## `/tests/`

| Directory | Contents                                                                                  |
| --------- | ----------------------------------------------------------------------------------------- |
| `unit/`   | 120+ unit tests for frontend and backend modules (Vitest, jsdom)                          |
| `e2e/`    | Playwright E2E tests: auth workflows, chat, connections, visual regression, accessibility |
| `shared/` | Test environment setup and Playwright global setup                                        |

## `/migrations/`

| File                            | Contents                                    |
| ------------------------------- | ------------------------------------------- |
| `001_initial.sql`               | Complete D1 schema (all core tables)        |
| `002_settings_permissions.sql`  | Settings, permission keys, workspace config |
| `003_password_reset_tokens.sql` | Password reset support                      |
| `004_email_verification.sql`    | Email verification codes                    |
| `005_message_editing.sql`       | Message edit tracking                       |
| `006_audit_logging.sql`         | Audit log detail columns                    |

## `/scripts/`

35+ scripts for: deployment (`setup-wizard.js`, `pre-deploy.js`), testing (`test-e2e.js`), quality gates (`fallow-dupes-gate.js`, `fallow-flags-gate.js`), maintenance (`audit-snapshots.js`, `cleanup-snapshots.js`), and CI (`pr-checks.js`, `run-scoped-guardrails.js`).

## `/docs/`

| Directory                      | Contents                                                               |
| ------------------------------ | ---------------------------------------------------------------------- |
| `adr/`                         | Architecture Decision Records (2 ADRs on role/policy/validation seams) |
| `backend/`                     | Backend documentation                                                  |
| `plans/`                       | Implementation plans (password change, refactor plans)                 |
| `ui-ux/`                       | UI/UX documentation                                                    |
| `DEPLOY.md`                    | Deployment guide                                                       |
| `index.md`                     | Documentation index                                                    |
| `OPEN_ISSUES_WORKFLOW_PLAN.md` | Open issues workflow plan                                              |
