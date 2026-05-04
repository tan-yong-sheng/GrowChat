# Semgrep Runtime Debt Triage

Scope: runtime code only (`src/`, `public/`).
Mode: report-only baseline.

## Triage Buckets

- **A. True vuln** — real security risk, fix now
- **B. Acceptable pattern** — intentional helper / local pattern, suppress or narrow rule
- **C. Refactor-needed** — real cleanup, but not urgent vuln
- **D. Noise** — generic Semgrep rule too broad for this repo

## Current Runtime Findings

| File / area                                                  | Finding type                        | Bucket | Why                                                                          | Next action                                     |
| ------------------------------------------------------------ | ----------------------------------- | -----: | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `public/js/shared/components/search-modal-helpers.js`        | `non-literal-regexp`                |      A | User input is used to construct regex; fixed by removing `RegExp` entirely   | Verify regression tests and keep scan clean     |
| `src/routers/files.js`                                       | `unsafe-formatstring`               |      C | Dynamic value in log path; not usually exploitable, but should be normalized | Convert to constant-first log pattern if needed |
| `src/routers/models.js`                                      | `unsafe-formatstring`               |      C | Dynamic base URL in warning log                                              | Normalize log format                            |
| `src/services/extraction.js`                                 | `unsafe-formatstring`               |      C | Dynamic document id in error log                                             | Normalize log format                            |
| `src/services/uploads.js`                                    | `unsafe-formatstring`               |      C | Dynamic R2 key in error log                                                  | Normalize log format                            |
| `src/utils/sri-hashes.js`                                    | `unsafe-formatstring`               |      C | Dynamic key in warning log                                                   | Normalize log format                            |
| `public/js/shared/utils/dom-escape.js`                       | `replaceAll()` HTML escape helper   |  B / D | Intentional escape helper; generic rule is too broad here                    | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/search-bar.js`                  | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/server-modal.js`                | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/settings-drawer-shell.js`       | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/settings-nav.js`                | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/settings-top-nav.js`            | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/settings-viewport.js`           | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/user-profile-footer-helpers.js` | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/workspace-top-tabs.js`          | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/workspace-vertical-tabs.js`     | `replaceAll()` HTML escape helper   |  B / D | Same helper pattern used for local HTML escaping                             | Narrow rule or suppress accepted helper         |
| `public/js/shared/components/section-header.js`              | repeated block / clone-like pattern |      C | Shape repetition, not direct vuln                                            | Consider refactor only if touching area         |
| `public/js/shared/components/files-modal-helpers.js`         | repeated helper pattern             |      C | Duplicate-ish helper shape                                                   | Consider refactor only if touching area         |
| `public/js/shared/components/connection-modal.js`            | repeated modal pattern              |      C | Duplicate-ish modal layout logic                                             | Consider refactor only if touching area         |

## Priorities

1. **Fix A first**
   - `search-modal-helpers.js` ✅
2. **Normalize C next**
   - log formatstrings in `src/`
3. **Decide B/D policy**
   - keep helper escapes, but narrow or suppress generic rule
4. **Leave non-security duplication for later**
   - Semgrep should not become a jscpd replacement

## Notes

- The test secret finding from the earlier `--config=auto` scan is excluded here because this pass is runtime-only.
- This triage intentionally keeps noisy helper-escape rules separate from real security risk.
- Password reset email `href` finding was reviewed and deferred from the runtime baseline; current report-only scan excludes that noisy template rule.
