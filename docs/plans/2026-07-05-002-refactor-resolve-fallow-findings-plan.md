---
title: Resolve Fallow Architecture Findings — Complexity, Duplication, Dead Code, and Security Hygiene
type: refactor
status: active
date: 2026-07-05
origin: docs/plans/2026-07-05-refactor-users-connections-complexity.md
---

# Resolve Fallow Architecture Findings — Complexity, Duplication, Dead Code, and Security Hygiene

## Summary

Systematically reduce the codebase's fallow warning surface by completing the in-progress router extractions, then refactoring the remaining critical complexity hotspots, extracting shared helpers for the highest-impact duplication clusters, removing dead code, and addressing verified security sinks. Work is delivered in small, CI-green waves so scoped guardrails stay passable and each wave lands independently.

---

## Problem Frame

The migration to Fallow exposed a large backlog of architecture hygiene issues that the previous knip/jscpd setup did not catch: 294 complexity hotspots, 210 duplication clusters, 5 dead-code issues, and 162 security findings. Several backend routers exceed complexity thresholds by 3–4×, frontend duplication is concentrated in authentication and integration UI code, and many `innerHTML` assignments are flagged as potential XSS sinks. The team is already mid-refactor on `feat/knip-jscpd-to-fallow`, so the plan must finish that work without losing the existing passing test suite, then move through the remaining findings in bounded phases.

---

## Requirements

- R1. Complete and commit the in-progress `files.js` and `users-mcp.js` router extractions on `feat/knip-jscpd-to-fallow` with all tests passing.
- R2. Resolve the 5 immediate `fallow dead-code` issues (unused file, unresolved imports from extracted handlers).
- R3. Reduce cyclomatic and cognitive complexity of the top backend router hotspots so each dispatcher and extracted handler falls below the 30 threshold.
- R4. Reduce the top frontend complexity hotspots and duplication clusters by extracting shared helpers, not by adding suppressions.
- R5. Verify or fix the highest-priority security findings (dangerous-html sinks and SSRF candidates); suppress only after explicit verification that the sink is safe.
- R6. Keep the CI guardrails green: every wave must pass `pnpm run test`, scoped fallow checks, lint, and typecheck before it is considered complete.
- R7. Update the Fallow baseline and any affected CI steps so that pre-existing issues do not block new work.

---

## Scope Boundaries

- In scope: router extraction/refactor, shared-helper extraction for duplication, dead-code removal, security-sink verification/remediation, and CI baseline updates.
- Out of scope: functional behavior changes, new features, database schema changes, redesigning the frontend component architecture, and migrating frameworks.
- Security work is limited to verification/remediation of dangerous-html and SSRF sinks inside the application runtime code; build/dev-script findings are reviewed but may be deferred if they are local-only tooling.

### Deferred to Follow-Up Work

- Lower-priority security findings in build scripts and one-off admin UIs that are not reachable from untrusted input.
- All 294 complexity hotspots below the critical/high severity bands once the top 20–30 hotspots are addressed.
- Duplication clusters below the top 15–20 contributors to the overall 9.8% duplication budget.

---

## Context & Research

### Relevant Code and Patterns

- The existing `docs/plans/2026-07-05-refactor-users-connections-complexity.md` plan establishes the canonical router-extraction pattern: dispatcher + handlers + helpers, complexity target < 30, preserve response shapes and audit metadata.
- In-progress extractions already follow this pattern in `src/routers/files.js` and `src/routers/users/users-mcp.js`.
- `docs/adr/0001-role-policy-and-email-validation-seams.md` and `docs/adr/0002-architecture-guardrails-for-role-and-validation-seams.md` require routers to stay thin: role checks live in `role-policy`, permission decisions in `authorize.js`, and input validation in `validation/request.js`.
- `.semgrep/rules.yml` forbids inline role checks in `src/routers/**/*.js`.
- `eslint.config.cjs` enforces backend layering and `max-params: 2`.
- `scripts/run-scoped-guardrails.js` and `.github/workflows/guardrails.yml` use `--changed-since` baselines so only new issues block CI.

### Institutional Learnings

