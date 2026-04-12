# QA Test Case → Automated Test Matrix

Maps manual QA test case IDs (#1–#80) to their corresponding automated test files and current status.

> **Note:** File `03-rapid-testing-summary.md` has been renamed to [`known-issues.md`](./known-issues.md) since it's an unresolved-items tracker, not a test case file.

## Auth Tests (#1–#8)

| QA Test | Description | Automated Test File(s) | Status | Notes |
|---------|------------|----------------------|--------|-------|
| #1 | Auth page layout | `qa-comprehensive-check.test.js` | Partial | Static structure checked; visual contrast not automated |
| #2 | Registration form tab switching | `e2e/frontend/auth.spec.ts` | ✅ Covered | Register mode tested in E2E |
| #3 | Login error handling | `qa-comprehensive-check.test.js`, `e2e/frontend/auth.spec.ts` | ✅ Covered | Failed login E2E test |
| #4 | Registration + approval flow | `e2e/frontend/auth.spec.ts` | ✅ Covered | Successful register E2E test |
| #5–#8 | Home page layout, chat interface, model selector, sidebar | `qa-chat-interface.test.js`, unit tests | Partial | Static HTML structure checked; runtime behavior not tested E2E |

## Chat Tests (#9–#16)

| QA Test | Description | Automated Test File(s) | Status | Notes |
|---------|------------|----------------------|--------|-------|
| #9 | Chat creation | `e2e/frontend/chat.spec.ts` | ✅ Covered | New chat E2E test |
| #10 | Message sending | `e2e/frontend/chat.spec.ts` | ✅ Covered | Send message E2E test |
| #11 | Chat selection | `e2e/frontend/chat.spec.ts` | ✅ Covered | Chat selection E2E test |
| #12 | File attachment | — | ❌ No test | Not manually tested; no automated coverage |
| #13 | Voice input | — | ❌ No test | Not implemented yet (planned) |
| #14 | Tools menu | — | ❌ No test | Disabled intentionally |
| #15 | Model selector | `public-model-selector.test.js`, `public-model-selector-helpers.test.js` | ✅ Covered | Unit tested |
| #16 | Sidebar navigation | `public-sidebar-visibility.test.js` | ✅ Covered | Unit tested |

## Admin Tests (#17–#30)

| QA Test | Description | Automated Test File(s) | Status | Notes |
|---------|------------|----------------------|--------|-------|
| #17–#20 | Admin connections page | `e2e/frontend/admin-settings.spec.ts`, unit tests | Partial | Immediate-save modals tested E2E; full page not |
| #21–#24 | Form validation edge cases | `auth-form-validation.test.js`, `input-validation.test.js` | ✅ Covered | Backend validation unit tests |
| #25–#27 | Integrations tab | `e2e/frontend/admin-settings.spec.ts` | Partial | Modal save flows tested |
| #28 | Timestamps ("Unknown date") | — | ❌ No regression test | Known issue; no guard |
| #29 | Admin models page | `e2e/frontend/admin-settings.spec.ts`, unit tests | Partial | Model visibility display tested |
| #30 | Admin system general | `e2e/frontend/admin-settings.spec.ts` | Partial | Settings display tested |

## Accessibility (#31–#40)

| QA Test | Description | Automated Test File(s) | Status | Notes |
|---------|------------|----------------------|--------|-------|
| #31–#35 | Keyboard navigation, hover states | `qa-keyboard-navigation.test.js` | Partial | DOM pattern checks; no visual/real interaction testing |
| #36–#38 | Focus rings, contrast | `qa-focus-ring-contrast.test.js`, `qa-error-message-association.test.js` | Partial | Tailwind class string checks only |
| #39–#40 | Screen reader support | — | ❌ No test | Manual observation only |

## Settings & Advanced (#41–#62)

| QA Test | Description | Automated Test File(s) | Status | Notes |
|---------|------------|----------------------|--------|-------|
| #41–#48 | Admin settings operations | `e2e/frontend/admin-settings.spec.ts` | Partial | Immediate save architecture tested |
| #49–#54 | Admin user management (overview, roles, groups) | `public-admin-route-state.test.js`, `public-admin-users-overview.test.js` | Partial | Unit tests for rendering; no E2E |
| #55 | Connection error messaging | — | ❌ No test | Known opaque error message |
| #56–#58 | User settings modal | — | ❌ No E2E | Zero Playwright coverage for /account/** |
| #59–#62 | Admin policies, security, groups pages | — | ❌ No E2E | Manual observation only |

## Search, Mobile, Advanced (#63–#80)

| QA Test | Description | Automated Test File(s) | Status | Notes |
|---------|------------|----------------------|--------|-------|
| #63–#69 | Chat UI/UX analysis | `qa-chat-interface.test.js`, various unit tests | Partial | Static DOM checks only |
| #70–#71 | Prompt suggestion + message | `e2e/frontend/chat.spec.ts` | ✅ Covered | Chat spec covers messaging |
| #72–#75 | Model selector, more menu, sidebar, active states | `public-model-selector.test.js`, `public-sidebar-visibility.test.js`, `public-chat-list-actions.test.js` | Partial | Unit tested; E2E gap |
| #76–#79 | Admin table regressions | `e2e/frontend/admin-settings.spec.ts` | Partial | Some admin settings tested |
| #80 | Search modal | `public-search-modal.test.js`, `public-search-modal-helpers.test.js` | ✅ Covered | Comprehensive unit tests |

## Coverage Summary

| Status | Count | Percentage |
|--------|-------|-----------|
| ✅ Fully covered (E2E or strong unit tests) | 13 | 16% |
| ⚠️ Partially covered (static/unit checks only) | 40 | 50% |
| ❌ No automated coverage | 27 | 34% |

## Key Gaps

1. **Forgot password E2E** — QA #1 flagged as HIGH; modal exists but nobody tests end-to-end
2. **User settings modal** (`/account/**`) — Zero E2E coverage
3. **Admin users management** — No E2E for roles, groups, policies
4. **Connection error messaging** — No test for opaque error message
5. **Visual regression** — All QA findings are UI/UX; no Playwright `toHaveScreenshot()` guards
6. **Accessibility** — Only static class name checks; no contrast ratio or screen reader testing
