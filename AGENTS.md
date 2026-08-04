# AGENTS.md

This file gives coding agents project-specific context. Keep it short and update it when workflows change.

## Project Overview

- **Primary app or package**: `growchat` — Cloudflare Workers app (package.json: `growchat@1.0.0`)
- **Main entry points**: `src/` — ES modules for each routing concern (chat, models, auth, files, users)
- **Important directories**: `src/routers/` (API routes), `src/llm/` (LLM providers), `public/js/` (client-side JS), `scripts/` (build/dev tools)

## Architecture Notes

- **Module boundaries**: Each `src/routers/` file exports one handler — clear module boundary per route
- **Generated or vendored code**: `no-mistakes` owns `CHANGELOG.md` and some `.config/` files — do not hand-edit
- **Sensitive areas**: `src/routers/auth/` (JWT), `src/routers/chat/` (data access), `src/llm/` (API keys through env)

## Commands

- **Install**: `pnpm install`
- **Build**: `pnpm run build` — builds the Cloudflare Worker
- **Test**: `pnpm run test` — runs unit tests
- **Typecheck**: `tsc --noEmit`
- **E2E**: `pnpm run test:e2e` — Playwright-based
- **Lint/audit**: `fallow audit --format json --quiet`
- **Secret scan**: `node scripts/secret-scan.cjs` (pre-commit hook)
- **Dev server**: `pnpm run dev` — starts Cloudflare Workers dev server

## Fallow

- Use `fallow audit --format json --quiet` before committing AI-generated changes.
- Use `fallow dead-code --format json --quiet`, `fallow dupes --format json --quiet`, and `fallow health --format json --quiet` for targeted checks.
- Use `fallow list --entry-points --format json --quiet` and `fallow list --boundaries --format json --quiet` to inspect project shape.

<!-- generated:task-matrix:start -->

| When the agent is about to...     | Run                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>`                                           |
| delete an "unused" dependency     | `fallow dead-code --trace-dependency <name>`                                         |
| commit or open a PR               | `fallow audit --base <ref>`                                                          |
| prioritize refactoring            | `fallow health --hotspots --targets`                                                 |
| ask who owns code                 | `fallow health --ownership`                                                          |
| check untested-but-reachable code | `fallow health --coverage-gaps`                                                      |
| consolidate duplication           | `fallow dupes --trace dup:<fingerprint>`                                             |
| find feature flags                | `fallow flags`                                                                       |
| surface security candidates       | `fallow security`                                                                    |
| understand a finding              | `fallow explain <issue-type>`                                                        |
| scope a monorepo                  | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |

<!-- generated:task-matrix:end -->

## Agent Rules

- **Do not edit**: Files owned by `no-mistakes` pipeline (CHANGELOG.md, `.config/wt.toml` during an active gate)
- **Always ask before**: Adding new npm dependencies, changing `pnpm-lock.yaml`, modifying the `wt.toml` hook config, deleting a file that might be referenced
- **Preferred style**: `fallow` output is JSON — pipe through `jq` or `--format json` for structured evaluation
- **Git**: Use `wt switch` for worktrees, `wt merge` for PRs — never `--force` push unless explicitly approved

---

<!-- fallow:setup-hooks:start -->

## Fallow local gate

Before any `git commit` or `git push`, run `fallow audit --format json --quiet --explain --gate-marker agent`. If the verdict is `fail`, fix the reported findings before retrying. Treat JSON runtime errors like `{ "error": true, ... }` as non-blocking.

Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict. Inherited findings on touched files are reported under `attribution` and annotated with `introduced: false`, but do not block the commit. Set `[audit] gate = "all"` in `fallow.toml` to gate every finding in changed files.

For non-skill agents, treat the task map below as the local onboarding source: run the listed fallow command before destructive edits, before commits, and before pull request handoff.

## Fallow task map

| When the agent is about to...     | Run                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>`                                           |
| delete an "unused" dependency     | `fallow dead-code --trace-dependency <name>`                                         |
| commit or open a PR               | `fallow audit --base <ref>`                                                          |
| prioritize refactoring            | `fallow health --hotspots --targets`                                                 |
| ask who owns code                 | `fallow health --ownership`                                                          |
| check untested-but-reachable code | `fallow health --coverage-gaps`                                                      |
| consolidate duplication           | `fallow dupes --trace dup:<fingerprint>`                                             |
| find feature flags                | `fallow flags`                                                                       |
| surface security candidates       | `fallow security`                                                                    |
| understand a finding              | `fallow explain <issue-type>`                                                        |
| scope a monorepo                  | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |

<!-- fallow:setup-hooks:end -->

## no-mistakes

Before `git push`, run the no-mistakes pipeline to validate changes and auto-fix findings:

```bash
no-mistakes axi run --intent "<description of changes>"
```

When at a `gate:` step, respond with:

- `--action approve` — accept the gate and continue
- `--action fix --findings <ids>` — auto-fix selected findings (do not edit files yourself; the pipeline fixes them)
- `--action skip` — skip the step

After the pipeline completes (`outcome: checks-passed` or `outcome: failed`):

- If `checks-passed`, create a PR with `gh pr create`
- If `failed`, fix the reported issues and retry with `no-mistakes rerun`
- If `aborted` or `cancelled`, recover with `no-mistakes sync --recover --yes`

<!-- no-mistakes:review:start -->

Before pushing changes to origin, run `no-mistakes axi respond --action fix --findings <ids>` to have the pipeline fix any review findings automatically. Do not edit the files yourself — the pipeline owns the fix commit.

<!-- no-mistakes:review:end -->