- The `users-connections` plan shows that route dispatchers should become lookup tables and handlers should use early-return guard clauses.
- Active branches `fix/security-p0-batch`, `fix/infra-utility-batch`, and `feat/test-coverage-and-ci-fixes` already target overlapping security and max-params work; this plan must coordinate with them to avoid duplicate effort.

### External References

- Fallow CLI documentation and `--baseline`, `--changed-since`, and `--fail-on-issues` behavior as observed locally (fallow 2.104.0).

---

## Key Technical Decisions

- **Continue from the current branch**: The in-progress `files.js` and `users-mcp.js` extractions are the starting state. The first phase commits this work rather than restarting from `main`.
- **Wave-based delivery**: Hotspots are grouped by domain and risk, not by severity rank alone, so each wave is reviewable and CI-green.
- **Dispatcher pattern for all backend routers**: Every monolithic router becomes a dispatcher that imports per-route handlers. This mirrors the `users-connections` plan and keeps Semgrep/ESLint boundary rules satisfied.
- **Suppress only verified safe sinks**: For security findings, prefer sanitization or safe DOM APIs over blanket `// fallow-ignore` comments. Suppressions are acceptable only when the taint source is demonstrably trusted.
- **Scoped guardrails are the blocking gate**: Full-project fallow scans remain advisory in CI; only scoped scans block merges. The plan updates baselines after each wave so the advisory scans stay honest but do not break CI.

---

## Open Questions

### Resolved During Planning

- **Should the plan address all 294 hotspots at once?** No — waves target the critical/high bands and top contributors first; remaining issues are deferred to follow-up work.
- **Should security findings in `scripts/` be fixed now?** Only if they are reachable from untrusted input or affect CI safety; local-only dev-tool findings are deferred.

### Deferred to Implementation

- Exact handler boundaries for each router will be determined by reading the route branches during implementation.
- Final duplication-helper names and module locations will be chosen once the clone groups are inspected side-by-side.

---

## Phased Delivery

### Phase 1 — Stabilize Current Branch

Commit the open `files.js` and `users-mcp.js` extractions, fix the 5 dead-code issues, and update the Fallow baseline so the branch is green.

### Phase 2 — Backend Router Complexity Wave 1

Extract the next three critical backend routers: admin config, RBAC, and groups.

### Phase 3 — Backend Router Complexity Wave 2

Extract chat and auth routers, plus the users-connections router using the existing detailed plan.

### Phase 4 — Backend Router Complexity Wave 3

Extract models routers and the stream parser handler.

### Phase 5 — Frontend Hotspots and Duplication

Refactor the top frontend controllers and extract shared helpers for the highest-impact duplication clusters.

### Phase 6 — Security Hygiene and Guardrails

Verify and fix dangerous-html/SSRF sinks, update CI baselines, and document the new conventions.

---

## Implementation Units

### U1. Stabilize In-Progress Router Extractions

**Goal:** Land the partially completed `files.js` and `users-mcp.js` extractions cleanly with all tests passing and no fallow dead-code issues.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**

- Modify: `src/routers/files.js`, `src/routers/files.test.js`
- Modify: `src/routers/users/users-mcp.js`
- Create/keep: `src/routers/files-*.js`, `src/routers/users/mcp-*.js`
- Delete: `tmp-wrapper.js`
- Test: `src/routers/files.test.js`, `src/routers/users/users-mcp.test.js`

**Approach:**

- Ensure every extracted handler uses the same public call signature expected by tests.
- Remove the unused `tmp-wrapper.js` file.
- Fix the four unresolved `../../env.js` imports in the new `mcp-*` handler files by importing from the correct relative path or adding the import to fallow ignore configuration if it is a legitimate runtime-resolved module.
- Update `.fallow/baseline.json` if needed after dead-code cleanup.
- Commit the wave before moving on.

**Patterns to follow:**

- The dispatcher pattern already proven in `src/routers/users/users-mcp.js`.

**Test scenarios:**

- Happy path: `pnpm run test` passes for `files.test.js` and `users-mcp.test.js`.
- Edge case: `fallow dead-code --baseline .fallow/baseline.json` reports 0 new issues.
- Integration: `pnpm run lint` and `pnpm run typecheck` pass.

**Verification:**

