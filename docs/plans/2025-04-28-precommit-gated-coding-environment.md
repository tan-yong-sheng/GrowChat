# Pre-Commit Gated Coding Environment Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Implement automated code quality gates using Husky + pre-commit hooks to catch issues before commits reach CI/CD, preventing broken code from leaving developer machines.

**Architecture:** Use Husky v9 to manage Git hooks, lint-staged to run linters only on staged files (fast <10s), commitlint for conventional commits, and gitleaks for secret scanning. Hooks run locally on commit/push, CI maintains dual checks as safety net.

**Tech Stack:** husky, lint-staged, commitlint, eslint, prettier, gitleaks, detect-secrets, tsc, vitest

---

## Task 0: Setup husky and install dependencies

**Files:**

- Modify: `package.json` (add dependencies, scripts)
- Create: `.husky/` directory with hook files

**Step 1: Install base dependencies**

```bash
npm install -D husky lint-staged commitlint @commitlint/config-conventional
```

**Step 2: Initialize husky**

```bash
npx husky init
```

Expected: Creates `.husky/` directory with `pre-commit` hook

**Step 3: Verify husky setup**

Check `.husky/pre-commit` exists and contains:

```bash
npx lint-staged
```

**Step 4: Commit init**

```bash
git add package.json .husky/pre-commit
git commit -m "chore: add husky v9 git hooks"
```

---

## Task 1: Configure lint-staged for your TypeScript codebase

**Files:**

- Modify: `package.json`

**Step 1: Add lint-staged config to package.json**

Add after existing scripts:

```json
"lint-staged": {
  "src/**/*.{ts,tsx}": [
    "eslint --fix --max-warnings=0",
    "prettier --write"
  ],
  "src/**/*.{css,json,md,yml,yaml}": [
    "prettier --write"
  ]
}
```

**Step 2: Ensure eslint and prettier exist**

```bash
npm install -D eslint prettier
```

If missing, add config files (`.eslintrc.cjs`, `.prettierrc`)

**Step 3: Test lint-staged config**

Create test file, stage it, verify hooks run:

```bash
# Create test file
echo "// test" > src/test.ts
git add src/test.ts

# Run lint-staged manually
npx lint-staged
```

Expected: ESLint + Prettier run on staged file only

**Step 4: Commit config**

```bash
git add package.json
git commit -m "chore: add lint-staged config"
```

---

## Task 2: Configure commitlint for conventional commits

**Files:**

- Create: `commitlint.config.cjs`
- Modify: `.husky/commit-msg`

**Step 1: Create commitlint config**

```bash
echo "module.exports = { extends: ['@commitlint/config-conventional'] };" > commitlint.config.cjs
```

**Step 2: Create commit-msg hook**

```bash
npx husky add .husky/commit-msg "npx --no -- commitlint --edit \$1"
```

**Step 3: Test commit message**

```bash
git commit -m "feat: add test feature"
```

Expected: Accepts conventional commit

**Step 4: Test rejection**

```bash
git commit -m "bad commit message" || echo "Rejected as expected"
```

Expected: Commit rejected with error showing conventional commit format

**Step 5: Commit config**

```bash
git add commitlint.config.cjs .husky/commit-msg
git commit -m "chore: add commitlint for conventional commits"
```

---

## Task 3: Add secret scanning with gitleaks (pre-commit)

**Files:**

- Modify: `.husky/pre-commit`

**Step 1: Install gitleaks**

```bash
# macOS/Linux
brew install gitleaks

# Or download binary
# https://github.com/gitleaks/gitleaks/releases
```

**Step 2: Add gitleaks to pre-commit hook**

Edit `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
set -euo pipefail

# Skip in CI (CI runs full scan via GitHub Actions)
if [ -n "$CI" ]; then exit 0; fi

# Run gitleaks (fast, local only)
npx gitleaks detect --source . -v --exit-code 1 || exit 1

# Run lint-staged
npx lint-staged
```

**Step 3: Test with fake secret**

```bash
echo "AWS_SECRET_ACCESS_KEY=sk-test123" > src/test-secret.txt
git add src/test-secret.txt
git commit -m "test" || echo "Blocked as expected"
```

Expected: Rejects commit containing potential secret

**Step 4: Clean up test file**

```bash
git rm src/test-secret.txt || true
git commit -m "chore: remove test file"
```

**Step 5: Commit hook update**

```bash
git add .husky/pre-commit
git commit -m "chore: add gitleaks secret scanning to pre-commit"
```

---

## Task 4: Add typecheck to pre-push (not pre-commit for speed)

**Files:**

- Modify: `.husky/pre-push`

**Step 1: Create pre-push hook with typecheck**

```bash
npx husky add .husky/pre-push "npm run typecheck && npm run test"
```

