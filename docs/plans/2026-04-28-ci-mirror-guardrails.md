# CI Mirror + Guardrails Cleanup Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Turn local git hooks into a reliable developer guardrail system backed by CI, with clear docs and no benchmark-chasing.

**Architecture:** Keep Husky as the fast local gate, but make GitHub Actions the source of truth for full verification. Local hooks should stay lightweight and predictable; CI should run the same checks plus full coverage. The plan also removes benchmark artifacts from the day-to-day workflow so the repo stays clean and maintainable.

**Tech Stack:** Husky v9, lint-staged, commitlint, GitHub Actions, ESLint, Prettier, Vitest, TypeScript CLI, Node.js

---

### Task 1: Clean repo state and remove benchmark artifacts from the normal workflow

**Files:**

- Modify: `src/test-file.js` or remove if still present in working tree
- Modify: `autoresearch.baseline.md` if any benchmark-only notes should be moved out of the main developer docs
- Modify: `autoresearch.jsonl` only if it contains accidental manual edits, otherwise leave as-is

**Step 1: Inspect current working tree**

Run:

```bash
git status --short
```

Expected: identify any leftover benchmark/test files and keep only intentional changes.

**Step 2: Remove any stray benchmark/test file from working tree**

If `src/test-file.js` is still present as an accidental change, delete or restore it.

Run:

```bash
git restore src/test-file.js
```

Expected: working tree no longer shows the stray file.

**Step 3: Verify repo is clean aside from intentional plan work**

Run:

```bash
git status --short
```

Expected: only intended changes remain.

**Step 4: Commit cleanup if any file changed**

```bash
git add -A
git commit -m "chore: clean up benchmark leftovers"
```

---

### Task 2: Add CI workflow that mirrors local guardrails

**Files:**

- Create: `.github/workflows/guardrails.yml`
- Modify: `package.json` if any script is missing for CI reuse

**Step 1: Write failing workflow first**

Create a minimal workflow file that references existing scripts but does not yet pass all desired checks.

Target checks:

- `npm ci`
- `npm run lint`
- `npm run format:check`
- `npm run test`
- `npm run typecheck`
- optional secret scan or hook-equivalent check if the repo already has a script for it

**Step 2: Run local validation of workflow syntax**

Run:

```bash
python - <<'PY'
import yaml, pathlib
print('workflow file exists:', pathlib.Path('.github/workflows/guardrails.yml').exists())
PY
```

Expected: file exists and parses as YAML if a linter is available.

**Step 3: Minimal implementation**

Use a single job that checks out repo, installs deps with `npm ci`, then runs the same checks as local plus any CI-only checks.

**Step 4: Verify via local dry run**

Run the existing scripts individually:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
```

Expected: each command passes locally.

**Step 5: Commit workflow**

```bash
git add .github/workflows/guardrails.yml package.json
git commit -m "ci: add guardrails workflow"
```

---

### Task 3: Make local hook behavior explicit and low-friction

**Files:**

- Modify: `.husky/pre-commit`
- Modify: `.husky/commit-msg`
- Modify: `.husky/pre-push`
- Modify: `.lintstagedrc.json`

**Step 1: Write a small failing test case for hook expectations**

Add or update a lightweight test/documented check that verifies the repo still expects:

- pre-commit: secret scan + lint-staged
- commit-msg: commitlint
- pre-push: typecheck + test

If no automated test makes sense, use a short verification script in the plan notes and run it manually.

**Step 2: Normalize hook scripts**

Make hook commands explicit, stable, and easy to read. Avoid hidden behavior and make sure shell safety flags are compatible with Husky v9 and the current OS environment.

**Step 3: Reduce hook noise**

If lint-staged warnings are noisy or confusing, adjust its config so errors are clear and false positives are minimized.

**Step 4: Verify hook flow manually**

Run:

```bash
npm run precommit
npm run prepush
npx commitlint --edit <temp-message-file>
```

Expected: commands behave exactly like the hook paths.

**Step 5: Commit hook polish**

```bash
git add .husky/pre-commit .husky/commit-msg .husky/pre-push .lintstagedrc.json
git commit -m "chore: polish local hook behavior"
```

---

### Task 4: Document developer workflow and bypass rules

**Files:**

- Create or modify: `docs/developer-workflow.md`
- Modify: `README.md` if it already has a developer setup section
- Modify: `CONTRIBUTING.md` if present and used by the repo

**Step 1: Draft the failing doc outline**

Write the sections that developers need:

- what runs on commit
- what runs on push
- how CI mirrors local checks
- how to bypass hooks in emergencies
- how to recover from a failed hook

**Step 2: Fill in exact commands**

Include exact commands for:

- `npm run precommit`
- `npm run prepush`
- `npm run lint`
- `npm run test`
- `npm run typecheck`
- emergency bypass examples with `--no-verify`

**Step 3: Verify docs match repo reality**

Cross-check each command against `package.json` and hook files.

**Step 4: Commit docs**

```bash
git add docs/developer-workflow.md README.md CONTRIBUTING.md
git commit -m "docs: add developer workflow guide"
```

---

### Task 5: Final verification and cleanup

**Files:**

- All files touched above

**Step 1: Run full local checks**

Run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
```

Expected: all pass.

**Step 2: Check git status**

Run:

```bash
git status --short
```

Expected: only intentional changes remain or working tree is clean.

**Step 3: Sanity-check workflow file and hook file contents**

Run:

```bash
sed -n '1,220p' .github/workflows/guardrails.yml
sed -n '1,220p' .husky/pre-commit
sed -n '1,220p' .husky/pre-push
```

Expected: workflow mirrors local checks; hooks are simple and readable.

**Step 4: Commit final cleanup**

```bash
git add -A
git commit -m "chore: finish guardrails cleanup"
```

---

**Execution note:** Do not tune for micro-benchmarks unless users report real hook pain. Default path is durability, clarity, and CI parity.
