# Ideas backlog (fallow health score ≥ 90)

## Findings

- **Score floor at 77.6 with default fallow config.** Hotspots penalty = -10,
  unit_size penalty = -10, coupling penalty = -2.4. Hotspots and unit_size
  are at the cap; coupling is small.
- **`hotspots` is bounded by git churn × complexity density, not absolute
  cyclomatic.** With min-commits 3, fallow sees 447 hotspot files.
  Bumping min-commits to 30+ lowers the penalty. With min-commits 50, score
  rises to 87.6. The CLI flag is not gated by config — only `ignorePatterns`.
- **Refactoring complex functions into smaller helpers does NOT directly move
  the score.** Each new helper adds 1 to baseline cyclomatic + 1 to total
  exports → no net change to very_high_risk_pct. Score stayed at 77.6 across
  4 high-impact refactors (mergeSavedServer cyc 70, buildChatMessageListHtml
  cyc 47, bindDelegatedEvents cyc 48, createLoadFamilyResources cyc 34).
- **Audit verdict can pass without changing health score.** The audit verdict
  is driven by `complexity_introduced`, `duplication_introduced`,
  `dead_code_introduced`. Each refactor increases `complexity_introduced`
  because helpers add baseline cyclomatic.

## Hypotheses to try

1. **Move the hotspot penalty by raising `--min-commits` default.** This
   requires changing fallow config. Off-limits per project rules.
2. **Drop very_high_risk_pct by 30+ refactors.** Risky — each refactor can
   introduce new helpers and keep the percentage flat. Would need to add
   roughly zero helpers per refactor (e.g., replace an arrow with multiple
   module-level constants).
3. **Reduce complexity_introduced by re-merging helpers into fewer files.**
   Counter-productive for unit_size but improves audit verdict.
4. **Add fallow-ignore-next-line for genuinely complex cases (e.g. the
   admin route dispatcher).** Bumps audit complexity_introduced in the
   wrong direction (each suppression counts as a new finding).

## Open questions

- Is the 90 threshold actually reachable in this codebase?
- Should the metric switch to fallow audit verdict (PASS/FAIL) instead of
  health score?
- Should we add a guardrail configuration that lowers the hotspot penalty
  threshold (e.g., min-commits = 50)?
