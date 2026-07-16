# Autoresearch: Reduce `functions_above_threshold` to 0

## Objective

Drive `fallow health` `functions_above_threshold` to **0**, while keeping
all quality gates green. The previous phase drove `dupes` to 0 and
`complexity_introduced` to 0; this phase targets the remaining functions
above fallow's complexity/CRAP threshold.

- `dupes` is already at 0 and must stay there
- `complexity_introduced` is already at 0 and must stay there
- `duplication_introduced` is already at 0 and must stay there
- The remaining `functions_above_threshold` comes from inherited complex
  functions, not new code

Quality gates that must NOT regress:

- `dupes` = 0
- `fallow_health_score` ≥ 77.6 (no score regression)
- `dead_code_introduced` = 0 (audit verdict blocker)
- `duplication_introduced` = 0
- `complexity_introduced` = 0
- `pnpm test:scoped`: pass
- `pnpm lint`: pass
- `pnpm typecheck`: pass

## Metrics

- **Primary**: `functions_above_threshold` (unitless, lower is better, target = 0)
  - Counts functions with cyclomatic complexity or CRAP above fallow's
    threshold
  - Decomposing a function into smaller helpers drops the count when the
    parent and all new helpers fall below the threshold
- **Secondary** (must not regress):
  - `dupes` = 0
  - `fallow_health_score` ≥ 77.6
  - `complexity_introduced` = 0
  - `dead_code_total` = 0
  - `tests_pass` = 1
  - `lint_pass` = 1
  - `typecheck_pass` = 1
  - `dead_code_introduced` = 0
  - `duplication_introduced` = 0

## How to Run

```
./.auto/measure.sh
```

Outputs structured `METRIC name=value` lines. Takes ~3 minutes.

## Strategy

1. Inspect `fallow health --format json` for functions above threshold
2. Prefer safe decomposition targets:
   - Functions just above threshold (small reduction needed)
   - Functions with sequential branches (easy to extract helpers)
   - Functions in files with no other threshold findings (lower blast radius)
3. Extract small helpers with cyc ≤ 4 / CRAP ≤ 30 (at 0% coverage, cyc ≤ 5
   keeps CRAP ≤ 25)
4. Keep helpers pure and behavior-preserving; avoid adding closure
   complexity (`?.`, `||` chains)
5. Verify: scoped tests pass, lint/typecheck pass, `complexity_introduced`
   stays 0, `dupes` stays 0
6. Log: if `functions_above_threshold` dropped AND all gates green →
   `keep`; otherwise `discard`
7. Repeat

## Files in Scope

Current targets (from `fallow health --format json`):

- TBD after first inspection

## Off Limits

- Do not bypass quality gates
- Do not add `fallow-ignore` suppressions to hide real complexity
- Do not change `.auto/measure.sh` (already configured for current metric set)
- Do not change `fallow.toml` config
- Do not modify `.husky/` pre-commit hooks
- Do not regress `dupes` from 0
- Do not regress `complexity_introduced` from 0

## Constraints

- Every iteration must pass: scoped tests, lint, typecheck
- Every iteration must NOT introduce new dead-code
- Every iteration must NOT introduce new `duplication_introduced`
- Every iteration must NOT regress `complexity_introduced`
- Every iteration must NOT regress `dupes`
- Refactors must be behavior-preserving (no semantic changes)
- One concern per commit; small atomic commits are easier to revert
- A `discard` log is fine if decomposition work is net-positive — commit
  it manually first

## Context

Previous phase (88+ runs) achieved:

- `complexity_introduced`: 93 → 0
- `dupes_total`: 20 → 0
- `dead_code_total`: 1 → 0
- `audit_verdict`: fail → pass
- `functions_above_threshold`: 57
- `fallow_health_score`: 77.6 (config ceiling, unchanged)

`fallow_health_score` remains blocked by config-level penalties
(`hotspots` and `unit_size` capped at -10), so this phase focuses on
reducing the measurable `functions_above_threshold` signal.
