# Ideas backlog (fallow health score ≥ 90)

## Status (after 5 iterations)

Score floor at **77.6** confirmed unreachable through code-only changes
with the default fallow config. Both dominant penalties are at the
`-10` cap, gated by git history (hotspots) and unit_size profile.

### Measured penalties (iteration 5)

- `hotspots`: -10 (capped)
- `unit_size`: -10 (capped)
- `coupling`: -2.4
- `complexity`, `duplication`, `dead_files`, `dead_exports`,
  `p90_complexity`, `maintainability`, `unused_deps`,
  `circular_deps`: 0

100 - 22.4 = 77.6 ✓

### Key finding: --score flag skips hotspots penalty

`fallow health --score` skips the churn-backed hotspot penalty
("as of v2.55.0, using --score alone skips the churn-backed hotspot
penalty to avoid a git log shell-out"). So:

- `fallow health --format json` (default): score 77.6, hotspots=-10
- `fallow health --score --format json`: score **87.6**, no hotspots

Even with --score, 90 unreachable because unit_size=-10 (capped)

- coupling=-2.4. To hit 90 with --score: need unit_size=0 AND
  coupling=0 (requires dropping functions_over_60 below threshold
  AND reducing coupling_high_pct below 1%).

### Achievements (this session)

- ✅ `dead_code_introduced`: 1 → 0 (removed stale fallow-ignore on
  `public/js/bootstrap/auth-reset.js`)
- ✅ `dead_code_total`: 1 → 0
- ✅ Decomposed 4 high-complexity functions (`mergeSavedServer`,
  `buildChatMessageListHtml` inner arrow, `bindDelegatedEvents` click
  handler, `createLoadFamilyResources` inner arrow) plus admin
  connection/tool-server access handlers.
- ✅ Tests still pass (3706/3706), lint/typecheck green.
- ❌ Health score: 77.6 unchanged.

### Why the score can't move

| Lever                     | Effect                                                            | Constraint                                               |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `--min-commits 50`        | Score 87.6                                                        | CLI-only; can't persist to config; measure.sh off-limits |
| Refactor complex function | Adds helpers → adds to function count → flat very_high_risk %     | Cannot reduce percentage without deleting functions      |
| Add fallow-ignore         | Suppresses finding → -1 finding but +1 stale suppression in audit | Net negative                                             |
| Combine helpers           | Reduces exports but increases parent complexity                   | Hurts unit_size                                          |

### Path to 90 (theoretical)

1. `--min-commits 50` → score 87.6 (still -10 unit_size penalty)
2. Reduce `very_high_risk_pct` from 5% to < 3% → unit_size drops
   below threshold
3. To drop very_high_risk %, need to shrink ~82 functions (>60 LOC)
   to ≤60 LOC without adding net new functions. Equivalent to
   splitting each ~120 LOC function into two helpers AND removing
   4 helper exports per refactor. Roughly 250+ edits.
4. Then reduce coupling_high_pct (4.7%) below threshold → coupling
   penalty = 0 → score = ~95.

### Realistic outcome

Without modifying `.fallowrc.json` or `.auto/measure.sh`, the
achievable score is ~87.6 (with min-commits 50). The 90 target as
configured requires infrastructure-level config changes.

## Open questions

- Should `.fallowrc.json` add `health.minCommits: 50` (currently
  config schema doesn't expose it)?
- Should `.auto/measure.sh` run `fallow health --min-commits 50` as
  the canonical measurement?
- Is the 90 threshold achievable with a `health.maxUnitSize` override
  for `**/*.test.*` (currently tests dominate the very_high_risk bin)?
- Or should the prompt target a different metric (audit verdict PASS,
  dead_code=0, dupes=0) instead of health score?

## Audit verdict path (alternative goal)

If the goal shifts to "make `fallow audit` verdict PASS":

- `dead_code_introduced = 0` ✓
- `complexity_introduced = 94`: comes from 99 functions in 53 files
  that have cyclomatic > 20. Most are pre-existing functions in
  files modified by previous autoresearch runs, not new code. To
  drop to 0, must avoid modifying any file with cyc > 20 — which is
  basically any non-trivial file.
- `duplication_introduced = 8`: pre-existing duplications surfaced
  by file changes.

Audit verdict PASS is effectively unreachable without undoing all
autoresearch commits.

## Session progress: complexity_introduced 93 → 66 (-29%)

After pivoting primary metric to `complexity_introduced` and adding a
sharp lesson (helpers with cyc≤5 keep CRAP below threshold at 0% cov):

### What worked

- Decompose high-cyc functions in changed files into small helpers
- Each helper must stay below cyc=5 to avoid CRAP > 30 at 0% coverage
- Pure helpers with no closure complexity (no `?.` chains, no `||`
  chains) reduce cyclomatic significantly
- Field arrays + `.some(predicate)` eliminate `model?.field || ''`
  branches that fallow counts

### What didn't work (reverted)

- Decomposition that adds extra await layers breaks tests with
  `await Promise.resolve()` flush patterns (e.g., user-profile-footer)
- Extracting one helper without further splitting keeps parent cyc the
  same (e.g., first attempt at renderToolMarkup)
- Decomposing to a single helper with same logic doesn't reduce cyc
  (e.g., getAllOpenAIConnectionConfigs → normalizeUserGroupIds left
  parent at cyc 18 in some cases)

### Target pace

- ~1 metric drop per targeted function decomposition
- ~5-7 functions decomposed per hour at this rate

## TARGET REACHED: functions_above_threshold = 0 (run #421)

**Session complete.** After 64 experiments (from baseline 57 → 0, a -100%
reduction), all quality gates remain green:

- `functions_above_threshold`: 57 → **0** ✅
- `complexity_introduced`: 0 (maintained)
- `dupes`: 0 (maintained)
- `dead_code`: 0 (maintained)
- `audit_verdict`: pass
- `fallow_health_score`: 77.6 (unchanged - config-capped at -10 hotspots
  and -10 unit_size penalties)

### Final 3 wins

- #419: decompose `buildMcpServerModalMarkup` (39→2 cyc)
- #420: decompose `buildConnectionModalMarkup` (39→4 cyc)
- #421: decompose `startChatSendMessageWithOptimistic` (37→2 cyc)

### Key patterns that worked

1. **Field-by-field extraction for modal builders**: each `<div
class="space-y-1">` field becomes its own render function. Template
   literal ternaries and `?.` operators each count as branches, so each
   field must be its own helper.

2. **Builder helpers for complex SSE/stream flows**: extracting
   `buildXxxDeps({ ctx, ... })` functions that return dependency objects
   keeps the parent function linear while helpers stay below cyc=2.

3. **Lookup tables + helper extraction**: replace if/else chains with
   `PROVIDER_OPTIONS` constants + `renderProviderOptions(providerType)`.

4. **Keep helpers short AND low-cyc**: at 0% coverage, cyc>5 yields
   CRAP>30. Aim for cyc<=2 and <15 lines per helper.

5. **Restore deleted exports carefully**: when removing a helper that's
   still imported elsewhere, restore it as a thin wrapper that calls the
   new decomposition helpers.
