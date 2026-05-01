# Vibe Coding Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic, restrictive guardrails (Knip, Semgrep, TSC, Playwright, ESLint boundaries, and UI/UX checks) to force "vibe coding" agents to reuse canonical design system elements, ensure responsive layout integrity, and prevent architectural drift.

**Architecture:** We are adopting a deterministic, two-tiered hook strategy:
1. **Pre-commit (lint-staged):** Fast, local checks on staged files (ESLint with UI/UX and responsive class constraints, Prettier).
2. **Pre-push (Husky):** Full-tree, expensive hygiene checks (Knip, `tsc --noEmit`, Semgrep logic rules, Playwright multi-viewport atomic snapshots).

**Tech Stack:** Semgrep, Knip, TypeScript, ESLint (`eslint-plugin-boundaries`, `eslint-plugin-tailwindcss`, `no-restricted-syntax`), Prettier, dependency-cruiser, Playwright, Husky, lint-staged.

---

### Task 1: Deterministic Hook Infrastructure (Husky + lint-staged)

**Files:**
- Modify: `package.json`
- Modify: `.husky/pre-commit`
- Modify: `.husky/pre-push`

- [ ] **Step 1: Configure `lint-staged` in `package.json`**

Update `package.json` to ensure `lint-staged` is configured for fast pre-commit checks:

```json
  "lint-staged": {
    "*.js": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.css": [
      "prettier --write"
    ]
  },
```

- [ ] **Step 2: Update `.husky/pre-commit`**

Make the pre-commit hook deterministic:

```sh
#!/usr/bin/env sh
set -euo pipefail

# Skip in CI
if [ -n "${CI:-}" ]; then exit 0; fi

# Fast checks on staged files only
npx lint-staged
```

- [ ] **Step 3: Update `.husky/pre-push`**

Make the pre-push hook responsible for full-tree analysis:

```sh
#!/usr/bin/env sh
set -euo pipefail

# Skip in CI
if [ -n "${CI:-}" ]; then exit 0; fi

echo "Running full-tree vibe guardrails..."

npm run test
npm run typecheck
npm run lint:logic
npm run lint:hygiene
```

- [ ] **Step 4: Commit**

```bash
git add package.json .husky/pre-commit .husky/pre-push
git commit -m "chore: setup deterministic pre-commit and pre-push hooks"
```

---

### Task 2: UI/UX Vibe & Responsiveness Enforcement (ESLint + Tailwind)

**Files:**
- Modify: `package.json`
- Modify: `eslint.config.cjs`
- Create: `.prettierrc` (if not existing)

- [ ] **Step 1: Install Tailwind linting plugins**

```bash
npm install --save-dev eslint-plugin-tailwindcss prettier-plugin-tailwindcss
```

- [ ] **Step 2: Add Tailwind classes and raw HTML restrictions to ESLint**

We want to force the LLM to use consistent Tailwind responsive classes and avoid raw HTML tags in feature directories. Update `eslint.config.cjs`:

```javascript
  {
    plugins: {
      tailwindcss: require('eslint-plugin-tailwindcss')
    },
    rules: {
      'tailwindcss/classnames-order': 'warn',
      'tailwindcss/enforces-shorthand': 'warn',
      'tailwindcss/no-contradicting-classname': 'error',
    }
  },
  {
    files: ['public/js/features/**/*.js', 'src/features/**/*.js'], // Assuming JSX/JS files in features
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Bans lowercase (raw HTML) tags to enforce Component reuse
          selector: 'JSXOpeningElement[name.name=/^[a-z]/]',
          message: 'Raw HTML elements are forbidden in feature modules. Import from the UI facade (e.g., <Button>, <Text>).'
        }
      ]
    }
  },
```
*(Ensure to update boundaries to restrict direct 3rd-party UI imports if applicable).*

- [ ] **Step 3: Setup Prettier for responsive class auto-sorting**

Create or update `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json eslint.config.cjs .prettierrc
git commit -m "chore: enforce UI component reuse and responsive class order"
```

---

### Task 3: Clean Up & Prevent "Orphan Slop" (Knip)

**Files:**
- Create: `knip.json`
- Modify: `package.json`

- [ ] **Step 1: Configure Knip**