- All 3706 unit tests pass.
- `fallow dead-code --baseline .fallow/baseline.json` exits 0.
- No new ESLint or Semgrep violations.

---

### U2. Backend Router Complexity Wave 1 — Admin, RBAC, Groups

**Goal:** Extract `handleAdminConfig`, `rbacRouter`, and `groupsRouter` into dispatcher + handler modules, reducing each function's complexity below 30.

**Requirements:** R3, R6

**Dependencies:** U1

**Files:**

- Modify: `src/routers/admin/admin-config.js`, `src/routers/rbac.js`, `src/routers/groups.js`
- Create: `src/routers/admin/admin-config-*.js`, `src/routers/rbac-*.js`, `src/routers/groups-*.js`
- Test: existing test files for these routers

**Approach:**

- Use the dispatcher + handlers + helpers pattern.
- Move route branches into per-method handler files.
- Keep role/authorization checks delegated to `authorize.js` and `role-policy`; do not inline them in the dispatcher.
- Preserve exact response status codes, error messages, and audit metadata.

**Patterns to follow:**

- `docs/plans/2026-07-05-refactor-users-connections-complexity.md`
- `src/routers/users/users-mcp.js` dispatcher shape

**Test scenarios:**

- Happy path: each router's existing happy-path tests still pass.
- Edge case: unknown routes return the same `null` or 404 behavior as before.
- Error path: authorization failures and validation errors produce the same status/message pairs.
- Integration: audit event metadata shape is unchanged.

**Verification:**

- `fallow health` no longer lists the three functions as critical.
- Each dispatcher and handler is below 30 cyclomatic and 30 cognitive complexity.
- Full test suite passes.

---

### U3. Backend Router Complexity Wave 2 — Chat Collection, Chat Message, Auth

**Goal:** Extract `chatCollectionRouter`, `chatMessageRouter`, and `authRouter` using the dispatcher pattern.

**Requirements:** R3, R6

**Dependencies:** U2

**Files:**

- Modify: `src/routers/chat-collection.js`, `src/routers/chat-message.js`, `src/routers/auth.js`
- Create: per-route handler files under `src/routers/chat/`, `src/routers/auth/`
- Test: existing router test files

**Approach:**

- Extract route blocks into handlers grouped by HTTP method and path pattern.
- Move shared helpers (e.g., token parsing, chat membership checks) into adjacent helper modules.
- Keep `src/routers/chat-message.js` reactive-prop handling unchanged; only split the routing logic.

**Patterns to follow:**

- Same dispatcher pattern as U2.

**Test scenarios:**

- Happy path: chat list, chat message, and auth flows pass existing tests.
- Edge case: unauthenticated and unauthorized requests return the same responses.
- Error path: malformed bodies and missing parameters return the same validation errors.
- Integration: cross-router interactions (e.g., auth token refresh -> chat access) still work.

**Verification:**

- `fallow health` critical list no longer includes these three functions.
- All chat and auth tests pass.

---

### U4. Backend Router Complexity Wave 3 — Models and Stream Parser

**Goal:** Extract the models routers (`handleAdminModelsSettings`, `handlePublicModelsCrud`, `handleAdminModelsAccess`) and `handleParsed` into smaller functions.

**Requirements:** R3, R6

**Dependencies:** U3

**Files:**

- Modify: `src/routers/models/models-admin-settings.js`, `src/routers/models/models-public-crud.js`, `src/routers/models/models-admin-access.js`
- Modify: `src/llm/stream-parser-handler.js`
- Create: handler/helper modules alongside each modified file
- Test: existing model router tests and stream-parser tests

**Approach:**

- For model routers, split CRUD and access-control route blocks into handlers.
- For `handleParsed`, decompose the streaming parse loop into state-machine phases or per-event handler functions.
- Preserve the exact SSE delta contract and tool-call semantics.

**Patterns to follow:**

- Dispatcher pattern for routers; function decomposition for `handleParsed`.

**Test scenarios:**

- Happy path: model CRUD, model discovery, and chat streaming produce identical responses.
- Edge case: empty model lists and malformed stream chunks behave as before.
- Error path: upstream OpenAI errors are mapped to the same status/reason.
- Integration: streaming message deltas are still stored correctly.

**Verification:**

