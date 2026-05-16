# Testing Patterns

**Analysis Date:** [YYYY-MM-DD]

## Test Framework

**Runner:**
- Vitest for Unit tests (Environment: node or jsdom via `// @vitest-environment jsdom`).
- Playwright for E2E tests (`@playwright/test`).
- Config: `vitest.config.js`, `playwright.config.ts`.

**Assertion Library:**
- Vitest's built-in `expect` for unit.
- Playwright's `expect` for E2E.

**Run Commands:**
```bash
npx vitest              # Run all unit tests
npx playwright test     # Run all E2E tests
```

## Test File Organization

**Location:**
- Unit tests: Co-located with source `src/**/*.test.js` or inside dedicated directories `tests/unit/**/*.test.js`.
- E2E tests: Located in `tests/e2e/frontend/`.

**Naming:**
- Unit: `[module].test.js` (e.g., `public-chat-ui-resources.test.js`, `auth.test.js`).
- E2E: `[feature].spec.ts` (e.g., `auth.spec.ts`).

**Structure:**
```
[project-root]/
├── src/
│   └── [module].test.js
└── tests/
    ├── unit/
    │   └── [feature].test.js
    └── e2e/
        ├── frontend/
        │   └── [feature].spec.ts
        └── fixtures/
```

## Test Structure

**Suite Organization:**
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('feature name', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('performs specific behavior', async () => {
    // Setup
    // Act
    // Assert
  });
});
```

**Patterns:**
- `beforeEach` heavily used to reset mocks (`vi.restoreAllMocks()`) and DOM state (`document.body.innerHTML = ...`).

## Mocking

**Framework:** Vitest mock utilities (`vi`)

**Patterns:**
```javascript
const loadSearchModal = vi.fn(async () => ({ renderSearchModal: vi.fn() }));
const fetchToolServers = vi.fn().mockResolvedValue({ servers: [{ id: 't1' }] });
const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-1');
```

**What to Mock:**
- Network requests (`apiFetch`, `fetchToolServers`).
- DOM specific globals (`URL.createObjectURL`).
- Module imports (using injected dependencies/configuration objects).

**What NOT to Mock:**
- Internal pure functional logic.

## Fixtures and Factories

**Test Data:**
- Simple inline objects used for configuration dependencies.
- Playwright: Uses JSON files for state persistence (e.g., `tests/e2e/fixtures/auth-state.json`).

**Location:**
- `tests/e2e/fixtures/`

## Coverage

**Requirements:** None enforced rigidly, but tracking configured.

**View Coverage:**
- Configured in `vitest.config.js` via V8 provider. Generates `text`, `html`, and `json` reporters.

## Test Types

**Unit Tests:**
- Scope: Backend routing, internal logic, frontend components, state utils.
- Execution: node environment mostly, jsdom when DOM interaction is needed.

**Integration Tests:**
- Scope: Database operations tested against local DB stubs (`src/db.test.js`).

**E2E Tests:**
- Framework: Playwright (`chromium-guest`, `chromium-auth` projects).
- Tests flow via browser interacting with rendered `.html` files and DOM selectors.

## Common Patterns

**Async Testing:**
```javascript
it('handles async updates', async () => {
  await resources.loadSearchModalModule();
  expect(loadSearchModal).toHaveBeenCalledTimes(1);
});
```

**DOM Testing (Vitest with jsdom):**
```javascript
const container = document.createElement('div');
// ... acts on container ...
expect(container.querySelector('img')?.src).toContain('blob:mock-1');
```

---

*Testing analysis: [YYYY-MM-DD]*