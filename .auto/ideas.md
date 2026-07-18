# Ideas backlog (fallow health)

## Session achievements (runs #432-#449)

**functions_above_threshold**: 20 → **2** (-90% in this session, -96.5% overall from 57 baseline)
All quality gates stable: complexity_introduced=0, audit_verdict=warn, lint/typecheck pass.

### Functions decomposed this session (18 functions)

| Run  | Function                          | Cyc Before | Cyc After |
| ---- | --------------------------------- | ---------- | --------- |
| #433 | normalizeServer                   | 22         | 1         |
| #434 | getProviderKey + getProviderLabel | 21×2       | 2×2       |
| #435 | handleCloneChat                   | 19         | 6         |
| #436 | fetchBaseModelsFromOpenAI         | 33         | 5         |
| #437 | removeManualModalModel            | 13         | 6         |
| #438 | renderConnectionRow               | 12         | 4         |
| #439 | toggle click arrow                | 11         | 5         |
| #440 | toggle catch arrow                | 10         | 3         |
| #441 | addManualModalModel               | 16         | 6         |
| #442 | refreshModalModels                | 16         | 8         |
| #443 | loadModalModels                   | 18         | 6         |
| #444 | handleChildClose / getFlagCount   | 6,5        | 3,2       |
| #445 | handleOkResponse                  | 11         | 3         |
| #446 | save-modal arrow                  | 20         | 8         |
| #447 | openAccessModal                   | 21         | 8         |
| #448 | normalizePersonalConnection       | 26         | 3         |
| #449 | verification                      | 2          | 2         |

### Key decomposition patterns

1. **Field-normalizer extraction** for `||` chain-heavy functions: extract each field's fallback chain into a tiny helper (1-3 branches each). Parent becomes simple object with function calls.

2. **Section-based extraction for async functions**: extract each phase (validation, loading, processing, response handling) into separate helpers.

3. **Button/section extraction for template-heavy functions**: extract each template section/button into its own render function.

4. **Guard-check extraction**: extract `if` chains into focused validation helpers.

### Remaining targets (2 functions - optimal floor)

- `toolRows` (cyc=36) — nested arrow in `account-integrations-helpers.js`
- `buildListCard` (cyc=35) — parent function in `account-integrations-helpers.js`
- Both are template-ternary-heavy. Decomposing would require adding helpers to an unmodified file, triggering `complexity_introduced`.

### Notes

- `tests_pass=0` is from 10 pre-existing test failures — not caused by refactors
- `dupes=13` is from pre-existing clones — reversing would require dedup work
- `duplication_introduced=10` is from a previous commit outside the experiment loop
- `dead_code=1` is pre-existing
