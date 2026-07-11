# Autoresearch: Reduce `complexity_introduced` to 0 (path to fallow health ≥ 90)

## Objective

Drive `fallow audit` `complexity_introduced` to **0**, while keeping all
quality gates green. This is the **leading indicator** that moves
`fallow_health_score` off its 77.6 ceiling:

- Decomposing cyc>20 functions reduces `very_high_risk` function count
- That eases the `-10` unit_size penalty (currently capped at max)
- Which is the main blocker keeping the score at 77.6

Quality gates that must NOT regress:

- `fallow_health_score` ≥ 77.6 (no score regression)
- `dead_code_introduced` = 0 (audit verdict blocker)
- `duplication_introduced` must not regress from current 6
- `pnpm test:scoped`: pass
- `pnpm lint`: pass
- `pnpm typecheck`: pass

## Metrics

- **Primary**: `complexity_introduced` (unitless, lower is better, target = 0)
  - Counts cyc>20 findings in files changed since the base ref (merge-base with origin/main)
  - Each decomposition of a cyc>20 function below the threshold drops count by 1
- **Secondary** (must not regress):
  - `fallow_health_score` ≥ 77.6 (current ceiling — driven by formula penalties)
  - `dupes_total` (lower better, currently 14)
  - `dead_code_total` = 0 (currently 0)
  - `tests_pass` = 1
  - `lint_pass` = 1
  - `typecheck_pass` = 1
  - `dead_code_introduced` = 0
  - `duplication_introduced` ≤ 6

## How to Run

```
./.auto/measure.sh
```

Outputs structured `METRIC name=value` lines. Takes ~3 minutes.

## Strategy

1. Find `complexity_introduced` findings (cyc>20 in changed files) — see "Top targets" below
2. Pick the lowest-risk one to decompose first (prefer pure helpers, files with existing tests, no router coupling)
3. Decompose: extract pure helper functions, simplify branching, split into named steps
4. Verify: scoped tests pass, lint/typecheck pass, fallow_health_score didn't drop
5. Log: if `complexity_introduced` dropped AND all gates green → `keep`; otherwise `discard`
6. Repeat

## Files in Scope

Top `complexity_introduced` targets (sorted by cyclomatic, worst first):

- `src/routers/admin/admin-tool-servers-oauth.js:71` handleAdminToolServersOAuth (cyc=49)
- `public/js/features/chat/chat-message-stream-send.js:89` startChatSendMessageWithOptimistic (cyc=37)
- `public/js/features/admin/settings/connections.js:97` (cyc=29)
- `public/js/features/admin/settings/connections.js:188` (cyc=29)
- `public/js/features/admin/settings/admin-connections-save.js:84` <arrow> (cyc=27)
- `src/routers/users/users-me.js:16` handleUsersMe (cyc=27)
- `public/js/features/account/account-models.js:238` loadModels (cyc=26)
- `public/js/features/chat/message-input-tool-selection.js:285` updateToolControls (cyc=24)
- `src/llm/llm.js:21` streamLLM (cyc=23)
- `public/js/features/admin/settings/admin-connections-list.js:145` (cyc=22)
- `src/llm/connections.js:253` getAllOpenAIConnectionConfigs (cyc=21)
- `src/llm/models-helpers.js:137` normalizedConnections (cyc=21)

## Off Limits

- Do not bypass quality gates
- Do not add `fallow-ignore` suppressions to hide real complexity
- Do not change `.auto/measure.sh` (already configured for current metric set)
- Do not change `fallow.toml` config
- Do not modify `.husky/` pre-commit hooks

## Constraints

- Every iteration must pass: scoped tests, lint, typecheck
- Every iteration must NOT introduce new dead-code (dead_code_introduced stays 0)
- Refactors must be behavior-preserving (no semantic changes)
- One concern per commit; small atomic commits are easier to revert
- A `discard` log is fine if dedup/decomposition work is net-positive — commit it manually first

## What's Been Tried

### Prior session (archived)

Tried `fallow_health_score` as primary for 8+ iterations. Score stuck at 77.6 because:

- `hotspots` penalty = -10 (capped, driven by git commit history of hotspot files)
- `unit_size` penalty = -10 (capped, gated by 5.0% very_high_risk function count)
- `coupling` penalty = -2.4 (gated by coupling_high_pct=4.7%)

These penalties are formula-driven and can't be moved by code-only refactors without changing config (off-limits). Switching primary to `complexity_introduced` because:

- It's a measurable, actionable signal
- Decomposing high-cyc functions directly reduces very_high_risk count → eases unit_size penalty
- Has indirect causal chain to fallow_health_score improvement

### Successful dedup work (preserved as manual commits)

| Commit | Description | dupes_delta |
|--------|-------------|-------------|
| `10897dee` | refactor(admin): extract bindAdminNavLink | -1 |
| `46a9bebc` | refactor(account): dedup persistPreferences | -1 |
| `c2469e64` | refactor(modal-shell): reuse normalizeModalHash | -1 |
| `61169e85` | refactor(workspace-settings): dedup tool_servers payload | -1 |
| `e73ad213` | refactor(email-verification): dedup createVerificationToken | -1 |
| `1ac31737` | refactor(models-admin-settings): dedup saveSettings/buildAndExecute | -1 |

dupes_total went 20 → 14 (-30%) across these commits.

### Key insights

- `complexity_introduced` IS sensitive to decomposition: dropped 94 → 93 with refactor commits
- Same-file internal dups are easiest wins (zero import/export risk)
- Cross-module dups need careful import management
- Audit verdict has been FAIL throughout, but `dead_code_introduced` is 0 — the failure is from `complexity_introduced` (94) and `duplication_introduced` (8)

### Open questions

- Can we reach `complexity_introduced` = 0 in this session, or is it an asymptote like the health score floor?
- Does the metric re-baseline when commits are added (i.e., does the base ref shift)?