# GrowChat — OpenWiki

> A self-hosted, multi-user Cloudflare Workers chat application with multi-provider LLM support, MCP tool integration, RBAC, file uploads, and real-time streaming.

## Quick Overview

GrowChat is a full-featured chat application built entirely on [Cloudflare Workers](https://workers.cloudflare.com/). Users can chat with multiple LLM providers (OpenAI, Anthropic, Google/Gemini), upload and analyze files, use MCP (Model Context Protocol) tool servers, and manage connections, models, and permissions through admin and user settings panels.

**Key technologies:** Cloudflare Workers, D1 (SQLite), R2, KV, Durable Objects, Tailwind CSS, vanilla JavaScript frontend, Vitest + Playwright.

## Repository Map

| Area                | Path                                                      | Description                                                                 |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Entry point**     | `/src/index.js`                                           | Worker fetch handler, request routing, asset serving                        |
| **API routes**      | `/src/routers/`                                           | 13 route modules: auth, chat, admin, files, models, RBAC, groups, etc.      |
| **LLM engine**      | `/src/llm/`                                               | Provider adapters, stream parsing, MCP tool integration, turn policies      |
| **Chat backend**    | `/src/chat/`                                              | Assistant runner, tool executor, stream lifecycle, attachments              |
| **Frontend**        | `/public/js/`                                             | Vanilla JS with ES modules, Tailwind CSS, no framework                      |
| **Admin panel**     | `/public/js/features/admin/` + `/src/routers/admin/`      | User/group management, connections, models, tool servers, audit logs        |
| **Auth**            | `/src/routers/auth*.js` + `/public/js/features/auth/`     | JWT with refresh rotation, registration, password reset, email verification |
| **Files/RAG**       | `/src/services/uploads.js`, `/src/routers/files*.js`      | R2 uploads, OCR, text extraction, semantic chunking                         |
| **RBAC/ACL**        | `/src/utils/authorize.js`, `/src/utils/connection-acl.js` | Role-based access, per-connection and per-model ACLs                        |
| **Durable Objects** | `/src/durable/message-queue.js`                           | Realtime SSE via Durable Objects (MessageQueueDO)                           |
| **Tests**           | `/src/**/*.test.js`, `/tests/unit/`, `/tests/e2e/`        | Vitest unit tests + Playwright E2E + Stryker mutation                       |

## Documentation Sections

- [Architecture Overview](architecture/overview.md) — Cloudflare Workers architecture, routing pipeline, data storage, request lifecycle
- [Source Map](source-map.md) — Navigate every major source directory and what it contains
- [Key Workflows & Domain Concepts](workflows.md) — Chat streaming, LLM provider resolution, tool execution, file uploads
- [RBAC, Authorization & Security](domain/rbac-and-security.md) — Permission model, connection ACLs, model ACLs, audit logging
- [Operations & Testing](operations.md) — Deployment, CI/CD, testing strategies, quality gates
- [Integrations](integrations.md) — Email (Resend), MCP tool servers, file storage (R2)

## Recent Git History (HEAD: `81383eb8`)

The repository has been undergoing a sustained **complexity decomposition initiative** — systematically extracting inline logic into named helpers, sharing utilities across modules, and reducing function complexity. Recent commits focus on:

- **chat:** Temp-message resolution helpers, thinking segment decomposition, keyboard handler maps, stream callback defaults
- **llm:** Connection field helpers, discovery URL builders, content block adapters, finish reason classification
- **account/admin:** Save helpers extraction, modal handler decomposition, integrations event refactoring
- **shared utilities:** Scope-label extraction, model-filter field scans, math block line processors, JSON parsing
- **autoresearch experiments:** Complexity metrics tracking (dupes, health score) with scoring system

## Backlog

- **PDF file support** — Planned Phase 3 feature (source: `README.md`)
- **Chat sharing and exports** — Planned Phase 3 feature
- **Advanced analytics dashboard** — Planned Phase 3 feature
- **Workers AI re-enablement** — Currently disabled (`src/llm.js` rejects `@cf/` models)