Create `knip.json` with the following configuration:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema-json",
  "entry": ["src/index.js", "src/routers/**/*.js", "src/bootstrap/**/*.js", "scripts/**/*.js", "public/js/**/*.js"],
  "project": ["src/**/*.js", "public/js/**/*.js", "scripts/**/*.js"]
}
```

- [ ] **Step 2: Add Knip script to `package.json`**

Update the `scripts` section in `package.json`:

```json
  "scripts": {
    "lint:hygiene": "knip",
```

- [ ] **Step 3: Commit**

```bash
git add package.json knip.json
git commit -m "chore: add knip to detect dead code and unused dependencies"
```

---

### Task 4: Hard-Lock Architecture (Dependency Cruiser)

**Files:**
- Modify: `.dependency-cruiser.cjs`

- [ ] **Step 1: Harden `dependency-cruiser`**

Modify `.dependency-cruiser.cjs` to upgrade `warn-cross-feature` to an `error`, preventing ad-hoc coupling:

```javascript
    {
      name: 'no-cross-feature',
      comment: 'Cross-feature import detected — extract shared logic to shared/',
      severity: 'error',
      from: { path: '^public/js/features/([^/]+)/' },
      to: { path: '^public/js/features/(?!$1)([^/]+)/' },
    },
```
*(Make sure to remove the old `warn-cross-feature` block).*

- [ ] **Step 2: Commit**

```bash
git add .dependency-cruiser.cjs
git commit -m "chore: harden architectural boundaries to disallow cross-feature imports"
```

---

### Task 5: TypeScript Data Contracts for JS (`tsc --noEmit`)

**Files:**
- Create: `jsconfig.json`
- Modify: `package.json`

- [ ] **Step 1: Create `jsconfig.json`**

Create `jsconfig.json` in the root:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Node",
    "target": "ES2024",
    "checkJs": true,
    "allowJs": true,
    "strict": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noImplicitAny": false,
    "lib": ["ES2024", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*", "public/js/**/*"]
}
```

- [ ] **Step 2: Add `typecheck` script to `package.json`**

Update `package.json` `scripts`:

```json
  "scripts": {
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 3: Commit**

```bash
git add package.json jsconfig.json
git commit -m "chore: enforce strict jsdoc typechecking via tsc --noEmit"
```

---

### Task 6: Semantic Logic & Responsive Vibe Enforcement (Semgrep)

**Files:**
- Create: `.semgrep/rules.yml`
- Modify: `package.json`

- [ ] **Step 1: Create Semgrep Rules**

Create `.semgrep/rules.yml` to include Backend Architecture, Frontend Vibe, and Responsiveness constraints:

```yaml
rules:
  - id: no-direct-db-access-outside-repositories
    patterns:
      - pattern-either:
          - pattern: $DB.query(...)
          - pattern: $DB.from(...)
      - pattern-inside: |
          import { db } from '$DB_IMPORT'
          ...
      - pattern-not-inside: |
          class $CLASS implements Repository { ... }
    paths:
      include:
        - "src/services/**/*"
        - "src/routers/**/*"
    message: "Direct database access is forbidden outside of the repository layer. Use a repository class."
    severity: ERROR
    languages:
      - javascript

  - id: no-raw-dom-manipulation-in-features
    patterns:
      - pattern-either:
          - pattern: document.querySelector(...)
          - pattern: document.write(...)
          - pattern: $EL.innerHTML = ...
    paths:
      include:
        - "public/js/features/**/*"
    message: "Raw DOM manipulation is forbidden in features to preserve UI framework stability."
    severity: ERROR
    languages:
      - javascript
      
  - id: no-inline-styles
    patterns:
      - pattern: style={{...}}
    paths:
      include:
        - "public/js/features/**/*"
    message: "Inline styles break design system consistency and responsiveness. Use Tailwind classes."
    severity: ERROR
    languages:
      - javascript

  - id: enforce-tailwind-responsive-breakpoints
    patterns:
      - pattern: |
          <style>
            @media (max-width: ...) { ... }
          </style>
    message: "Custom media queries are forbidden. Use Tailwind responsive prefixes (sm:, md:, lg:) to ensure consistency."
    severity: ERROR
    languages:
      - html
      - javascript
```

- [ ] **Step 2: Add Semgrep script to `package.json`**

Update `package.json` `scripts`:

```json
  "scripts": {
    "lint:logic": "semgrep scan --config .semgrep/rules.yml --error",
```

- [ ] **Step 3: Commit**

```bash
git add package.json .semgrep/rules.yml
git commit -m "chore: add semgrep rules for logic, UI vibe, and responsiveness enforcement"
```

---

### Task 7: Multi-Viewport UI Consistency (Playwright Snapshots)

**Files:**
- Modify: `playwright.config.ts` (if it exists)
- Create: `tests/ui-components/button-responsive.spec.js`

- [ ] **Step 1: Configure Playwright for multi-viewport strict snapshots**

If `playwright.config.ts` exists, update it. Otherwise, create it with predefined canonical responsive viewports:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 0, // Zero tolerance for Vibe Drift on primitives
      threshold: 0.05,
    },
  },
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 2: Create an atomic responsive component test**

Create `tests/ui-components/button-responsive.spec.js` to demonstrate the multi-viewport vibe oracle:

```javascript
import { test, expect } from '@playwright/test';

test.describe('Primary Button Responsiveness', () => {
  test('visual consistency across viewports', async ({ page }) => {
    // Mock a clean page with just the component loading styles
    await page.setContent(`
      <html>
        <head>
          <link rel="stylesheet" href="/public/styles.css">
        </head>
        <body style="padding: 20px; display: inline-block;">
          <!-- A button that changes color/size on larger screens -->
          <button class="bg-blue-500 md:bg-green-500 text-white font-bold py-2 md:py-4 px-4 md:px-8 rounded">Click Me</button>
        </body>
      </html>
    `);
    
    const button = page.locator('button');
    
    // Enforces pixel-perfect consistency across configured mobile/desktop projects
    await expect(button).toHaveScreenshot('primary-button-responsive.png');
  });
});
```

- [ ] **Step 3: Add to CI / Scripts**

Ensure `package.json` has `test:e2e:update-snapshots` and `test:e2e`. Update `.husky/pre-push` to include the snapshot check (optional based on performance, alternatively move this exclusively to CI).

```json
  "scripts": {
    "test:ui:snapshots:responsive": "playwright test",
```

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/ui-components/
git commit -m "test: implement strict multi-viewport visual snapshots for responsive vibe oracle"
```
