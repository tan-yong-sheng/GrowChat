# Git Worktree Spec: fix/model-selector-race

| Field | Value |
|---|---|
| **Source Reference** | https://github.com/tan-yong-sheng/GrowChat/issues/122 |
| **Branch** | `fix/model-selector-race` |
| **Parent** | #72 (quality gates roadmap) |
| **Merge Priority** | Anytime (low-severity race, self-correcting) |

## Goal

Fix the race condition in `model-selector-controller.js` where `ensureModelsLoaded()` bypasses the `modelsCacheGeneration` staleness guard, allowing a stale fetch response to briefly overwrite an invalidation reset.

## Requirements

### #122 — Model-selector race condition

`chat/model-selector-controller.js`'s `ensureModelsLoaded()` fires `fetchModels()` directly without the `modelsCacheGeneration` guard used by `session-bootstrap.js`'s `prefetchModels()`.

**Race scenario:**
1. T0: User opens dropdown → `ensureModelsLoaded()` fires `fetchModels()` — Request A
2. T1: Model invalidation fires → `modelsCacheGeneration` incremented → `prefetchModels({force:true})` fires — Request B
3. T2: Request A returns (stale) → overwrites the reset state
4. T3: Request B returns (fresh) → corrects the state

The ~50-200ms window at T2 shows stale models. It self-corrects but causes a visual flicker.

**Fix:** Make `ensureModelsLoaded()` check `modelsCacheGeneration` before and after the fetch, discarding stale responses the same way `prefetchModels()` does.

## Implementation Scope

- [x] `public/js/features/chat/model-selector-controller.js` — add `modelsCacheGeneration` check to `ensureModelsLoaded()`
- [x] Test for race condition (verify stale response is discarded)
- [x] Move dynamic `import()` inside `try/catch` (Gemini Code Assist review)
- [x] Test for `loadingPromise` reset on import failure

## Post-Implementation Review Fixes

- **Gemini Code Assist** (PR #124): High-severity — `import()` was outside `try/catch`, causing `loadingPromise` to stay stuck on import failure. Fixed by moving import inside `try` with `getGen`/`reqGen` variable pattern.
- **CodeRabbit**: Rate-limited, no review content.
- **Pi bot**: No review posted.

## Acceptance Criteria

1. Stale fetch responses from `ensureModelsLoaded()` are discarded
2. No visual flicker when model invalidation occurs during dropdown open
3. Model dropdown always shows fresh data after invalidation
4. All existing tests pass

## Technical Constraints

- Follow the existing `modelsCacheGeneration` pattern from `session-bootstrap.js`
- Don't add locking — the generation counter approach is sufficient
- Keep changes minimal — only modify `ensureModelsLoaded()` and its call chain

## Cross-branch Notes

- **Isolated** — only touches `model-selector-controller.js`
- No overlap with any other worktree
- Can merge anytime