- All model and LLM tests pass.
- `fallow health` no longer flags these functions as critical.

---

### U5. Extract Users-Connections Router

**Goal:** Implement the already-approved `users-connections` refactor plan.

**Requirements:** R3, R6

**Dependencies:** U4

**Files:**

- Modify: `src/routers/users/users-connections.js`
- Create: `src/routers/users/users-connections.handlers.js`, `src/routers/users/users-connections.helpers.js`
- Test: `src/routers/users/users-connections.test.js`, `src/routers/connections-user.test.js`

**Approach:**

- Follow `docs/plans/2026-07-05-refactor-users-connections-complexity.md` exactly.
- Create helpers for account-status guard, body parsing, audit wrapping, and test-connection builders.
- Create handlers for list, create, update, delete, and test routes.
- Replace the sequential `if` chain with a `ROUTES` lookup table.

**Patterns to follow:**

- The referenced plan and the `users-mcp.js` dispatcher.

**Test scenarios:**

- Happy path: list, create, update, delete, and test connection routes pass.
- Edge case: `test` path is excluded from the personal-connection ID regex.
- Error path: pending accounts, invalid headers, and unsafe URLs return the same errors.
- Integration: audit events preserve actor, action, resource type, and metadata.

**Verification:**

- `fallow health` reports `handleUsersConnections` below 30/30.
- All connection tests pass.

---

### U6. Frontend Hotspots and Duplication Reduction

**Goal:** Reduce the top frontend complexity hotspots and extract shared helpers for the highest-impact duplication clusters.

**Requirements:** R4, R6

**Dependencies:** U1

**Files:**

- Modify: `public/js/bootstrap/auth.js`, `public/js/bootstrap/session-bootstrap.js`, `public/js/features/account/account-connections.js`, `public/js/features/account/account-integrations.js`, `public/js/features/chat/chat-realtime-controller.js`, and others as needed
- Create: shared helper modules under `public/js/shared/utils/` or `public/js/shared/ui/`
- Test: existing frontend unit tests

**Approach:**

- Extract duplicated blocks into named helpers (e.g., auth-mode UI toggles, chat list refresh, JWT payload decode, saving-state button rendering).
- Decompose complex event handlers (`onRealtimeEvent`, `mergeSavedServer`, `mergeSavedConnection`) into smaller functions by event type or operation.
- Keep DOM and API contracts unchanged.

**Patterns to follow:**

- Existing `public/js/shared/` utilities.

**Test scenarios:**

- Happy path: login, chat realtime events, and connection/integrations UI still work.
- Edge case: missing DOM elements are handled gracefully.
- Error path: network failures produce the same user-facing behavior.
- Integration: extracted helpers are used by both original call sites.

**Verification:**

- Frontend unit tests pass.
- `fallow dupes` duplication percentage drops measurably from the current ~9.8%.
- `fallow health` no longer lists the targeted frontend functions as critical.

---

### U7. Security Sink Verification and Remediation

**Goal:** Address the highest-priority security findings by verifying safe usage or switching to safe APIs.

**Requirements:** R5, R6

**Dependencies:** U1

**Files:**

- Modify: `public/js/shared/components/search-modal-controller.js`, `public/js/features/admin/admin-controller.js`, and other flagged public/js files
- Modify: `src/mcp/client.js`, `src/admin/tool-servers.js`, `src/routers/admin/admin-tool-servers-oauth.js`, `src/routers/users/mcp-oauth.js`
- Test: existing tests plus new focused tests where behavior changes

**Approach:**

- For `dangerous-html` findings, verify whether the assigned value is already sanitized (e.g., by DOMPurify) or is a static/trusted string. If not, sanitize or switch to `textContent`/safe DOM construction.
- For SSRF findings, validate that URLs are constructed from trusted configuration, not user input, or add explicit allow-list validation.
- For `scripts/seed-test-user.js` secret-log findings, remove password/token material from log output.
- Coordinate with the `fix/security-p0-batch` branch to avoid duplicate work.

**Patterns to follow:**

- Existing DOMPurify usage in the frontend.
- `isSafeOutboundUrl` pattern already used in OAuth flows.

**Test scenarios:**

