# Autoresearch: fallow health score ≥ 90

## Objective

Bring `fallow health` score from current ~77.6 to ≥ 90, while keeping all
quality gates green:

- fallow audit pass (gate=new-only)
- fallow dead-code: 0 issues
- fallow dupes: 0 new duplications
- pnpm test: pass
- pnpm typecheck: pass
- pnpm lint: pass
- format:check: pass

Primary lever: reduce complexity in hotspot files (files that combine high
commit count with complexity density), and decompose large functions to
reduce the unit_size penalty.

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

## How to Run

```
./.auto/measure.sh
```

Outputs structured `METRIC name=value` lines. Slow (15-30s) — that's OK.

## Files in Scope

Top hotspot files (sorted by complexity score):

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

Other large files (>200 lines):

- public/js/features/admin/settings/connections.js (~1500 lines)
- src/routers/chat.js (~3000 lines)

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

(empty — this is the first iteration)
