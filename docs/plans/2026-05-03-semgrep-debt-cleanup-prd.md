## Problem Statement

GrowChat has a significant amount of pre-existing Semgrep debt across runtime code. A broad `semgrep --config=auto` scan over the application surfaces many blockers, but they are mixed between real security risks, accepted helper patterns, and generic noise. If the team keeps treating Semgrep as an all-or-nothing gate, it will block normal development immediately and obscure the actual high-risk issues that deserve attention first.

The current problem is not just that findings exist. The deeper problem is that the repo lacks a clear, staged Semgrep baseline strategy for runtime code, so old debt and new regressions are not separated cleanly.

## Solution

Adopt a staged Semgrep cleanup workflow for runtime code only, starting in report-only mode and paying down the highest-risk findings first. Use a narrower security-focused rule set plus GrowChat-specific rules, classify findings into true vulnerabilities, acceptable patterns, and refactor-needed cases, then gradually reduce the baseline until Semgrep can become a meaningful gate.

The first cleanup wave should focus on runtime security risk: input-driven regex construction, unsafe logging patterns that may incorporate attacker-controlled values, and any real secret exposure outside tests. Accepted helper patterns should be either narrowed by rule scope or explicitly documented as intentional.

## User Stories

1. As a maintainer, I want Semgrep to run in report-only mode, so that I can see current debt without blocking unrelated work.
2. As a maintainer, I want Semgrep to scan runtime code before tests and migrations, so that cleanup effort stays focused on production-relevant risk.
3. As a maintainer, I want a narrower Semgrep rule set, so that I can reduce false positives from generic auto-detected rules.
4. As a maintainer, I want GrowChat-specific Semgrep rules alongside security packs, so that repo conventions are enforced consistently.
5. As a maintainer, I want current findings grouped into risk buckets, so that I can decide what to fix, suppress, or defer.
6. As a maintainer, I want user-input-driven regex construction flagged early, so that I can reduce ReDoS risk.
7. As a maintainer, I want unsafe logging patterns surfaced clearly, so that dynamic strings do not become hidden security or observability debt.
8. As a maintainer, I want obvious test-only secret literals excluded from the first cleanup wave, so that real runtime debt is not buried under fixture noise.
9. As a maintainer, I want HTML-escape helper patterns reviewed separately from exploit findings, so that accepted local helpers are not treated as emergencies.
10. As a maintainer, I want a stable baseline for current Semgrep debt, so that future PRs only add new findings.
11. As a maintainer, I want the Semgrep workflow to publish findings without failing CI initially, so that the cleanup can happen in batches.
12. As a maintainer, I want the workflow to be easy to tighten later, so that report-only mode can eventually become a gate once the baseline is low enough.
13. As a maintainer, I want Semgrep cleanup decisions to be documented, so that future contributors know why some patterns are accepted and others are not.
14. As a maintainer, I want runtime findings triaged before code changes begin, so that effort goes to the highest-risk items first.
15. As a maintainer, I want accepted patterns to be narrowed or suppressed deliberately, so that the rule set stays signal-heavy.
16. As a maintainer, I want the cleanup to avoid touching test and migration debt in the first pass, so that the initial scope stays manageable.
17. As a maintainer, I want the repo’s custom guardrail rules to remain aligned with the chosen Semgrep scope, so that the cleanup flow matches actual CI behavior.
18. As a maintainer, I want the Semgrep baseline to be reproducible locally, so that I can validate cleanup progress before pushing.
19. As a maintainer, I want high-risk Semgrep findings fixed before style-only debt, so that security value comes first.
20. As a maintainer, I want the cleanup process to be incremental, so that progress does not require a giant repo-wide refactor.

## Implementation Decisions

- Use Semgrep as the first debt-paying surface.
- Keep the first cleanup pass limited to runtime code.
- Run Semgrep in report-only mode until the baseline drops.
- Replace broad auto-discovery with a narrower security-focused rule set plus GrowChat-specific rules.
- Treat current findings as baseline debt, not as immediate CI failure conditions.
- Classify findings into true vulnerability, acceptable pattern, refactor-needed, and noise.
- Prioritize user-input-driven regex, unsafe logging, and real secret exposure outside tests.
- Keep accepted helper patterns separate from actual exploit surfaces.
- Preserve the option to tighten CI later once the baseline is low enough.
- Keep the cleanup staged so normal development is not blocked by old debt.
- Align any repo guardrail runner changes with the selected Semgrep scope.
- Avoid expanding the first cleanup pass to tests or migrations.

## Testing Decisions

- Good tests should validate external behavior, not Semgrep internals.
- The Semgrep workflow should be checked for non-blocking report behavior during the baseline phase.
- The runtime Semgrep command should be reproducible locally and should produce stable findings for the chosen scope.
- Cleanup changes should be verified by rerunning the narrowed Semgrep scan and checking that the targeted finding category is reduced or removed.
- Representative runtime modules that construct regexes or log dynamic data should be covered by tests that assert safe behavior at the API or output level.
- Accepted helper patterns should be validated through focused Semgrep scans or regression checks that ensure the repo-specific rule set does not overreach.
- Similar prior art in the repo: guardrail scripts, scoped lint runners, and existing unit tests that validate public-facing behavior rather than implementation details.

## Out of Scope

- Making Semgrep a hard blocker immediately.
- Cleaning up test-only findings in the first pass.
- Cleaning up migration debt in the first pass.
- Rewriting the entire lint stack at once.
- Converting every accepted helper into a third-party library immediately.
- Refactoring unrelated ESLint or jscpd debt as part of this Semgrep cleanup tranche.
- Implementing broad architectural changes unrelated to Semgrep findings.

## Further Notes

The intent is to turn a noisy `--config=auto` result into a manageable security-debt backlog. The cleanup should start by protecting production runtime behavior, then move toward policy hardening only after the baseline is understandable and reduced.

Once the baseline is much smaller, the Semgrep workflow can be promoted from report-only to a true gate.
