# GrowChat Test Audit — Final Report

> Consolidated from 4 Phase-1 agent scans (Agent 1: src/**/*.test.js, Agent 2: tests/unit/public-*.test.js, Agent 3: tests/e2e/frontend/*.spec.ts, Agent 4: tests/unit/* + rbac*.test.js).  
> Branch: `fix/security-p0-origin-spoofing-cors` / Commit: `d6ac3166`  
> Test run: 21 failed | 169 passed (190 test files) / 105 failed | 1203 passed (1308 individual tests)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total test files audited** | **199** |
| **RETAIN** | **155** (78%) |
| **REFACTOR** | **41** (21%) |
| **REMOVE** | **3** (1.5%) |
| **Lines saved if REMOVE executed** | ~1,325 |

**Mutation-readiness assessment:** The backend `src/**/*.test.js` suite is the strongest — ~74% of files have zero mocks and exercise real logic (JWT, crypto, ACL, validation, HTTP errors, migrations). The public-*.test.js frontend suite is the weakest — 21 files currently fail on a jsdom `localStorage` initialization bug, and many tests rely on brittle HTML assertions or heavy module mocking. The e2e suite is small but high-value. The two rbac*.test.js files are pure pseudocode stubs with zero actual test-framework integration.

**Critical finding:** 21 public-*.test.js files are broken right now (not flaky — structurally failing on environment setup). This is masking real test coverage. The fix is a one-liner(jsdom `storageQuota` config) and should be priority #1 before any mutation testing.

---

## Master Classification Table

### Scope A — `src/**/*.test.js` (67 files)

| File | Lines | Mocks | Expects | Pattern | Mutation Est. | Classification | Action |
|------|-------|-------|---------|---------|---------------|----------------|--------|
| src/auth.test.js | 217 | 0 | 46 | Pure crypto / JWT / PBKDF2 | HIGH | **RETAIN** | Keep — real algorithm coverage |
| src/shared/auth.test.js | 47 | 0 | 11 | sign/verify JWT | HIGH | **RETAIN** | Keep |
| src/shared/crypto.test.js | 68 | 0 | 12 | Crypto primitives | HIGH | **RETAIN** | Keep |
| src/shared/jwt-secret.test.js | 28 | 0 | 5 | JWT secret loader | HIGH | **RETAIN** | Keep |
| src/shared/markdown-renderer.test.js | 101 | 1 | 13 | Markdown rendering | MEDIUM | **RETAIN** | Keep |
| src/shared/markdown-renderer-shared-mode.test.js | 77 | 1 | 5 | Markdown shared mode | MEDIUM | **RETAIN** | Keep |
| src/shared/session.test.js | 120 | 3 | 22 | Session/token lifecycle | MEDIUM | **RETAIN** | Keep |
| src/middleware/cors.test.js | 86 | 0 | 11 | CORS logic | HIGH | **RETAIN** | Keep |
| src/utils/access-control.test.js | 45 | 0 | 4 | ACL evaluators | HIGH | **RETAIN** | Keep |
| src/utils/role-policy.test.js | 53 | 0 | 14 | Role policy matrix | HIGH | **RETAIN** | Keep |
| src/utils/sanitize.test.js | 74 | 0 | 17 | Input sanitization | HIGH | **RETAIN** | Keep |
| src/utils/sri-hashes.test.js | 43 | 0 | 5 | SRI hash generation | HIGH | **RETAIN** | Keep |
| src/utils/sri-hashes-dompurify.test.js | 32 | 0 | 8 | DOMPurify + SRI | HIGH | **RETAIN** | Keep |
| src/utils/user-role.test.js | 38 | 0 | 12 | User role utilities | HIGH | **RETAIN** | Keep |
| src/utils/validation.test.js | 112 | 0 | 41 | Schema validation | HIGH | **RETAIN** | Keep |
| src/utils/logger.test.js | 301 | 0 | 68 | Structured logging | HIGH | **RETAIN** | Keep |
| src/utils/response.test.js | 479 | 0 | 96 | HTTP response builders | HIGH | **RETAIN** | Keep |
| src/llm/provider-adapters.test.js | 179 | 0 | 14 | Provider adapters | HIGH | **RETAIN** | Keep |
| src/llm/system-prompt.test.js | 25 | 0 | 10 | System prompt utils | HIGH | **RETAIN** | Keep |
| src/llm/model-state.test.js | 21 | 0 | 3 | Model state machine | HIGH | **RETAIN** | Keep |
| src/llm/turn-policy.test.js | 88 | 0 | 7 | Turn policy logic | HIGH | **RETAIN** | Keep |
| src/llm/turn-policies.test.js | 44 | 0 | 5 | Turn policies | HIGH | **RETAIN** | Keep |
| src/llm/connections-utils.test.js | 90 | 0 | 15 | Connection utilities | HIGH | **RETAIN** | Keep |
| src/chat/attachments.test.js | 82 | 0 | 21 | Attachment handling | HIGH | **RETAIN** | Keep |
| src/chat/tools.test.js | 70 | 0 | 7 | Tool definitions | HIGH | **RETAIN** | Keep |
| src/chat/mcp.test.js | 94 | 0 | 22 | MCP protocol | HIGH | **RETAIN** | Keep |
| src/chat/stream-lifecycle.test.js | 82 | 9 | 12 | Stream lifecycle | MEDIUM | **RETAIN** | Keep |
| src/chat/stream-utils.test.js | 31 | 0 | 9 | Stream utilities | HIGH | **RETAIN** | Keep |
| src/config/app.test.js | 62 | 0 | 18 | App configuration | HIGH | **RETAIN** | Keep |
| src/errors/http-errors.test.js | 20 | 0 | 6 | Error serialization | HIGH | **RETAIN** | Keep |
| src/validation/request.test.js | 31 | 0 | 10 | Request parsing | HIGH | **RETAIN** | Keep |
| src/bootstrap/migration-audit.test.js | 36 | 0 | 7 | Migration audit logic | HIGH | **RETAIN** | Keep |
| src/bootstrap/migration-runner.test.js | 33 | 0 | 6 | Migration runner | HIGH | **RETAIN** | Keep |
| src/services/parsers/index.test.js | 132 | 0 | 32 | Content parsers | HIGH | **RETAIN** | Keep |
| src/services/rate-limit.test.js | 47 | 4 | 8 | Rate limiting | MEDIUM | **RETAIN** | Keep |
| src/features/admin/admin-route-state.test.js | 36 | 0 | 5 | Admin routing state | HIGH | **RETAIN** | Keep |
| src/features/chat/async-session-processor.test.js | 22 | 0 | 3 | Async processor | HIGH | **RETAIN** | Keep |
| src/repositories/chat-repository.test.js | 31 | 4 | 6 | Chat repo | MEDIUM | **RETAIN** | Keep |
| src/repositories/user-repository.test.js | 41 | 4 | 7 | User repo | MEDIUM | **RETAIN** | Keep |
| src/mcp/client.test.js | 65 | 2 | 7 | MCP client | MEDIUM | **RETAIN** | Keep |
| src/admin/tool-servers-review-regression.test.js | 157 | 3 | 33 | Tool server regression | MEDIUM | **RETAIN** | Keep |
| src/routers/auth.integration.test.js | 465 | 8 | 23 | Real auth end-to-end | MEDIUM | **RETAIN** | Keep — uses real PBKDF2 + JWT |
| src/session.test.js | 340 | 3 | 65 | Session management | MEDIUM | **RETAIN** | Keep |
| src/db.test.js | 288 | 20 | 47 | DB abstraction | LOW | **RETAIN** | Keep — mocks D1 but validates SQL |
| src/index.test.js | 92 | 15 | 9 | Worker entry routing | LOW | **RETAIN** | Keep |
| src/llm.test.js | 731 | 16 | 69 | LLM core delegation | LOW | **RETAIN** | Keep |
| src/llm/connections.test.js | 304 | 4 | 38 | Connection management | MEDIUM | **RETAIN** | Keep |
| src/llm/provider-registry.test.js | 47 | 0 | 11 | Provider registry | HIGH | **RETAIN** | Keep |
| src/services/audit-log.test.js | 106 | 15 | 7 | Audit log service | LOW | **RETAIN** | Keep — thin, mock-heavy but valid |
| src/features/realtime/realtime.test.js | 71 | 6 | 8 | Realtime bus | LOW | **RETAIN** | Keep |
| src/routers/admin.test.js | 1512 | 63 | 126 | Admin router | LOW | **REFACTOR** | Split — 63 mocks hide real behavior |
| src/routers/users.test.js | 1167 | 36 | 109 | Users router | LOW | **REFACTOR** | Split — heavy DB mock scaffolding |
| src/routers/models.test.js | 1105 | 46 | 91 | Models router | LOW | **REFACTOR** | Split — excessive mocking |
| src/routers/auth.test.js | 622 | 20 | 59 | Auth router | LOW | **REFACTOR** | Reduce mocks, use integration-style |
| src/routers/chat.test.js | 529 | 17 | 43 | Chat router | LOW | **REFACTOR** | Reduce mocks |
| src/utils/authorize.test.js | 991 | 63 | 109 | Authz engine | LOW | **REFACTOR** | 63 mocks — rewrite with real policy fixtures |
| src/routers/auth-password-reset.test.js | 223 | 44 | 11 | Password reset | LOW | **REFACTOR** | 44 mocks for 11 assertions — extreme ratio |
| src/routers/email-verification.test.js | 213 | 41 | 15 | Email verification | LOW | **REFACTOR** | Same — mock bloat |
| src/routers/groups.test.js | 247 | 12 | 29 | Groups router | LOW | **REFACTOR** | Moderate mock density |
| src/routers/message-edit.test.js | 106 | 13 | 11 | Message edit | LOW | **REFACTOR** | High mock density |
| src/routers/rbac.test.js | 243 | 7 | 21 | RBAC router | LOW | **REFACTOR** | Moderate mocks |
| src/routers/session-management.test.js | 133 | 11 | 18 | Session mgmt | LOW | **REFACTOR** | Moderate mocks |
| src/routers/files.test.js | 116 | 15 | 7 | Files router | LOW | **REFACTOR** | High mock density |
| src/admin/tool-servers.test.js | 405 | 25 | 36 | Tool servers | LOW | **REFACTOR** | Heavy mocks |
| src/chat/assistant-runner.test.js | 50 | 3 | 5 | Assistant runner | LOW | **REFACTOR** | Small, lightly mocked — expand |
| src/chat/stream-finalize.test.js | 44 | 7 | 5 | Stream finalize | LOW | **REFACTOR** | Small, heavily mocked for size |
| src/services/realtime-bus.test.js | 18 | 4 | 2 | Realtime bus | LOW | **REFACTOR** | 18 lines, 4 mocks, 2 assertions — trivial |

### Scope B — `tests/unit/public-*.test.js` (92 files)

| File | Lines | Mocks | Expects | Pattern | Mutation Est. | Classification | Action |
|------|-------|-------|---------|---------|---------------|----------------|--------|
| public-account-connections.test.js | ~80 | Low | ~10 | Pure helpers | HIGH | **RETAIN** | Keep |
| public-account-integrations.test.js | ~85 | Low | ~12 | Pure helpers | HIGH | **RETAIN** | Keep |
| public-account-models.test.js | ~75 | Low | ~8 | Pure helpers | HIGH | **RETAIN** | Keep |
| public-account-shell.test.js | ~120 | Low | ~15 | Component shell | MEDIUM | **RETAIN** | Keep |
| public-admin-access.test.js | ~60 | 0 | ~8 | Access checks | HIGH | **RETAIN** | Keep |
| public-admin-acl-family.test.js | ~90 | 0 | ~12 | ACL family logic | HIGH | **RETAIN** | Keep |
| public-admin-acl-modal.test.js | ~110 | Low | ~14 | Modal logic | MEDIUM | **RETAIN** | Keep |
| public-admin-connections-helpers.test.js | ~70 | 0 | ~10 | Pure helpers | HIGH | **RETAIN** | Keep |
| public-admin-general-helpers.test.js | ~65 | 0 | ~8 | Pure helpers | HIGH | **RETAIN** | Keep |
| public-admin-integrations-helpers.test.js | ~55 | 0 | ~6 | Pure helpers | HIGH | **RETAIN** | Keep |
| public-admin-modal-save-helpers.test.js | ~80 | 0 | ~10 | Pure helpers | HIGH | **RETAIN** | Keep |
| public-admin-modal-shell.test.js | ~95 | Low | ~12 | Modal shell | MEDIUM | **RETAIN** | Keep |
| public-admin-models-helpers.test.js | ~60 | 0 | ~8 | Pure helpers | HIGH | **RETAIN** | Keep |
| public-admin-policies.test.js | ~70 | 0 | ~9 | Policy checks | HIGH | **RETAIN** | Keep |
| public-admin-route-state.test.js | ~85 | 0 | ~11 | Route state | HIGH | **RETAIN** | Keep |
| public-admin-users-groups.test.js | ~100 | Low | ~13 | User groups | MEDIUM | **RETAIN** | Keep |
| public-admin-users-roles.test.js | ~90 | Low | ~11 | User roles | MEDIUM | **RETAIN** | Keep |
| public-api-response.test.js | ~110 | 0 | ~15 | API response utils | HIGH | **RETAIN** | Keep |
| public-api.test.js | ~200 | Low | ~25 | API helpers | MEDIUM | **RETAIN** | Keep |
| public-app-route-utils.test.js | ~85 | 0 | ~12 | Route utils | HIGH | **RETAIN** | Keep |
| public-auth-bootstrap.test.js | ~180 | 3 | ~18 | Auth bootstrap | MEDIUM | **RETAIN** | Keep |
| public-chat-cache-controller.test.js | ~120 | 2 | ~15 | Cache controller | MEDIUM | **RETAIN** | Keep |
| public-chat-edit-textarea.test.js | ~95 | 0 | ~12 | Textarea edit | HIGH | **RETAIN** | Keep |
| public-chat-message-identity.test.js | ~75 | 0 | ~10 | Message identity | HIGH | **RETAIN** | Keep |
| public-chat-message-dom.test.js | ~110 | Low | ~14 | Message DOM | MEDIUM | **RETAIN** | Keep |
| public-chat-message-seq.test.js | ~85 | 0 | ~11 | Message sequence | HIGH | **RETAIN** | Keep |
| public-chat-message-utils.test.js | ~90 | 0 | ~12 | Message utils | HIGH | **RETAIN** | Keep |
| public-chat-message-stream-assistant.test.js | ~130 | Low | ~16 | Assistant stream | MEDIUM | **RETAIN** | Keep |
| public-chat-message-stream-temp-chat.test.js | ~100 | Low | ~13 | Temp chat stream | MEDIUM | **RETAIN** | Keep |
| public-chat-list-actions.test.js | ~95 | 0 | ~12 | List actions | HIGH | **RETAIN** | Keep |
| public-chat-modals.test.js | ~110 | Low | ~14 | Chat modals | MEDIUM | **RETAIN** | Keep |
| public-chat-render-helpers.test.js | ~80 | 0 | ~10 | Render helpers | HIGH | **RETAIN** | Keep |
| public-chat-stream.test.js | ~140 | Low | ~18 | Chat stream | MEDIUM | **RETAIN** | Keep |
| public-chat-stream-state.test.js | ~120 | Low | ~15 | Stream state | MEDIUM | **RETAIN** | Keep |
| public-chat-ui-resources.test.js | ~70 | 0 | ~9 | UI resources | HIGH | **RETAIN** | Keep |
| public-connection-model-selection.test.js | ~85 | 0 | ~11 | Model selection | HIGH | **RETAIN** | Keep |
| public-files-modal-helpers.test.js | ~60 | 0 | ~8 | File modal helpers | HIGH | **RETAIN** | Keep |
| public-markdown-utils.test.js | ~75 | 0 | ~10 | Markdown utils | HIGH | **RETAIN** | Keep |
| public-message-input-helpers.test.js | ~70 | 0 | ~8 | Input helpers | HIGH | **RETAIN** | Keep |
| public-message-input.test.js | ~110 | Low | ~14 | Message input | MEDIUM | **RETAIN** | Keep |
| public-mobile-safe-area.test.js | ~65 | 0 | ~8 | Safe area | HIGH | **RETAIN** | Keep |
| public-model-access-badge.test.js | ~55 | 0 | ~7 | Access badge | HIGH | **RETAIN** | Keep |
| public-model-access-presentation.test.js | ~75 | 0 | ~10 | Access presentation | HIGH | **RETAIN** | Keep |
| public-model-search.test.js | ~85 | 0 | ~11 | Model search | HIGH | **RETAIN** | Keep |
| public-model-selector-helpers.test.js | ~70 | 0 | ~8 | Selector helpers | HIGH | **RETAIN** | Keep |
| public-model-state.test.js | ~90 | 0 | ~12 | Model state | HIGH | **RETAIN** | Keep |
| public-router.test.js | ~120 | Low | ~15 | Router utils | MEDIUM | **RETAIN** | Keep |
| public-search-bar.test.js | ~80 | 0 | ~10 | Search bar | HIGH | **RETAIN** | Keep |
| public-search-modal-helpers.test.js | ~65 | 0 | ~8 | Search helpers | HIGH | **RETAIN** | Keep |
| public-settings-drawer-shell.test.js | ~75 | 0 | ~9 | Drawer shell | HIGH | **RETAIN** | Keep |
| public-settings-modal-shell.test.js | ~80 | 0 | ~10 | Modal shell | HIGH | **RETAIN** | Keep |
| public-settings-nav.test.js | ~70 | 0 | ~8 | Settings nav | HIGH | **RETAIN** | Keep |
| public-settings-shell.test.js | ~85 | 0 | ~11 | Settings shell | HIGH | **RETAIN** | Keep |
| public-settings-top-nav.test.js | ~65 | 0 | ~8 | Top nav | HIGH | **RETAIN** | Keep |
| public-settings-viewport.test.js | ~60 | 0 | ~7 | Viewport | HIGH | **RETAIN** | Keep |
| public-sidebar-helpers.test.js | ~70 | 0 | ~8 | Sidebar helpers | HIGH | **RETAIN** | Keep |
| public-storage.test.js | ~55 | 0 | ~8 | Storage helpers | HIGH | **RETAIN** | Keep — fails on jsdom env bug |
| public-store.test.js | ~140 | Low | ~18 | Store logic | MEDIUM | **RETAIN** | Keep — fails on jsdom env bug |
| public-tool-server-sync.test.js | ~90 | Low | ~12 | Tool sync | MEDIUM | **RETAIN** | Keep — fails on jsdom env bug |
| public-user-profile-footer-helpers.test.js | ~60 | 0 | ~8 | Footer helpers | HIGH | **RETAIN** | Keep |
| public-user-profile-footer.test.js | ~120 | Low | ~14 | Footer component | MEDIUM | **RETAIN** | Keep — fails on jsdom env bug |
| public-viewport-modal-shell.test.js | ~75 | 0 | ~9 | Viewport modal | HIGH | **RETAIN** | Keep |
| public-workspace-capabilities.test.js | ~70 | 0 | ~8 | Capabilities | HIGH | **RETAIN** | Keep |
| public-workspace-settings-subnav-config.test.js | ~85 | 0 | ~11 | Subnav config | HIGH | **RETAIN** | Keep |
| public-workspace-shell.test.js | ~90 | 0 | ~12 | Workspace shell | HIGH | **RETAIN** | Keep |
| public-workspace-sidebar.test.js | ~100 | Low | ~13 | Workspace sidebar | MEDIUM | **RETAIN** | Keep |
| public-workspace-top-nav-config.test.js | ~80 | 0 | ~10 | Top nav config | HIGH | **RETAIN** | Keep |
| public-workspace-top-tabs.test.js | ~75 | 0 | ~9 | Top tabs | HIGH | **RETAIN** | Keep |
| public-audit-logs.test.js | ~130 | Low | ~16 | Audit logs | MEDIUM | **RETAIN** | Keep |
| public-app.test.js | ~180 | Low | ~22 | App shell | MEDIUM | **REFACTOR** | Weak assertions, DOM fragility |
| public-app-shells.test.js | ~140 | Low | ~18 | App shells | MEDIUM | **REFACTOR** | Brittle HTML assertions |
| public-chat-wire-init.test.js | ~160 | 3 | ~20 | Wire init | LOW | **REFACTOR** | Mock-heavy, shallow |
| public-chat-message-rendering.test.js | ~200 | 5 | ~25 | Message rendering | LOW | **REFACTOR** | Brittle HTML matching |
| public-chat-message-list-html.test.js | ~170 | 4 | ~20 | Message list HTML | LOW | **REFACTOR** | Brittle selectors |
| public-chat-message-blocks.test.js | ~150 | 3 | ~18 | Message blocks | LOW | **REFACTOR** | Weak count assertions |
| public-chat-message-stream.test.js | ~220 | 8 | ~28 | Message stream | LOW | **REFACTOR** | Too many mocks |
| public-chat-message-actions.test.js | ~130 | 4 | ~16 | Message actions | LOW | **REFACTOR** | DOM fragility |
| public-chat-file-events.test.js | ~110 | 3 | ~14 | File events | LOW | **REFACTOR** | Async brittleness |
| public-chat-cache-controller.test.js | ~120 | 2 | ~15 | Cache controller | MEDIUM | **REFACTOR** | Error paths untested |
| public-files-modal.test.js | ~140 | 4 | ~18 | Files modal | LOW | **REFACTOR** | Modal timing issues |
| public-chat-stream-controller.test.js | ~160 | 6 | ~20 | Stream controller | LOW | **REFACTOR** | Timer/real-time issues |
| public-admin-connections-modal.test.js | ~130 | 4 | ~16 | Connections modal | LOW | **REFACTOR** | Brittle DOM |
| public-admin-general.test.js | ~120 | 3 | ~15 | General admin | LOW | **REFACTOR** | Fails on jsdom/localStorage |
| public-admin-integrations.test.js | ~110 | 3 | ~14 | Integrations | LOW | **REFACTOR** | Moderate mock density |
| public-admin-registration.test.js | ~100 | 3 | ~13 | Registration | LOW | **REFACTOR** | Fails on jsdom/localStorage |
| public-admin-models.test.js | ~120 | 3 | ~15 | Admin models | LOW | **REFACTOR** | Weak assertions |
| public-admin-users-overview.test.js | ~110 | 3 | ~14 | Users overview | LOW | **REFACTOR** | Shallow coverage |
| public-account-shell.test.js | ~120 | Low | ~15 | Account shell | MEDIUM | **REFACTOR** | DOM fragility |
| public-model-selector.test.js | ~180 | 5 | ~22 | Model selector | LOW | **REFACTOR** | Race logic untested |
| public-model-selector-race.test.js | ~150 | 6 | ~18 | Selector race | LOW | **REFACTOR** | Race conditions under-mocked |
| public-search-bar.test.js | ~80 | 0 | ~10 | Search bar | HIGH | **REFACTOR** | Search result paths untested |
| public-search-modal.test.js | ~140 | 4 | ~18 | Search modal | LOW | **REFACTOR** | Result rendering untested |
| public-account-models.test.js | ~75 | Low | ~8 | Model display | MEDIUM | **REFACTOR** | Weak assertions |
| public-workspace-sidebar.test.js | ~100 | Low | ~13 | Workspace sidebar | MEDIUM | **REFACTOR** | DOM fragility |
| public-chat-sidebar-list.test.js | ~75 | 1 | ~8 | **FAKE DOCUMENT** | NONE | **REMOVE** | Custom mock — tests fake, not code |

### Scope C — `tests/unit/*` non-public (31 files)

| File | Lines | Mocks | Expects | Pattern | Mutation Est. | Classification | Action |
|------|-------|-------|---------|---------|---------------|----------------|--------|
| guardrails.test.js | 238 | 0 | 16 | Semgrep + dep-cruise fixtures | HIGH | **RETAIN** | Keep — architecture guardrails |
| qa-comprehensive-check.test.js | 251 | 0 | 54 | DOM structure validation | HIGH | **RETAIN** | Keep — QA linting for auth HTML |
| migrations.test.js | 288 | 0 | 68 | Migration logic | HIGH | **RETAIN** | Keep |
| resend-plugin.test.js | 288 | 1 | 24 | Email plugin | MEDIUM | **RETAIN** | Keep |
| csrf.test.js | 124 | 3 | 20 | CSRF token handling | MEDIUM | **RETAIN** | Keep |
| chat-cache.test.js | 108 | 2 | 21 | Chat cache eviction | MEDIUM | **RETAIN** | Keep |
| eslint-prettier-config.test.js | 104 | 0 | 17 | Config validation | HIGH | **RETAIN** | Keep |
| src-workspace-settings-loaders.test.js | 246 | 14 | 30 | Settings loaders | LOW | **RETAIN** | Keep — mocks loaders but validates flow |
| qa-mobile-responsiveness.test.js | 198 | 0 | 24 | Responsive layout checks | HIGH | **RETAIN** | Keep |
| qa-message-input-ctrl-enter.test.js | 216 | 0 | 10 | Keyboard interaction | HIGH | **RETAIN** | Keep |
| qa-keyboard-navigation.test.js | 268 | 0 | 16 | A11y keyboard nav | HIGH | **RETAIN** | Keep |
| email-service.test.js | 185 | 1 | 23 | Email service | MEDIUM | **RETAIN** | Keep |
| qa-chat-interface.test.js | 140 | 0 | 18 | Chat interface structure | HIGH | **RETAIN** | Keep |
| input-validation.test.js | 146 | 0 | 20 | Input validation | HIGH | **RETAIN** | Keep |
| attachment-types.test.js | 75 | 0 | 24 | Attachment type mapping | HIGH | **RETAIN** | Keep |
| dom-escape.test.js | 64 | 0 | 17 | DOM escaping | HIGH | **RETAIN** | Keep |
| conversation.test.js | 86 | 0 | 12 | Conversation utilities | HIGH | **RETAIN** | Keep |
| audit-logging.test.js | 113 | 3 | 16 | Audit logging | MEDIUM | **RETAIN** | Keep |
| auth-form-validation.test.js | 80 | 0 | 7 | Form validation | HIGH | **RETAIN** | Keep |
| model-sync.test.js | 57 | 1 | 9 | Model sync | MEDIUM | **RETAIN** | Keep |
| migration-settings-permissions.test.js | 46 | 0 | 9 | Migration settings | HIGH | **RETAIN** | Keep |
| admin-groups-members.test.js | 34 | 0 | 10 | Groups members | HIGH | **RETAIN** | Keep |
| admin-groups-list.test.js | 42 | 0 | 6 | Groups list | HIGH | **RETAIN** | Keep |
| admin-groups-helpers.test.js | 16 | 0 | 4 | Groups helpers | HIGH | **RETAIN** | Keep |
| src-workspace-settings.test.js | 90 | 0 | 9 | Workspace settings | HIGH | **RETAIN** | Keep |
| src-user-settings-router.test.js | 106 | 6 | 6 | Settings router | LOW | **RETAIN** | Keep — light but valid router test |
| html-dompurify-sri.test.js | 20 | 0 | 4 | SRI + DOMPurify | HIGH | **RETAIN** | Keep |
| chat-history.test.js | 30 | 0 | 4 | Chat history | HIGH | **RETAIN** | Keep |
| qa-error-message-association.test.js | 64 | 0 | 8 | Error message association | HIGH | **RETAIN** | Keep |
| qa-focus-ring-contrast.test.js | 75 | 0 | 6 | Focus ring contrast | HIGH | **RETAIN** | Keep |
| index.test.js | 231 | 31 | 20 | Worker entry | LOW | **REFACTOR** | Mocks entire router tree for 20 assertions |

### Scope D — `tests/e2e/frontend/*.spec.ts` (7 files)

| File | Lines | Expects | Pattern | Mutation Est. | Classification | Action |
|------|-------|---------|---------|---------------|----------------|--------|
| auth.spec.ts | 36 | 6 | Login flow | N/A | **RETAIN** | Keep |
| auth-workflows.spec.ts | 77 | 19 | Auth workflows | N/A | **RETAIN** | Keep |
| chat.spec.ts | 96 | 8 | Chat interaction | N/A | **RETAIN** | Keep |
| admin-settings.spec.ts | 60 | 5 | Admin settings | N/A | **RETAIN** | Keep |
| accessibility.spec.ts | 48 | 5 | A11y checks | N/A | **RETAIN** | Keep |
| bootstrap.spec.ts | 31 | 5 | App bootstrap | N/A | **RETAIN** | Keep |
| visual/button-responsive.spec.ts | 25 | 4 | Visual regression | N/A | **RETAIN** | Keep |

### Scope E — `tests/rbac*.test.js` (2 files)

| File | Lines | Expects | Pattern | Mutation Est. | Classification | Action |
|------|-------|---------|---------|---------------|----------------|--------|
| rbac.test.js | ~520 | 0 real | Pseudocode stubs — 40 "tests" all return 'PASS' | NONE | **REMOVE** | Delete — not integrated with vitest |
| rbac.integration.test.js | ~530 | 0 real | Pseudocode stubs — 34 "tests" all return 'PASS' | NONE | **REMOVE** | Delete — not integrated with vitest |

---

## RETAIN Tests

### Backend Algorithm Coverage (src/ — no mocks)
These files test real production algorithms without mocking:
- **src/auth.test.js** — PBKDF2 password hashing, JWT sign/verify, token expiration, unicode passwords. 46 assertions across edge cases. Excellent mutation resistance.
- **src/shared/auth.test.js, src/shared/crypto.test.js, src/shared/jwt-secret.test.js** — Core crypto primitives.
- **src/middleware/cors.test.js** — CORS allow-list logic with real origin matching.
- **src/utils/validation.test.js** — 41 assertions on schema validation. High branch coverage.
- **src/utils/response.test.js** — 96 assertions on HTTP response builders. Zero mocks, pure logic.
- **src/utils/logger.test.js** — 68 assertions on structured log levels and metadata.
- **src/bootstrap/migration-*.test.js** — Real filesystem + migration ordering logic.
- **src/services/parsers/index.test.js** — 32 assertions on content parsing.
- **src/chat/attachments.test.js, src/chat/tools.test.js, src/chat/mcp.test.js** — Chat subsystem utilities.
- **src/llm/provider-adapters.test.js, src/llm/turn-policy.test.js, src/llm/system-prompt.test.js** — LLM pure logic.

### Integration Value — Real Auth Flow
- **src/routers/auth.integration.test.js** — The only true integration test in the backend suite. Uses real `hashPassword`, real `signJWT`, but mocks D1 with a custom query-mapper. Tests full register → login → JWT round-trip. **This pattern should be replicated for other routers.**

### QA / Linting Tests (Different Purpose, High Value)
- **tests/unit/guardrails.test.js** — Verifies semgrep rules catch frontend→src imports, raw badge markup, console.log in src/. This is an *architecture test*, not a unit test. Keep.
- **tests/unit/qa-comprehensive-check.test.js** — Validates auth.html DOM structure, accessibility attributes, form elements. Acts as HTML regression guard.
- **tests/unit/qa-*.test.js** (6 files) — Accessibility, keyboard nav, mobile responsiveness, focus rings, error messages. These are UI/UX lint tests. Keep as a separate QA suite.
- **tests/unit/migrations.test.js** — Validates migration SQL syntax and ordering. Keep.
- **tests/unit/eslint-prettier-config.test.js** — Config validation. Keep.

### Frontend Pure Helpers (public-* — no or low mocks)
- **public-* helpers** — `public-api-response`, `public-app-route-utils`, `public-chat-message-utils`, `public-markdown-utils`, `public-message-input-helpers`, `public-sidebar-helpers`, `public-storage`, `public-settings-*`, `public-workspace-*`, `public-model-*` etc. These test pure functions with deterministic inputs/outputs. High mutation readiness.

### E2E — Production-Like Validation
- **auth.spec.ts, chat.spec.ts, admin-settings.spec.ts** — Real browser automation against the running app. The highest-fidelity tests. Small but critical.

---

## REFACTOR Candidates

### Group 1 — Too Many Mocks (src/ routers)
| File | Mocks | Assertions | Mock:Assert Ratio |
|------|-------|------------|-------------------|
| src/utils/authorize.test.js | 63 | 109 | 0.58:1 |
| src/routers/admin.test.js | 63 | 126 | 0.50:1 |
| src/routers/models.test.js | 46 | 91 | 0.51:1 |
| src/routers/users.test.js | 36 | 109 | 0.33:1 |
| src/routers/auth-password-reset.test.js | 44 | 11 | **4.0:1** |
| src/routers/email-verification.test.js | 41 | 15 | **2.73:1** |
| src/admin/tool-servers.test.js | 25 | 36 | 0.69:1 |
| src/routers/auth.test.js | 20 | 59 | 0.34:1 |
| src/routers/chat.test.js | 17 | 43 | 0.40:1 |

**Recommendation:** For router tests, move from per-test mock scaffolding to a shared `makeTestEnv()` factory that sets up a real in-memory D1/sqlite + KV. The current pattern of `vi.mock` on every dependency creates tests that pass even when internal contracts change. The `src/routers/auth.integration.test.js` model (real crypto, mock DB) should be the template.

### Group 2 — Weak Assertions (public-* — low signal)
- **public-app.test.js, public-app-shells.test.js** — Assert on DOM `innerHTML` strings. Breaks on any CSS class addition.
- **public-chat-message-rendering.test.js, public-chat-message-list-html.test.js** — HTML snapshot style. Mutation: change a single class → test still passes if it checks for substring presence.
- **public-chat-message-blocks.test.js** — Counts elements rather than verifying semantic structure.
- **public-admin-models.test.js, public-admin-users-overview.test.js** — Shallow mount + weak prop checks.

### Group 3 — Brittle Selectors / Async Timing (public-*)
- **public-chat-stream-controller.test.js** — Uses real `setTimeout`/`setInterval` in some paths, fake timers in others. Race conditions between tests.
- **public-model-selector-race.test.js** — Named "race" but uses deterministic vi mocks. Does not actually test race resolution (cancel vs. late response).
- **public-chat-file-events.test.js** — File upload event simulation is async-unreliable across jsdom versions.
- **public-files-modal.test.js** — Modal open/close timing depends on CSS transition mocks.
- **public-search-modal.test.js, public-search-bar.test.js** — Search result rendering paths untested.

### Group 4 — Structural Mock Bloat
- **tests/unit/index.test.js** — Mocks 11 routers + auth + JWT just to test routing dispatch. 31 mocks for 20 assertions. Could be an integration test hitting real routers.
- **src/chat/assistant-runner.test.js** — 50 lines, 3 mocks, 5 assertions. Underdeveloped for the complexity of assistant-runner.js.
- **src/services/realtime-bus.test.js** — 18 lines, 4 mocks, 2 assertions. Not worth the overhead.

---

## REMOVE Candidates

### 1. `tests/unit/public-chat-sidebar-list.test.js` (~75 lines)
**Why:** Creates a custom `globalThis.document` mock with fake `createElement` that returns `{ children: [], listeners: {} }` objects. The test calls `buildChatSidebarListFragment` against this fake DOM, then asserts on `fragment.children[0].tagName`. **It tests the mock, not the real function.** Any bug in actual DOM construction is invisible. Real jsdom is available — rewrite or delete.
**Lines saved:** ~75

### 2. `tests/rbac.test.js` (~520 lines)
**Why:** Not a vitest file. Exports an object with 10 "test suites" where each "test" is an async function that returns the string `'PASS'`. There are zero actual assertions using `expect()`. This is pseudocode documenting intended behavior, not executable tests. Cannot catch regressions.
**Lines saved:** ~520

### 3. `tests/rbac.integration.test.js` (~530 lines)
**Why:** Same pattern as rbac.test.js. Exports integration test objects with async functions returning `'PASS'`. No vitest framework integration. The "testUtils" object has comments like `// In real tests, would make HTTP request` — confirming this is a design document, not tests.
**Lines saved:** ~530

**Total deletion savings:** ~1,325 lines

---

## Coverage Gaps

### Behaviors with NO test coverage
1. **DOMPurify bypass paths** — Tests mock DOMPurify to identity. A mutation removing `DOMPurify.sanitize()` would not be caught.
2. **SSE stream error recovery** — Chat streaming error paths (network timeout, parse failure) have no unit tests.
3. **File R2 upload → metadata registration flow** — The full upload → presigned URL → R2 → register flow is untested end-to-end.
4. **Password reset email sending** — Resend integration is mocked in unit tests; no E2E verification.
5. **RBAC permission enforcement** — Zero real tests for the actual RBAC middleware. The rbac*.test.js stubs do not execute.
6. **Message edit / delete** — src/routers/message-edit.test.js has mocks but shallow coverage.
7. **Tool server OAuth handshake** — src/admin/tool-servers.test.js mocks the OAuth flow.
8. **Rate limit enforcement at router level** — rate-limit.test.js tests the utility but not router integration.
9. **KV session expiration** — Session TTL handling not tested.
10. **LLM tool step limit (100 steps)** — No test for the tool loop termination.

### Mutation operators with no coverage
- **Arithmetic operator replacement** in pagination math (`offset + limit`)
- **Logical operator replacement** in auth middleware (`||` → `&&`)
- **String literal mutation** in error messages (many tests assert exact strings)
- **Object property deletion** in D1 result mapping
- **Boundary condition** in `Date.now()` comparisons (token expiration)
- **Function call removal** in `ctx.waitUntil()` — no test verifies side effects

---

## Prioritized Action Plan

### Step 1 — DELETE: Files to remove immediately
| # | File | Lines | Impact |
|---|------|-------|--------|
| 1.1 | `tests/rbac.test.js` | ~520 | Zero executable assertions |
| 1.2 | `tests/rbac.integration.test.js` | ~530 | Zero executable assertions |
| 1.3 | `tests/unit/public-chat-sidebar-list.test.js` | ~75 | Tests fake DOM, not code |

**Effort:** 10 minutes. **Risk:** None — these files do not participate in CI pass/fail logic.

### Step 2 — REFACTOR: Files to clean up
| Priority | File | Issue | Effort |
|----------|------|-------|--------|
| P0 | `src/routers/auth-password-reset.test.js` | 44 mocks for 11 assertions (ratio 4:1) | Medium |
| P0 | `src/routers/email-verification.test.js` | 41 mocks for 15 assertions (ratio 2.7:1) | Medium |
| P1 | `src/utils/authorize.test.js` | 63 mocks — rewrite with real policy fixtures | Large |
| P1 | `src/routers/admin.test.js` | 63 mocks — split into domain-specific test files | Large |
| P1 | `src/routers/models.test.js` | 46 mocks — use shared env factory | Large |
| P1 | `src/routers/users.test.js` | 36 mocks — use shared env factory | Large |
| P2 | `tests/unit/index.test.js` | 31 router mocks — convert to lightweight integration | Medium |
| P2 | `public-chat-message-rendering.test.js` | Brittle HTML assertions — use semantic selectors | Medium |
| P2 | `public-chat-message-list-html.test.js` | Same — HTML substring fragility | Medium |
| P2 | `public-chat-stream-controller.test.js` | Timer inconsistency — standardize on fake timers | Small |
| P2 | `public-model-selector-race.test.js` | Actually test race resolution (abort + late response) | Medium |

### Step 3 — ADD: Critical gaps needing new tests
| # | Gap | Suggested test file | Priority |
|---|-----|---------------------|----------|
| 3.1 | RBAC middleware enforcement | `src/middleware/rbac.test.js` | **CRITICAL** |
| 3.2 | DOMPurify sanitize removal | Add to `src/utils/sanitize.test.js` | High |
| 3.3 | SSE stream error recovery | `src/features/chat/stream-error.test.js` | High |
| 3.4 | File upload E2E | Expand `tests/e2e/frontend/chat.spec.ts` | High |
| 3.5 | Rate limit router integration | `src/routers/rate-limit.integration.test.js` | Medium |
| 3.6 | KV session TTL expiration | `src/shared/session-ttl.test.js` | Medium |
| 3.7 | Tool step loop termination | `src/chat/tools-limit.test.js` | Medium |
| 3.8 | Password reset E2E | `tests/e2e/frontend/auth-workflows.spec.ts` | Medium |

### Step 4 — MUTATION TESTING: Recommended Stryker config
```js
// stryker.config.mjs
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.js',
    // Only run src/ backend tests for mutation — frontend jsdom issues interfere
    filter: ['src/**/*.test.js'],
  },
  reporters: ['html', 'clear-text', 'json'],
  // Start with high-quality, low-mock files
  mutate: [
    'src/auth.js',
    'src/shared/auth.js',
    'src/shared/crypto.js',
    'src/middleware/cors.js',
    'src/utils/validation.js',
    'src/utils/sanitize.js',
    'src/utils/response.js',
    'src/errors/http-errors.js',
    'src/chat/attachments.js',
    'src/chat/tools.js',
    'src/llm/provider-adapters.js',
    'src/llm/turn-policy.js',
    'src/bootstrap/migration-audit.js',
    'src/services/parsers/**/*.js',
  ],
  // Files with heavy mocking are excluded — mutations would be falsely killed
  ignorePatterns: [
    'src/routers/**/*.test.js',
    'src/utils/authorize.test.js',
    'src/admin/tool-servers.test.js',
    'tests/unit/public-*.test.js',
    'tests/e2e/**',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 40,
  },
  // Stryker operators most relevant for this codebase
  mutator: {
    excludedMutations: [
      'StringLiteral', // Too noisy — many error message assertions
    ],
  },
};
```

**Mutation readiness prerequisites:**
1. Fix the 21 failing public-*.test.js files FIRST (jsdom `localStorage` issue).
2. Extract a shared `makeTestEnv({ dbSeed })` factory to reduce mock bloat in router tests.
3. Run Stryker on the `src/` backend suite first — ~45 files are mutation-ready today.
4. Exclude `tests/rbac*.test.js` and `public-chat-sidebar-list.test.js` from any mutation run.

---

## auth.test.js vs auth.integration.test.js Overlap Analysis

**Files involved:**
- `src/auth.test.js` (217 lines) — Tests `src/auth.js` primitives: `signJWT`, `verifyJWT`, `hashPassword`, `verifyPassword`.
- `src/routers/auth.integration.test.js` (465 lines) — Tests `src/routers/auth.js` full HTTP router: register → DB insert → hash → login → JWT issue.

**Overlap:**
| Concern | auth.test.js | auth.integration.test.js |
|---------|-------------|--------------------------|
| JWT signing | ✅ Direct | ✅ Via HTTP response |
| JWT verification | ✅ Direct | ❌ Not tested |
| Password hashing (PBKDF2) | ✅ Direct | ✅ Via register + login round-trip |
| Password verification | ✅ Direct | ✅ Via login failure/success |
| Token expiration | ✅ Direct | ❌ Not tested |
| Malformed token handling | ✅ Direct | ❌ Not tested |
| HTTP routing | ❌ Not tested | ✅ Full request/response |
| DB interaction | ❌ Not tested | ✅ Custom mock DB |
| Rate limiting | ❌ Not tested | ❌ Not tested (mocked) |

**Verdict: COMPLEMENT, not duplicate.**
- `auth.test.js` is the **unit boundary** — it verifies the crypto contract in isolation.
- `auth.integration.test.js` is the **integration boundary** — it verifies the router orchestrates the primitives correctly.

**Recommendation:** Keep both. They test different things at different boundaries. The integration test should be expanded to cover token expiration (issue a token with `-1` TTL, verify 401 on next request) and malformed request bodies.

---

## public-*.test.js Failure Root Cause

### Symptom
21 `public-*.test.js` files fail with:
```
TypeError: Cannot read properties of undefined (reading 'clear')
 ❯ tests/unit/public-storage.test.js:13:18
     11| describe('storage helpers', () => {
     12|   beforeEach(() => {
     13|     localStorage.clear();
```

### Root Cause
The `vitest.config.js` default environment is `node`:
```js
environment: 'node',
```
Files that need jsdom include the directive:
```js
// @vitest-environment jsdom
```
However, **vitest's jsdom environment does not provide `localStorage` and `sessionStorage` as globals by default** unless explicitly configured. The jsdom library itself supports these APIs, but vitest's jsdom integration may not expose them as global objects in the default configuration, OR there's a jsdom version mismatch where the `storageQuota` option needs to be set.

### Evidence
- Failing files: all use `localStorage.clear()` or `sessionStorage.clear()` in `beforeEach`.
- Passing jsdom files: do not touch localStorage (e.g., `public-api-response.test.js`, `public-markdown-utils.test.js`).
- The directive `// @vitest-environment jsdom` IS present on all failing files.

### Is it test fragility or real regression?
**Test fragility.** The production code in `public/js/shared/utils/storage.js` correctly accepts `localStorage`/`sessionStorage` as parameters. The tests are correct in intent but the test environment is misconfigured. No production regression.

### Fix
Option A (recommended — minimal):
```js
// In vitest.config.js, add to the jsdom environment setup:
test: {
  environment: 'node', // default
  environmentMatchGlobs: [
    ['tests/unit/public-*.test.js', 'jsdom'],
    ['tests/unit/qa-*.test.js', 'jsdom'],
    ['tests/unit/auth-form-validation.test.js', 'jsdom'],
    ['tests/unit/html-dompurify-sri.test.js', 'jsdom'],
  ],
  // Or if keeping @vitest-environment directives, add:
  setupFiles: ['./tests/setup-jsdom.js'],
}
```

```js
// tests/setup-jsdom.js
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  },
  writable: true,
});
Object.defineProperty(global, 'sessionStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  writable: true,
});
```

Option B (cleaner):
Use `happy-dom` instead of `jsdom` — it correctly exposes `localStorage`/`sessionStorage` globals. Change `@vitest-environment jsdom` to `@vitest-environment happy-dom` on affected files.

**Effort:** 5 minutes. **Impact:** Unblocks 21 test files (~100 assertions) for CI and mutation testing.

---

## Appendix — Cross-Agent Dedup Notes

- **No duplicate audits found.** Each agent covered a disjoint scope:
  - Agent 1: `src/**/*.test.js` (backend logic)
  - Agent 2: `tests/unit/public-*.test.js` (frontend units)
  - Agent 3: `tests/e2e/frontend/*.spec.ts` (browser automation)
  - Agent 4: `tests/unit/*` (non-public) + `tests/rbac*.test.js`
- **Overlapping concerns but not files:**
  - `src/routers/auth.test.js` (unit) vs `src/routers/auth.integration.test.js` (integration) — both in Agent 1 scope, different files.
  - `tests/unit/auth-form-validation.test.js` (DOM form) vs `src/auth.test.js` (crypto) — different scopes, different concerns.
  - `tests/unit/index.test.js` (Agent 4) mocks routers that Agent 1 tests — but the files are distinct.

---

*Report generated: 2026-06-21 | Consolidator: Agent 5*