**Step 2: Verify hook content**

Check `.husky/pre-push`:

```bash
#!/usr/bin/env sh
set -euo pipefail

npm run typecheck
npm run test
```

**Step 3: Test hook behavior**

```bash
# Create type error
echo "const x: string = 123" > src/type-test.ts
git add src/type-test.ts
git commit -m "test: add type error"
git push 2>&1 || echo "Blocked at pre-push as expected"
```

Expected: Typecheck fails, push blocked

**Step 4: Fix and retry**

```bash
git rm src/type-test.ts
git commit -m "chore: remove test file"
git push
```

Expected: Push succeeds after removing broken code

**Step 5: Commit hook setup**

```bash
git add .husky/pre-push
git commit -m "chore: add typecheck and test to pre-push"
```

---

## Task 5: Add secret scanning baseline workflow (detect-secrets)

**Files:**

- Create: `.secrets.baseline`
- Modify: `.husky/pre-commit`
- Create: `.pre-commit-config.yaml`

**Step 1: Initial baseline scan**

```bash
# Install detect-secrets
pip install detect-secrets  # or use homebrew

# Scan current codebase and create baseline
detect-secrets scan > .secrets.baseline
```

**Step 2: Review baseline**

```bash
cat .secrets.baseline
```

Remove false positives manually, keep only real secrets to remediate

**Step 3: Add baseline to git**

```bash
git add .secrets.baseline
git commit -m "chore: add secret scanning baseline"
```

**Step 4: Add detection hook (alternative to gitleaks)**

Create `.husky/pre-commit-detection`:

```bash
#!/usr/bin/env sh
set -euo pipefail

npx detect-secrets-hook --baseline .secrets.baseline
```

**Step 5: OR use pre-commit framework config**

Create `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
        exclude: package-lock.json
```

**Step 6: Install pre-commit (if using this approach)**

```bash
pip install pre-commit
pre-commit install
```

**Step 7: Document secret scanning strategy**

Add to `CONTRIBUTING.md` or `DEVELOPMENT.md`:

````markdown
## Secret Scanning

We use gitleaks for pre-commit detection and detect-secrets for baseline management.

- **Pre-commit (fast)**: gitleaks scans staged files in <1s
- **CI (full scan)**: TruffleHog verifies leaked credentials against APIs
- **Baseline**: `.secrets.baseline` tracks known secrets for remediation

To bypass pre-commit detection temporarily:

```bash
HUSKY=0 git commit -m "message"
```
````

````

**Step 8: Commit detection setup**

```bash
git add .secrets.baseline .pre-commit-config.yaml
git commit -m "chore: add detect-secrets baseline + config"
````

---

## Task 6: Add ESLint security rules for OWASP coverage

**Files:**

- Modify: `package.json` (add dependencies)
- Modify: `.eslintrc.cjs` (add security rules)

**Step 1: Install security plugins**

```bash
npm install -D \
  eslint-plugin-secure-coding \
  eslint-plugin-node-security \
  eslint-plugin-jwt \
  eslint-plugin-browser-security
```

**Step 2: Update ESLint config**

Add to `.eslintrc.cjs`:

```javascript
module.exports = {
  // ... existing config
  plugins: {
    // ... existing plugins
    'secure-coding': require('eslint-plugin-secure-coding'),
    'node-security': require('eslint-plugin-node-security'),
    'jwt': require('eslint-plugin-jwt'),
    'browser-security': require('eslint-plugin-browser-security'),
  },
  extends: [
    // ... existing extends
    'plugin:secure-coding/recommended',
    'plugin:node-security/recommended',
  ],
  // OWASP A03 Injection (specific files)
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: ['plugin:secure-coding/owasp-top-10'],
  },
};
```

**Step 3: Test security rules**

```bash
npx eslint src/ --max-warnings=0
```

Expected: Security rules run, catches patterns like:

- Hardcoded credentials
- `eval()` usage
- Insecure comparisons
- Weak crypto algorithms

**Step 4: Commit ESLint config**

```bash
git add package.json .eslintrc.cjs
git commit -m "chore: add ESLint security plugins for OWASP coverage"
```

---

## Task 7: Add CI/CD dual checks (safety net)

**Files:**

- Create: `.github/workflows/pre-push-scan.yml`
- Modify: Existing CI workflow

**Step 1: Create CI secret scan workflow**

```yaml
# .github/workflows/pre-push-scan.yml
name: Pre-Push Security Scan

