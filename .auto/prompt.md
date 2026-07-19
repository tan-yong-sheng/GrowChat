# Autoresearch: Reduce `num_lint_issues` to 0

## Objective

Drive `eslint` total problem count to **0**, while keeping all quality
gates green. Solve every lint error through real refactors — never
through suppressions, disables, or rule relaxations.

- Each `no-magic-numbers`, `max-params`, `max-statements`,
  `max-lines-per-function`, `complexity`, `max-classes-per-file`,
  `no-useless-assignment`, etc. must be solved at the source.
- No new `eslint-disable`, `eslint-disable-next-line`,
  `eslint-disable-file-extensions`, or `.eslintrc` overrides to hide
  errors.
- No `fallow-ignore` suppressions either.

Quality gates that must NOT regress:

- `pnpm test`: pass
- `pnpm typecheck`: pass
- `complexity_introduced` = 0
- `dead_code_introduced` = 0
- `duplication_introduced` = 0
- `dupes` must not regress
- `fallow_health_score` must not regress

## Metrics

- **Primary**: `num_lint_issues` (unitless, lower is better, target = 0)
  - Sum of errorCount + warningCount from eslint across `src/**/*.js`
    and `public/js/**/*.js`
  - Per-rule breakdown emitted as `lint_rules` JSON
- **Secondary** (must not regress):
  - `tests_pass` = 1
  - `typecheck_pass` = 1
  - `complexity_introduced` = 0
  - `dead_code_introduced` = 0
  - `duplication_introduced` = 0
  - `dupes` no regression
  - `fallow_health_score` no regression

## How to Run

```
./.auto/measure.sh
```

Outputs structured `METRIC name=value` lines.

## Strategy

1. Inspect latest `lint_rules` breakdown to find the biggest bucket.
2. Group fixes by rule when possible:

- `no-magic-numbers`: extract named constants at module top
- `max-params`: convert to options bag signature
- `max-statements`: extract focused helpers
- `complexity`: decompose branches/conditionals
- `max-classes-per-file`: split into separate files

3. Prefer small, atomic commits — one concern per commit.
4. Verify after each fix: scoped tests, typecheck pass,
   `complexity_introduced` stays 0, `dupes` not regressed.
5. Log: if `num_lint_issues` dropped AND all gates green → `keep`;
   otherwise `discard`.
6. Repeat.

## Off Limits

- Do NOT add `eslint-disable*` suppressions to hide real issues
- Do NOT relax rules in `eslint.config.cjs` to lower the count
- Do NOT add `fallow-ignore` markers
- Do NOT change `.auto/measure.sh` metric definitions
- Do NOT skip lint in commits or hooks
- Do NOT change `.husky/` pre-commit hooks

## Constraints

- Every iteration must pass: scoped tests, typecheck
- Every iteration must NOT introduce new dead-code
- Every iteration must NOT introduce new `duplication_introduced`
- Every iteration must NOT regress `complexity_introduced`
- Every iteration must NOT regress `dupes`
- Every iteration must NOT regress `fallow_health_score`
- Refactors must be behavior-preserving (no semantic changes)
- One concern per commit; small atomic commits are easier to revert
- A `discard` log is fine if the work is net-positive — commit
  manually first

## Context

Previous phase (~454 runs) achieved:

- `complexity_introduced`: 93 → 0
- `dupes_total`: 20 → 0
- `dead_code_total`: 1 → 0
- `functions_above_threshold`: 57 → 0
- `fallow_health_score`: 77.6 (config ceiling, unchanged)

Now shifting focus to all remaining eslint errors.
