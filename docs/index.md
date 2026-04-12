# GrowChat Documentation

## Architecture

- [Frontend Architecture](./architecture/frontend-overview.md) — SPA design, routing, bootstrap, state management, module patterns
- [Project Structure](./architecture/project-structure.md) — Complete directory map of all code (backend + frontend + tests)
- [ADR 001: Refactor by Boundary](./adr/001-refactor-boundaries.md) — Code organization by responsibility
- [ADR 002: Forward-Only Migration Policy](./adr/002-migration-policy.md) — Database migration conventions
- [ADR 003: Shared Workspace Settings](./adr/003-workspace-settings-boundaries.md) — Shared admin/account settings architecture

## API Reference

- [API Index](./api/README.md)
- [Public Routes](./api/public-routes.md)
- [Auth Routes](./api/auth-routes.md)
- [User Routes](./api/user-routes.md)
- [Chat Routes](./api/chat-routes.md)
- [Files Routes](./api/files-routes.md)
- [Models Routes](./api/models-routes.md)
- [Admin Routes](./api/admin-routes.md)
- [RBAC & Groups Routes](./api/rbac-routes.md)
- [Realtime Routes](./api/realtime-routes.md)

## Testing

- [Test Strategy](./testing/test-strategy.md) — Test layers, frameworks, commands, coverage gaps
- [QA Test Matrix](./qa/test-matrix.md) — Maps QA test IDs #1–#80 to automated test files
- [QA Test Cases](./qa/test-cases/) — Manual test case documents with evidence
- [Known Issues](./qa/known-issues.md) — Unresolved issues and partially-tested features

## QA Test Cases (Manual)

- [01: Authentication](./qa/test-cases/01-authentication.md) — Tests #1–#4
- [02: Home Page](./qa/test-cases/02-home-page.md) — Tests #5–#8
- [Known Issues](./qa/known-issues.md) — Unresolved issues tracker (formerly 03-rapid-testing-summary)
- [04: Admin Settings](./qa/test-cases/04-admin-settings.md) — Tests #41–#55
- [05: User Settings & Admin Pages](./qa/test-cases/05-user-settings-admin-pages.md) — Tests #56–#62
- [06: Search, Mobile, Advanced](./qa/test-cases/06-search-mobile-advanced.md) — Tests #63–#80

## Deployment & Database

- [Database Schema](./database/schema.md) — 22 tables, seed data, relationships, migration policy
- **Deployment:** See `AGENTS.md` (Secrets, Local Dev, Deploy, Bindings)
