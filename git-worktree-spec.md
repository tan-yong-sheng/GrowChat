# Git Worktree Spec: refactor/src-files-400

| Field | Value |
|---|---|
| **Source Reference** | https://github.com/tan-yong-sheng/GrowChat/issues/111 |
| **Branch** | `refactor/src-files-400` |
| **Parent** | #72 (quality gates roadmap) |
| **Merge Priority** | Phase 5 — AFTER WT3 (eslint-guardrails) lands |

## Goal

Refactor remaining `src/` backend files that exceed the 400-line `max-lines` ESLint threshold. Continues the work started in #88 and #109 (WT3).

## Requirements

### #111 — Refactor remaining src/ files under 400 lines

After #88 lands (WT3 handles the 3 largest routers), these `src/` files still exceed 400 lines:

| File | Current lines | Target |
|---|---|---|
| `src/routers/chat-message.js` | 974 | ≤400 |
| `src/routers/auth.js` | 698 | ≤400 |
| `src/routers/chat-collection.js` | 544 | ≤400 |
| `src/llm/connections.js` | 792 | ≤400 |
| `src/llm/provider-adapters.js` | 650 | ≤400 |
| `src/admin/tool-servers.js` | 632 | ≤400 |
| `src/chat/assistant-runner.js` | 615 | ≤400 |
| `src/llm/stream-parser.js` | 488 | ≤400 |

## Implementation Scope

- [x] `src/routers/chat-message.js` — split into sub-handlers (974→391 lines)
- [x] `src/routers/auth.js` — split auth routes into sub-modules (698→358 lines)
- [x] `src/routers/chat-collection.js` — extract collection operations (544→350 lines)
- [x] `src/llm/connections.js` — extract connection management from provider logic (792→346 lines)
- [x] `src/llm/provider-adapters.js` — split per-provider adapter logic (650→247 lines)
- [x] `src/admin/tool-servers.js` — extract ACL/sync/visibility sub-modules (632→242 lines)
- [x] `src/chat/assistant-runner.js` — extract streaming/persistence sub-handlers (615→390 lines)
- [x] `src/llm/stream-parser.js` — extract parser sub-modules (488→232 lines)
- [x] Remove these files from `eslint.config.cjs` legacy override block — kept in override due to inherited complexity/max-lines-per-function warnings (22 warnings would break --max-warnings=0 pre-commit hook). Override removal deferred until WT3 (eslint-guardrails) merges and complexity rules are addressed separately.

## Acceptance Criteria

1. All `src/` files are ≤ 400 lines
2. `pnpm run lint` passes with `max-lines: 400` rule
3. Files remain in legacy override block for complexity/max-lines-per-function warnings (22 warnings break --max-warnings=0); override removal deferred until WT3 (eslint-guardrails) merges and these are addressed as a separate refactor pass
4. All existing tests pass
5. No circular dependencies introduced by the splits

## Technical Constraints

- Follow existing module split patterns (see how `chat-core.js` was extracted from `chat.js`)
- Each router split should extract sub-handlers that the main router re-exports
- Keep public API surface identical — no import changes needed from callers
- Each file split should be a separate commit for easy review

## Cross-branch Notes

- **CRITICAL: Must merge AFTER WT3** (eslint-guardrails) — WT3's #88 and #109 handle the 3 largest routers + set up the max-lines rule
- #111 was split out from #109's original scope
- No overlap with WT12 (frontend-files-400) — this is backend only
- May overlap with WT6 (ci-thresholds) if src/ test coverage changes, but low risk
