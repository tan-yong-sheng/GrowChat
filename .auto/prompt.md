# Autoresearch: fallow health score ≥ 90

## Objective

Bring `fallow health` score from current 77.6 to ≥ 90, while keeping all
quality gates green:

- fallow audit pass (gate=new-only)
- fallow dead-code: 0 issues
- fallow dupes: 0 new duplications
- pnpm test: pass
- pnpm typecheck: pass
- pnpm lint: pass
- format:check: pass

Primary levers:

1. Reduce unit_size penalty by decomposing large functions (>60 LOC)
2. Reduce hotspots penalty by reducing complexity density in hotspot files
3. Reduce coupling by tightening module boundaries

## Metrics

- **Primary**: fallow health score (higher is better)
- **Secondary**:
  - unit_size penalty (lower better, currently -10)
  - hotspots penalty (lower better, currently -10)
  - coupling penalty (lower better, currently -2.4)
  - very_high_risk function % (lower better, currently 5.1%)
  - high_risk function % (lower better, currently 6.7%)
  - functions_over_60_loc_per_k (lower better, currently 51.3)
  - pnpm test pass (1/0)
  - lint pass (1/0)
  - typecheck pass (1/0)
  - audit verdict (pass/fail)

## How to Run

```
./.auto/measure.sh
```

Outputs structured `METRIC name=value` lines. Takes ~3 minutes.

## Files in Scope

Top hotspot files (sorted by fallow hotspot score):

- public/js/features/admin/settings/connections.js (fan_in=3)
- src/routers/chat.js (fan_in=2)
- src/index.js (fan_in=2)
- public/js/features/chat/chat.js (fan_in=2)
- public/js/features/admin/admin.js (fan_in=2)
- public/js/features/account/account-integrations.js (fan_in=1)
- public/js/features/admin/settings/auth.js (fan_in=4)
- public/js/features/admin/settings/models.js (fan_in=2)
- public/js/features/admin/settings/users.js (fan_in=3)
- public/js/features/admin/settings/policies.js (fan_in=2)

## Off Limits

- Do not modify .auto/, package.json scripts, .husky/, fallow.toml
- Do not change fallback/suppression comments in a way that hides real issues
- Do not bypass quality gates

## Constraints

- Every iteration must pass: lint, typecheck, test, format:check
- Every iteration must NOT introduce new dead-code, new duplications, or new stale suppressions
- Refactors must be behavior-preserving (no semantic changes)
- One concern per commit; small atomic commits are easier to revert

## What's Been Tried

### Iteration 1 (baseline)

Score: 77.6. Penalties: hotspots=-10, unit_size=-10, coupling=-2.4.
Audit: FAIL (39 new complexity, 9 new duplications, 1 dead-code stale suppression).
Triage: hotspot penalty at max (-10) is partly driven by git commit history;
refactoring complex functions in hotspot files should reduce it as complexity
density drops. Unit_size penalty is at max because 11.9% of functions are
high/very_high_risk — must decompose enough to bring it under threshold.
