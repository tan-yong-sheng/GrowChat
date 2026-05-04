# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

#### Account UI duplication hardening (Slice A)

| Area                                    | Before                                                                    | Change                                                                                                                                                              | Benefit                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Status badge markup in account features | Raw inline badge `<span ...>` duplicated across account views             | Replaced with shared `renderStatusBadge()` in `account-connections.js` and `account-integrations.js`                                                                | Single canonical badge rendering, lower style drift risk, easier future edits                      |
| Guardrail for status badges             | No explicit enforcement in account slice                                  | Added Semgrep rule `no-raw-status-badge-markup-in-account-features` scoped to the two account files                                                                 | Prevents reintroduction of duplicated raw badge markup in this slice                               |
| Guardrail verification                  | Rule presence only                                                        | Added unit guardrail fixture test in `tests/unit/guardrails.test.js` for status badge violations                                                                    | Rule behavior validated in CI/test runs, safer refactors                                           |
| Pill-button guardrail false positives   | Full Semgrep blocked by toggle switch markup in `account-integrations.js` | Refined `no-raw-pill-button-markup-in-feature-code` to target rounded pill action buttons (`rounded-full` + `px-*` + `py-*`) while allowing compact toggle switches | Preserves guardrail intent, removes toggle false positives, unblocks full scan for account targets |
| Pill-button regression coverage         | No explicit pass/fail examples for action-pill vs toggle                  | Added fixture test: bad action-pill fails; compact toggle passes                                                                                                    | Prevents future regression in rule semantics                                                       |

### Validation

- `semgrep scan --config .semgrep/rules.yml --error public/js/features/account/account-connections.js public/js/features/account/account-integrations.js` → 0 findings
- `npm test -- tests/unit/guardrails.test.js` → 1 file passed, 4 tests passed
