# Ideas backlog (fallow health score ≥ 90)

## Session progress (runs #432-#438)

### Achievements

- **functions_above_threshold**: 20 → **13** (7 removed, -35%)
- All quality gates: dupes=0, complexity_introduced unchanged, dead_code=0

### Functions decomposed this session

| Run  | Function                              | File                            | Cyc Before | Cyc After |
| ---- | ------------------------------------- | ------------------------------- | ---------- | --------- |
| #432 | (discard) normalizePersonalConnection | account-connections-helpers.js  | 26         | —         |
| #433 | normalizeServer                       | account-integrations-helpers.js | 22         | 1         |
| #434 | getProviderKey + getProviderLabel     | models-discovery.js             | 21×2       | 2×2       |
| #435 | handleCloneChat                       | chat-collection-ops.js          | 19         | 6         |
| #436 | fetchBaseModelsFromOpenAI             | models-discovery.js             | 33         | 5         |
| #437 | removeManualModalModel                | connections-modal-form.js       | 13         | 6         |
| #438 | renderConnectionRow                   | connections.js                  | 12         | 4         |

### Key patterns that worked

1. **Data-driven `firstDefinedValue` helper** for long `||` chains: extract a `PROVIDER_KEY_FIELDS` array + shared helper, then each caller becomes 1-3 branches

2. **Section-based decomposition for async functions**: `fetchBaseModelsFromOpenAI` split into focused helpers (cache, discovery, allowed set, manual models, fallback, cache set) - each 4-8 branches

3. **Button extraction for template-heavy functions**: extract each `<button>` into its own render function (1-3 branches each), parent becomes simple assembly

4. **Nested function closures as module-level helpers**: pass closure variables as parameters

### Remaining targets (13 functions above threshold)

- `toolRows` (cyc=36) + `buildListCard` (cyc=35) — template ternary heavy, need field-by-field extraction
- `normalizePersonalConnection` (cyc=26) — field extraction causes `complexity_introduced` penalty
- `openAccessModal` (cyc=21) — 171-line template builder
- `connections-event-handlers.js` arrows (cyc=20, 11, 10) — complex event handlers
- `loadModalModels` (cyc=18), `addManualModalModel` (cyc=16), `refreshModalModels` (cyc=16) — modal form functions
- `handleOkResponse` (cyc=11) — small function, hard to decompose

### Notes

- `complexity_introduced` is at 8 from previous commits (session-bootstrap.js, integrations-modal-ops.js) that were committed outside the experiment loop
- `tests_pass=0` is from 10 pre-existing test failures in admin.test.js, validation.test.js, etc. - not caused by these refactors
- Functions with cyc=10-12 are hard to decompose because extracting helpers consumes the complexity without net gain
