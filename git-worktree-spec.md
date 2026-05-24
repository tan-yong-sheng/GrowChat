# Git Worktree Spec: fix/ci-workflow-paths

| Field | Value |
|---|---|
| **Source Reference** | https://github.com/tan-yong-sheng/GrowChat/issues/113 |
| **Branch** | `fix/ci-workflow-paths` |
| **Parent** | #72 (quality gates roadmap) |
| **Merge Priority** | Anytime (isolated — no source code changes) |

## Goal

Fix CI workflow path detection gaps and efficiency issues: expand the `ui` filter to catch E2E-affecting changes, add `paths-ignore` to expensive workflows for doc-only PRs, add nightly mutation testing schedule, and add actionlint for workflow YAML validation.

## Requirements

### Bug: `ui` filter too narrow in `guardrails.yml`
The `ui` filter only matches `public/**` and `src/input.css`, missing paths that affect E2E accessibility tests:
- `tests/e2e/**` — test logic changes
- `tests/shared/**` — shared Playwright setup
- `playwright.config.ts` — test config
- `tailwind.config.js` — utility changes affect rendering → a11y

**Failure scenario:** PR changes only `tests/e2e/frontend/accessibility.spec.ts` → `ui=false` → e2e-accessibility SKIPPED.

### Efficiency: `codeql.yml` runs on ALL PRs
CodeQL is the slowest workflow (5-10 min). Runs even on `.md`-only PRs. Add `paths-ignore`.

### Efficiency: `semgrep.yml` runs on ALL PRs
Semgrep runs on every PR/push including doc-only changes. Add `paths-ignore`.

### Efficiency: `mutation-testing.yml` only runs weekly
Mutation regressions can sit in main for up to 7 days. Add nightly schedule.

### Missing: No actionlint / workflow YAML validation
No linter validates `.github/workflows/` YAML syntax. A typo could silently break CI.

## Implementation Scope

- [x] `.github/workflows/guardrails.yml` — expand `ui` filter:
  ```yaml
  ui:
    - 'public/**'
    - 'src/input.css'
    - 'tests/e2e/**'
    - 'tests/shared/**'
    - 'playwright.config.ts'
    - 'tailwind.config.js'
  ```
- [x] `.github/workflows/codeql.yml` — add `paths-ignore` for doc-only PRs
- [x] `.github/workflows/semgrep.yml` — add `paths-ignore` for doc-only PRs
- [x] `.github/workflows/mutation-testing.yml` — add nightly schedule (`0 2 * * *`)
- [x] `.github/workflows/guardrails.yml` — add actionlint step for workflow YAML validation
- [x] `package.json` — add `lint:workflows` script if actionlint is installed

## Acceptance Criteria

1. PR that changes only `tests/e2e/frontend/accessibility.spec.ts` → `ui=true` → e2e-accessibility runs
2. PR that changes only `.md` files → codeql + semgrep workflows skip
3. PR that changes `tailwind.config.js` → `ui=true` → e2e-accessibility runs
4. Nightly mutation test runs at 02:00 UTC in addition to weekly Sunday
5. Malformed workflow YAML caught by actionlint step in guardrails
6. All existing tests pass (no source code changes in this branch)

## Technical Constraints

- All changes are workflow YAML + CI config only — no source code changes
- `paths-ignore` patterns must match the same convention as `guardrails.yml` (`**/*.md`, `LICENSE`, `docs/`)
- actionlint should run early in the guardrails job (fast, catches config errors before expensive steps)
- Keep `push: branches: [main]` triggers without `paths-ignore` — main branch should always run full gate

## Cross-branch Notes

- **Isolated** — no file overlap with any other worktree
- Can merge anytime, even alongside WT1 (admin-models-bugs)
- No source code changes means no risk of merge conflicts with other branches
