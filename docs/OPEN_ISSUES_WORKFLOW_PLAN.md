# GrowChat Open Issues — Workflow Plan

> **Status:** In Progress  
> **Last Updated:** 2026-06-23  
> **Total Open Issues:** 22 (across 3 categories)

---

## 1. Overview

This document coordinates resolution of all open issues in the GrowChat repo across parallel workstreams.

### Workstreams

| Workstream            | Owner          | Branch                            | Issues                                              | Status         |
| --------------------- | -------------- | --------------------------------- | --------------------------------------------------- | -------------- |
| Security P0 Batch     | Jules AI       | `fix/security-p0-batch`           | #145-#157                                           | 🟡 Planning    |
| Functional Bug Fixes  | Jules AI       | `fix/functional-bugs-batch`       | #125, #126, #130, #142, #143, #144, #153-#161, #163 | 🟡 Planning    |
| Infra / Quality Gates | Jules AI       | `fix/infra-utility-batch`         | #72, #88, #96, #102, #108, #109, #112, #171, #172   | 🟡 Planning    |
| Test Coverage + CI    | Herdr Pane p1E | `feat/test-coverage-and-ci-fixes` | #164-#168, #125, #126                               | 🔵 In Progress |
| Current Feature       | Local          | `feat/delete-manual-models`       | #171, #172                                          | 🔵 In Progress |

---

## 2. Issue Inventory

### Category A: Security (7 issues) — Jules: `fix/security-p0-batch`

| Issue    | Title                                      | Priority | Expected Fix                                    |
| -------- | ------------------------------------------ | -------- | ----------------------------------------------- |
| #145     | Fix security vulnerability in auth flow    | 🔴 P0    | Harden JWT validation, constant-time comparison |
| #147     | XSS sanitization gap in message rendering  | 🔴 P0    | Add DOMPurify + CSP headers                     |
| #149     | SQL injection in dynamic query builder     | 🔴 P0    | Parameterized queries, input validation         |
| #151     | File upload type validation bypass         | 🔴 P0    | Whitelist MIME types, magic bytes check         |
| #152     | Missing rate limiting on auth endpoints    | 🔴 P0    | Add KV-backed rate limiter                      |
| #157     | Sensitive data exposure in error responses | 🔴 P0    | Scrub stack traces, user details from errors    |
| _(more)_ | Various security hardening                 | 🔴 P0    | See individual issue descriptions               |

**Success Criteria:**

- All security tests passing
- Semgrep security scan clean
- No new vulnerabilities in `npm audit`
- Manual review of auth + file upload flows

---

### Category B: Functional Bugs (6 issues) — Jules: `fix/functional-bugs-batch`

| Issue     | Title                                  | Priority | Expected Fix                             |
| --------- | -------------------------------------- | -------- | ---------------------------------------- |
| #125      | Chat session timeout on long responses | 🟡 P1    | SSE keepalive + Durable Object heartbeat |
| #126      | Admin panel routing conflict           | 🟡 P1    | Router priority fix, route guards        |
| #130      | Message history not loading for guests | 🟡 P1    | Guest session persistence in KV          |
| #142      | Persona info page 404 for non-admins   | 🟡 P1    | RBAC check fix, conditional rendering    |
| #143      | Connections page missing from nav      | 🟡 P1    | Add nav item + route registration        |
| #144      | Settings save silently fails           | 🟡 P1    | Add error toast + retry logic            |
| #153-#161 | Various UI glitches                    | 🟡 P1    | Per-issue fixes                          |
| #163      | Admin panel sidebar broken on mobile   | 🟡 P1    | Responsive CSS fixes                     |

**Success Criteria:**

- All bug reproduction cases produce expected behavior
- E2E tests pass (requires TEST_EMAIL/TEST_PASSWORD fix)
- Manual UI verification on mobile + desktop

---

### Category C: Quality Gates / Infra (9 issues)

Split across two workstreams:

#### C1: Jules — `fix/infra-utility-batch`

| Issue | Title                            | Priority | Expected Fix                                  |
| ----- | -------------------------------- | -------- | --------------------------------------------- |
| #72   | Add comprehensive test coverage  | 🟡 P1    | Unit tests for uncovered modules              |
| #88   | Improve connection management UX | 🟡 P1    | Better error handling + validation            |
| #96   | Enforce max-params ESLint rule   | 🟡 P1    | `max-params: 2`, refactor offending functions |
| #102  | Mutation testing threshold       | 🟡 P1    | Stryker config + target score >= 55%          |
| #108  | E2E credential setup broken      | 🟡 P1    | Fix `test-e2e.js` + `.dev.vars` loading       |
| #109  | prepush lint-staged not running  | 🟡 P1    | Fix husky hooks + lint-staged config          |
| #112  | Missing type coverage            | 🟡 P1    | JSDoc types for key modules                   |

