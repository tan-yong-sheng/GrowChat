# ADR 001: Refactor by Boundary

## Status
Accepted

## Context
GrowChat had large routers and a frontend chat module that mixed transport, validation, state, and business rules.

## Decision
Split code by responsibility:

**Backend:**
- `src/routers/` — HTTP adapters that stay thin and delegate business logic outward. May have subfolders (`admin/`, `chat/`, `models/`) for canonical entry points.
- `src/chat/` — Chat-domain helpers and stream/tool orchestration primitives (not an HTTP routing layer).
- `src/llm/` — Provider registry, adapters, connections, policy selection, and streaming transport helpers.
- `src/services/` — Reusable services (audit logging, CSRF, rate limiting, realtime bus, uploads, extraction, workspace settings, email).
- `src/bootstrap/` — Worker startup, bindings, route registration, migration runner, and compatibility checks. Should stay thin, never grows feature logic.
- `src/utils/` — Shared backend utilities (app config, authorization, user-role resolution).
- `src/admin/` — Admin-specific service logic (e.g., tool server management).
- `src/durable/` — Durable Objects (e.g., `MessageQueueDO` for SSE keepalive).

**Frontend:**
- `public/js/bootstrap/` — App entry, bootstrap sequence, session setup, skeletons/shells.
- `public/js/features/` — Feature modules lazy-loaded on demand (`chat/`, `admin/`, `account/`).
- `public/js/shared/` — Shared components, API client, store, utils imported by multiple features.
- `public/js/utils/` — Standalone utility modules (some may be vestigial — see `shared/utils/`).

## Consequences
- Smaller files and clearer ownership
- Easier regression testing
- Less accidental coupling between routes and helpers
- README.md in each boundary directory documents its responsibilities