- Happy path: trusted HTML still renders correctly after sanitization.
- Edge case: untrusted HTML is neutralized without breaking layout.
- Error path: unsafe URLs are rejected with the same error responses.
- Integration: security findings resolved in Fallow no longer appear.

**Verification:**

- `fallow security` no longer reports the remediated findings.
- No regressions in E2E tests for affected UI flows.

---

### U8. Update Guardrails, Baselines, and Documentation

**Goal:** Keep CI honest by updating fallow baselines, scoped guardrails, and developer documentation.

**Requirements:** R7, R6

**Dependencies:** U1–U7

**Files:**

- Modify: `.fallowrc.json`, `.fallow/baseline.json`
- Modify: `package.json` fallow scripts if needed
- Modify: `.github/workflows/guardrails.yml` if needed
- Create/update: `docs/plans/` records for any new extraction patterns

**Approach:**

- Regenerate `.fallow/baseline.json` after each wave using `fallow dead-code --output .fallow/baseline.json --format json`.
- Ensure scoped guardrails only block on new issues in changed files.
- Document the dispatcher + handlers + helpers pattern in the developer wiki so future routers follow it.

**Patterns to follow:**

- Existing CI baseline workflow established during the knip→fallow migration.

**Test scenarios:**

- Happy path: `pnpm run prepush` passes after each wave.
- Edge case: introducing a new unused export in a changed file is caught by scoped dead-code.
- Integration: CI "Local + CI guardrails" check passes on the PR.

**Verification:**

- `pnpm run prepush` exits 0.
- `fallow health --changed-since HEAD~1` and `fallow dupes --changed-since HEAD~1` exit 0 on the final branch.
- Documentation is updated in `docs/backend/architecture/` or `docs/ui-ux/` as appropriate.

---

## System-Wide Impact

- **Interaction graph:** Router dispatchers become the single entry point for route handlers; downstream service calls remain unchanged.
- **Error propagation:** Existing error response shapes and status codes are preserved; only the internal routing layer changes.
- **State lifecycle risks:** No database schema changes. Streaming message delta handling is refactored but must preserve the exact SSE contract.
- **API surface parity:** No public API changes.
- **Integration coverage:** E2E tests for chat, auth, admin, files, and connections must pass after each wave.
- **Unchanged invariants:** All HTTP route contracts, JWT behavior, role/permission decisions, and audit metadata shapes remain the same.

---

## Risks & Dependencies

| Risk                                                                                             | Mitigation                                                                                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Active branches (`fix/security-p0-batch`, `fix/infra-utility-batch`) conflict with refactor work | Rebase frequently and defer security fixes that are already covered by `fix/security-p0-batch`. |
| Test mocks break when handler signatures change                                                  | Keep dispatcher signatures stable and extract handlers without altering vi.mock targets.        |
| Router extraction introduces regressions in route matching order                                 | Add integration/E2E coverage for route edge cases and preserve the original dispatch sequence.  |
| Frontend duplication helpers create cross-module coupling                                        | Keep helpers focused on DOM/utility primitives, not business logic.                             |
| Security fixes change rendering behavior                                                         | Add visual/E2E regression tests for affected components.                                        |
| Large diff is hard to review                                                                     | Deliver in waves; each wave is one commit/PR.                                                   |

---

## Documentation / Operational Notes

- Update `docs/backend/architecture/` with the dispatcher + handlers + helpers router pattern.
- Update `docs/ui-ux/` if shared UI helpers change component conventions.
- After each wave, regenerate `.fallow/baseline.json` and commit it.

---

## Sources & References

- **Origin document:** [docs/plans/2026-07-05-refactor-users-connections-complexity.md](docs/plans/2026-07-05-refactor-users-connections-complexity.md)
- **Related ADRs:** [docs/adr/0001-role-policy-and-email-validation-seams.md](docs/adr/0001-role-policy-and-email-validation-seams.md), [docs/adr/0002-architecture-guardrails-for-role-and-validation-seams.md](docs/adr/0002-architecture-guardrails-for-role-and-validation-seams.md)
- **Related PR:** #270 (knip + jscpd → Fallow migration)
- **Fallow findings:** captured locally from `fallow health`, `fallow dupes`, `fallow dead-code`, and `fallow security` on 2026-07-05.
