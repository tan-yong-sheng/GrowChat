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