#### C2: Herdr Pane p1E — `feat/test-coverage-and-ci-fixes`

| Issue | Title                              | Priority | Expected Fix                                |
| ----- | ---------------------------------- | -------- | ------------------------------------------- |
| #164  | Chat history tests incomplete      | 🟡 P1    | Complete `chat-history.test.js`             |
| #165  | Message helpers tests failing      | 🟡 P1    | Fix `chat-message-helpers.test.js` mocks    |
| #166  | Request validation tests broken    | 🟡 P1    | Fix pre-existing `request.test.js` failure  |
| #167  | Admin settings coverage gap        | 🟡 P1    | Add admin-settings tests                    |
| #168  | E2E auth setup missing credentials | 🟡 P1    | Fix `.dev.vars` → `process.env` propagation |

**Success Criteria:**

- `pnpm run prepush` passes (all tests green)
- ESLint `max-params: ['error', { max: 2 }]` enforced with zero warnings
- Stryker mutation score >= 55%
- `pnpm run lint:fix` exits 0
- Test coverage report generated with valid %

---

## 3. Coordination Notes

### Known Overlaps

- **max-params enforcement**: Both Herdr pane (p1E) AND Jules `fix/infra-utility-batch` are targeting #96/#125-#126. **Resolution**: Herdr pane owns the actual refactoring; Jules should focus on test coverage + cleanup.
- **E2E credential fix**: Both Herdr pane AND Jules `fix/infra-utility-batch` touch `scripts/test-e2e.js`. **Resolution**: Already fixed in current branch (2026-06-23 14:43). Jules should rebase.
- **Mutation score**: Herdr pane targets #102; Jules `fix/infra-utility-batch` also references it. **Resolution**: Whoever finishes first "wins"; the other should rebase and verify.

## 4. Execution Checklist

### Phase 1: Foundation (Current)

- [x] Delegate all issues to Jules AI sessions (3 parallel)
- [x] Notify Herdr pane p1E of overlap
- [ ] Herdr pane p1E: Mutation score >= 55%
- [ ] Herdr pane p1E: `max-params` enforced + zero warnings
- [ ] Herdr pane p1E: `prepush` clean

### Phase 2: Jules Batch PRs

- [ ] Jules batch #1: `fix/security-p0-batch` PR opened
- [ ] Jules batch #2: `fix/functional-bugs-batch` PR opened
- [ ] Jules batch #3: `fix/infra-utility-batch` PR opened
- [ ] Review all 3 PRs for conflicts with each other

### Phase 3: Integration

- [ ] Merge `feat/test-coverage-and-ci-fixes` into main
- [ ] Merge `fix/security-p0-batch` into main (after review)
- [ ] Merge `fix/functional-bugs-batch` into main (after review)
- [ ] Merge `fix/infra-utility-batch` into main (after rebase + review)

### Phase 4: Verification

- [ ] `pnpm run prepush` clean on main
- [ ] All E2E tests pass with fresh checkout
- [ ] `npm audit` clean
- [ ] Final security review (manual)

---

## 5. Monitoring

### Jules Sessions

| Session         | URL                                                   | Branch                      |
| --------------- | ----------------------------------------------------- | --------------------------- |
| Security P0     | https://jules.google.com/session/12925866257782038832 | `fix/security-p0-batch`     |
| Functional Bugs | https://jules.google.com/session/10299054481365775325 | `fix/functional-bugs-batch` |
| Infra/Utility   | https://jules.google.com/session/17898051158479311412 | `fix/infra-utility-batch`   |

### Herdr Pane

| Pane | Status     | CWD                         | Agent |
| ---- | ---------- | --------------------------- | ----- |
| p1E  | 🔵 working | `/mnt/data/Coding/GrowChat` | pi    |

---

## 6. Risk & Blockers

| Risk                                 | Likelihood | Impact | Mitigation                                      |
| ------------------------------------ | ---------- | ------ | ----------------------------------------------- |
| Jules PRs conflict with each other   | Medium     | High   | Review all 3 before merging                     |
| Jules PR conflicts with Herdr pane   | Medium     | High   | Notify pane; rebase whichever finishes last     |
| Mutation score target unattainable   | Low        | Medium | Lower threshold to 50% if 55% proves infeasible |
| Security fixes introduce regressions | Medium     | High   | Add regression tests + manual verification      |
| E2E tests flaky in CI                | Medium     | Medium | Add retry logic + screenshot artifacts          |

---

## 7. Rollback Plan

If any Jules PR introduces regressions:

1. `git revert <merge-commit>` on main
2. Open follow-up issue labeled `regression`
3. Re-assign to Jules with specific failure context

---

_Generated 2026-06-23. Update as workstreams progress._
