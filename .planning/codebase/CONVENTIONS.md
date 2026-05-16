# Coding Conventions

**Analysis Date:** [YYYY-MM-DD]

## Naming Patterns

**Files:**
- Kebab-case observed for mostly all files: `public-chat-ui-resources.test.js`, `http-errors.js`, `chat-message-actions.js`.
- Source files: `.js` for standard modules, `.ts` for some Playwright tests.

**Functions:**
- camelCase for functions: `sanitizeUser`, `isActiveAccount`, `ensureUserRoleBinding`.

**Variables:**
- camelCase for instances and standard variables.
- UPPER_SNAKE_CASE for constants: `PASSWORD_RESET_TTL_SECONDS`, `RATE_LIMITS`.

**Types:**
- JavaScript usage heavily observed over TypeScript in core application code; JSDoc comments sparingly used.

## Code Style

**Formatting:**
- Prettier
- Settings: single quotes (`singleQuote: true`), trailing comma ES5 (`trailingComma: "es5"`), 2 space indent (`tabWidth: 2`), `printWidth: 100`.

**Linting:**
- ESLint (configured via `eslint.config.cjs`)
- Recommended JS rules, warning on unused vars, disabling console rule (`no-console: "off"`). EcmaVersion 2024.

## Import Organization

**Order:**
1. Core/Node modules (`import { createDB } from '../db.js';`).
2. Internal utilities and helpers.
3. Component/Shared dependencies.

**Path Aliases:**
- Relative paths are extensively used (`../shared/api.js`, `../../shared/components/settings-shell.js`).

## Error Handling

**Patterns:**
- Standard `try/catch` blocks used heavily for asynchronous operations.
- Graceful degradation: failing operations (e.g. missing tables) log a warning and return or continue.
- HTTP Responses: Structured responses using custom helper `error()` from `src/utils/response.js`.

## Logging

**Framework:** `console`

**Patterns:**
- `console.warn` and `console.error` are heavily used for catching explicit errors (e.g. `console.warn('Failed to load user connections:', err?.message || err);`).
- `console.log` used sporadically for standard extraction statuses or script output.

## Comments

**When to Comment:**
- Explaining explicit internal logic choices or fallback handling (e.g., `// Explicit allowlist: only 'active' is treated as active.`).

**JSDoc/TSDoc:**
- Type annotations using JSDoc occasionally seen (`// @ts-check` in configs).

## Function Design

**Size:** Concise, single-responsibility functions preferred.

**Parameters:** Standard positional arguments; destructuring used when passing configuration objects.

**Return Values:** Return clean objects (e.g. `sanitizeUser` returns a filtered object map) or use explicit helpers for routing.

## Module Design

**Exports:** 
- Named exports standard (`export { hashPassword, signJWT... }`).
- Barrel files export extensively (`export * from './api/auth.js'`).

---

*Convention analysis: [YYYY-MM-DD]*