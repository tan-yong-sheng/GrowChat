# Autoresearch: Reduce `dupes` to 0

## Objective

Drive `fallow audit` `dupes_total` to **0**, while keeping all quality
gates green. The previous phase drove `complexity_introduced` to 0; this
phase targets the remaining inherited duplication.

- `complexity_introduced` is already at 0 and must stay there
- `duplication_introduced` is already at 0 and must stay there
- The remaining `dupes_total` comes from inherited clone groups, not new
  code

Quality gates that must NOT regress:

- `fallow_health_score` ≥ 77.6 (no score regression)
- `dead_code_introduced` = 0 (audit verdict blocker)
- `duplication_introduced` = 0
- `complexity_introduced` = 0
- `pnpm test:scoped`: pass
- `pnpm lint`: pass
- `pnpm typecheck`: pass

## Metrics

- **Primary**: `dupes` (unitless, lower is better, target = 0)
  - Counts total clone instances across the project (fallow duplication report)
  - Removing a clone group drops the count by its number of instances
- **Secondary** (must not regress):
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

1. Inspect `fallow audit --format json` `duplication.clone_groups` for
   remaining clone families
2. Prefer safe deduplication targets:
   - Same-file duplicates (zero import/export risk)
   - Cross-file duplicates in files with no cyc>20 functions (no
     `complexity_introduced` regression)
   - Pure helper extractions that don't change public API contracts
3. Extract shared helpers, barrel files, or factory modules as appropriate
4. Verify: scoped tests pass, lint/typecheck pass, `complexity_introduced`
   stays 0
5. Log: if `dupes` dropped AND all gates green → `keep`; otherwise `discard`
6. Repeat

## Files in Scope

Current duplication targets (from `fallow audit`):

- `src/chat/assistant-runner.js:20-44` ↔ `src/routers/chat.js:72-96`
  Shared assistant-runner dependency contract (25 lines, 2 instances)

## Off Limits

- Do not bypass quality gates
- Do not add `fallow-ignore` suppressions to hide real duplication
- Do not change `.auto/measure.sh` (already configured for current metric set)
- Do not change `fallow.toml` config
- Do not modify `.husky/` pre-commit hooks
- Do not regress `complexity_introduced` from 0

## Constraints

- Every iteration must pass: scoped tests, lint, typecheck
- Every iteration must NOT introduce new dead-code
- Every iteration must NOT introduce new `duplication_introduced`
- Every iteration must NOT regress `complexity_introduced`
- Refactors must be behavior-preserving (no semantic changes)
- One concern per commit; small atomic commits are easier to revert
- A `discard` log is fine if dedup work is net-positive — commit it manually first

## Context

Previous phase (88 runs) achieved:

- `complexity_introduced`: 93 → 0
- `dupes_total`: 20 → 3
- `dead_code_total`: 1 → 0
- `audit_verdict`: fail → pass
- `fallow_health_score`: 77.6 (config ceiling, unchanged)

`fallow_health_score` remains blocked by config-level penalties
(`hotspots` and `unit_size` capped at -10), so this phase focuses on the
last remaining measurable quality signal: duplication.