on:
  push:
    branches: [main, develop, feature/*]

jobs:
  trufflehog-scan:
    name: TruffleHog Secret Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: TruffleHog Scan
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD
          extra_args: --only-verified

  commitlint-check:
    name: Commitlint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Commitlint Check
        uses: wagoid/commitlint-github-action@v5
```

**Step 2: Update existing CI to include full test**

In `.github/workflows/ci.yml` or similar:

```yaml
typecheck:
  name: Typecheck
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm run typecheck

test:
  name: Test Suite
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npm run test
```

**Step 3: Document CI behavior in CODEOWNERS**

Add to root:

```markdown
# CI Guardrails

CI runs these checks that local hooks do **not**:

- Full test suite (not just affected tests)
- Full TypeScript typecheck (entire project)
- TruffleHog full-history secret scan
- Commitlint on all commits (catches --no-verify bypasses)

Local hooks are fastest line of defense. CI is your safety net.
Never assume "I'll fix it later" — local hooks catch issues before push.
```

**Step 4: Commit CI setup**

```bash
git add .github/workflows/pre-push-scan.yml
git commit -m "ci: add TruffleHog + commitlint CI checks"
```

---

## Task 8: Create development documentation

**Files:**

- Create: `DEVELOPMENT.md` or modify `CONTRIBUTING.md`

**Step 1: Document development workflow**

Add section:

````markdown
## Development Workflow

### Pre-Commit Hooks

The following checks run automatically on `git commit`:

1. **Secret Scanning** (gitleaks) — blocks commits with potential secrets
2. **Linting** (ESLint) — catches code issues, auto-fixes when safe
3. **Formatting** (Prettier) — enforces consistent code style

### Pre-Push Hooks

The following checks run automatically on `git push`:

1. **Type Checking** (tsc) — full TypeScript validation
2. **Test Suite** (vitest) — all unit tests

### Skipping Hooks (Emergency Only)

```bash
# Skip git hooks (use sparingly)
git commit --no-verify -m "hotfix"
git push --no-verify

# Environment variable bypass (pre-commit hook only)
HUSKY=0 git commit -m "message"
```
````

**Warning**: CI still runs all checks. If hooks are bypassed, PRs will fail CI.

### Quick Validation

To validate your local setup:

```bash
# Run hooks manually (without committing)
npx lint-staged
npm run typecheck
npm run test

# Check hook installation
ls -la .husky/
```

### VS Code Integration

Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

This aligns editor behavior with pre-commit hooks.

````

**Step 2: Add to git**

```bash
git add DEVELOPMENT.md
git commit -m "docs: add development workflow with pre-commit hooks"
````

---

## Task 9: Final validation and cleanup

**Files:**

- All modified files (verify no issues)

**Step 1: Verify all hooks exist**

```bash
ls -la .husky/
```

Expected:

- `pre-commit`
- `commit-msg`
- `pre-push`

**Step 2: Run full local validation**

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Verify hooks installed
ls .husky/
```

Expected: HUSKY runs `prepare` script, hooks installed

**Step 3: Test full workflow**

```bash
# Make change
echo "// test change" >> src/some-file.ts

# Commit (should run all checks)
git add src/ some-file.ts
git commit -m "test: verify pre-commit hooks"

# Push (should run typecheck + tests)
git push
```

**Step 4: Document known limitations**

Add to `DEVELOPMENT.md`:

````markdown
## Known Limitations

1. **Hooks can be bypassed**: `--no-verify` and `HUSKY=0` exist for emergencies
2. **Local only**: Hooks run on developer machines only, never on CI
3. **Speed tradeoff**: Typecheck is in pre-push (not pre-commit) to keep commits fast (<10s)
4. **Secret detection**: baseline drift — new dependencies may add secrets, scan periodically

## Troubleshooting

### Hook not running

```bash
# Reinstall hooks
npm install

# Check hook exists
cat .husky/pre-commit

# Check hook is executable
chmod +x .husky/*
```
````

### Slow pre-commit

Run only format (no lint):

```bash
git add .
npx prettier --write .
git add -u
git commit -m "format"
```

### Conflicting rules

ESLint + Prettier may conflict. Ensure `eslint-config-prettier` is in extends array.

```json
"extends": [
  "eslint:recommended",
  "plugin:@typescript-eslint/recommended",
  "plugin:prettier/recommended"  // Must be last
]
```

````

**Step 5: Final commit**

```bash
git add DEVELOPMENT.md
git commit -m "docs: add troubleshooting and known limitations"
````

---

## Execution Summary

**Goal**: Guarded coding environment with pre-commit hooks

**Risk**: Low — hooks can be bypassed, CI catches everything

**Time**: ~45-60 minutes for skilled developer

**Compliance**: OWASP Top 10 coverage via ESLint security plugins, conventional commits via commitlint, secret scanning via gitleaks + detect-secrets

**CI Safety Net**: Pre-push hooks plus full CI test suite ensure nothing escapes

---

**Plan complete and saved to `docs/plans/2025-04-28-precommit-gated-coding-environment.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
