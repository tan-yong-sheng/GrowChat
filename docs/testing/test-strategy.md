# Test Strategy

## Test Layers

GrowChat uses three test layers: **Unit**, **E2E**, and **Integration**.

## Unit Tests (Vitest)

**Framework:** Vitest 4.0.18 + jsdom

**Test file patterns:**
- `src/**/*.test.js` — Colocated backend unit tests
- `tests/unit/**` — Dedicated unit test directory

**What's tested:**
- Backend router handlers (auth, chat, files, models, etc.)
- Frontend JS modules (`public/**/*.test.js`)
- UI static analysis (DOM structure checks via jsdom)
- Backend services (auth, CSRF, email, migration, extraction)

**Commands:**
```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage   # Coverage report (coverage/ folder)
```

**Coverage includes:** Specific `public/js/` modules only.
**Coverage excludes:** `*.test.js`, `components/`, `bootstrap/auth.js`, `chat.js`, `admin.js`.

## E2E Tests (Playwright)

**Framework:** Playwright 1.58.2

**Test directory:** `tests/e2e/frontend/`

**Test specs:**
| File | Project | Coverage |
| --- | --- | --- |
| `auth.spec.ts` | `chromium-guest` | Login, register, failed login, failed register, successful flows |
| `chat.spec.ts` | `chromium-auth` | New chat, chat selection, send message, empty msg prevention, streaming |
| `admin-settings.spec.ts` | `chromium-auth` | Immediate save architecture, modal saves, connection ACL, model display |

**How E2E works:** E2E tests serve static files via `python3 -m http.server 3007` (NOT `wrangler dev`). API calls are mocked at the network level.

**Commands:**
```bash
npm run test:e2e        # Run all E2E tests
npm run test:e2e:ui     # Playwright UI mode
npm run test:e2e:update-snapshots  # Update visual snapshots
```

**E2E Projects:**
- `chromium-guest` — Unauthenticated flows (auth.spec.ts)
- `chromium-auth` — Authenticated flows (chat.spec.ts, admin-settings.spec.ts) — requires `tests/e2e/fixtures/auth-state.json`

**⚠️ Security Note:** `tests/e2e/fixtures/auth-state.json` contains real user credentials. These should be replaced with mock/fake tokens.

## RBAC Tests (Design Spec — Not Executable)

**Files:** `tests/rbac.test.js`, `tests/rbac.integration.test.js`

These are **design documentation**, not executable tests. They export functions but contain no Vitest assertions (`describe/it/expect`). All `PASS` results are literal return values, not test assertions.

These files are **not executed** by `npm test` and serve as RBAC specification/checklists.

## QA-Related Unit Tests

The following unit tests were created to codify QA findings:

| File | Purpose |
| --- | --- |
| `qa-chat-interface.test.js` | HTML structure of `index.html` |
| `qa-comprehensive-check.test.js` | Auth HTML: inputs, modals, forgot/reset password |
| `qa-error-message-association.test.js` | ARIA attributes on error/alert divs |
| `qa-focus-ring-contrast.test.js` | CSS class checks for focus rings |
| `qa-keyboard-navigation.test.js` | Keyboard accessibility patterns |
| `qa-message-input-ctrl-enter.test.js` | Ctrl+Enter / Cmd+Enter send, Shift+Enter multiline |
| `qa-mobile-responsiveness.test.js` | Viewport meta, touch targets, responsive classes |

## Test Matrix

See [../qa/test-matrix.md](../qa/test-matrix.md) for traceability between QA test case IDs and automated test files.

## Coverage Areas

### Well-Tested
- Auth flows (login, register, E2E)
- Chat creation and messaging (E2E + unit)
- Admin settings immediate-save pattern (E2E)
- Core backend routes (unit tests for most routers)
- Model selector (unit)
- Search modal (unit)
- Sidebar visibility (unit)

### Gaps
- Forgot password end-to-end flow
- Admin users management (roles, groups, policies)
- User settings modal (`/account/**`)
- Connection test error messaging
- Visual regression testing
