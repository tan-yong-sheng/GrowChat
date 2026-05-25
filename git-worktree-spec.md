# Git Worktree Spec: refactor/frontend-files-400

| Field | Value |
|---|---|
| **Source Reference** | https://github.com/tan-yong-sheng/GrowChat/issues/112 |
| **Branch** | `refactor/frontend-files-400` |
| **Parent** | #72 (quality gates roadmap) |
| **Merge Priority** | Phase 6 — AFTER WT3 + WT4 land |

## Goal

Refactor `public/js/` frontend files that exceed the 400-line `max-lines` ESLint threshold. Continues from #88, #109 (WT3), and #111 (WT11).

## Requirements

### #112 — Refactor public/js/ frontend files under 400 lines

After WT3 and WT11 land, these frontend files still exceed 400 lines:

| File | Current lines | Target |
|---|---|---|
| `public/js/features/admin/settings/policies.js` | 1,708 | ≤400 |
| `public/js/features/admin/settings/connections.js` | 1,401 | ≤400 |
| `public/js/features/admin/settings/overview.js` | 1,130 | ≤400 |
| `public/js/features/admin/settings/integrations.js` | 1,092 | ≤400 |
| `public/js/features/admin/settings/roles.js` | 939 | ≤400 |
| `public/js/features/admin/settings/models.js` | 864 | ≤400 |
| `public/js/features/admin/settings/admin.js` | 737 | ≤400 |
| `public/js/features/chat/chat.js` | 1,252 | ≤400 |
| `public/js/features/chat/message-input-controller.js` | 960 | ≤400 |
| `public/js/features/chat/chat-message-actions.js` | 558 | ≤400 |
| `public/js/features/chat/model-selector-controller.js` | 460 | ≤400 |
| `public/js/features/account/account-integrations.js` | 1,201 | ≤400 |
| `public/js/features/account/account-connections.js` | 1,009 | ≤400 |
| `public/js/features/account/account-models.js` | 587 | ≤400 |
| `public/js/shared/markdown-renderer.js` | 1,153 | ≤400 |
| `public/js/shared/session-bootstrap.js` | 504 | ≤400 |
| `public/js/shared/realtime.js` | 414 | ≤400 |
| `public/js/shared/store.js` | 400 | ≤400 |

## Implementation Scope

- [ ] Admin settings files (6 files) — extract modal handlers, ACL logic, UI rendering
- [ ] Chat UI files (4 files) — extract message handling, model selection, input controller
- [ ] Account files (3 files) — extract connection/integration/model sub-modules
- [ ] Shared modules (4 files) — extract markdown parsing, session init, realtime events, store slices
- [ ] Remove these files from `eslint.config.cjs` legacy override block

## Acceptance Criteria

1. All `public/js/` files are ≤ 400 lines
2. `pnpm run lint` passes with `max-lines: 400` rule
3. No file in legacy override block for these files
4. All existing tests pass
5. No circular dependencies or cross-feature boundary violations introduced

## Technical Constraints

- Follow existing `f-shared` boundary rules — extracted modules go to `public/js/shared/`
- Each extraction should preserve the existing public API surface
- `markdown-renderer.js` may need a case-by-case exemption evaluation (single-purpose module)
- Each file split should be a separate commit for easy review

## Cross-branch Notes

- **CRITICAL: Must merge AFTER WT3** (eslint-guardrails) — WT3's #109 sets up max-lines rule and does initial refactoring
- **CRITICAL: Must merge AFTER WT4** (jscpd-duplication) — WT4 extracts shared code from same admin/chat files
- **Must merge AFTER WT9** (admin-acl-xss) — WT9 fixes bugs in models.js, connections.js, integrations.js before this refactors them
- No overlap with WT11 (src-files-400) — this is frontend only
