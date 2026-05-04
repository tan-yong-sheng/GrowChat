# Vibe Coding Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a multi-layered guardrail system to prevent UI/UX duplication and design drift caused by AI-assisted "vibe coding", aligned with industry best practices for Tailwind CSS.

**Architecture:**

1. **Utility Layer (`cn`):** Introduce `clsx` and `tailwind-merge` to resolve overlapping utility classes safely.
2. **Semantic Extraction Layer:** Abstract recurring utility patterns (like Pill Buttons) into shared Vanilla JS components, then point existing UI docs at the canonical primitive instead of re-encoding button markup.
3. **Detection Layer (`jscpd`):** Integrate `jscpd` over the frontend UI surface to flag cloned code blocks before merge, with a baseline that compares shared primitives against feature code.
4. **Boundary Layer:** Use existing ESLint architecture boundaries for imports, and Semgrep for literal Tailwind class bundles that duplicate approved primitives.
5. **Context Layer:** Update `AGENTS.md`, `docs/ui-ux/README.md`, and create `docs/ui-ux/CONTEXT.md` to force a "Search-First" generation approach using GitNexus/AST-grep and to publish the canonical UI primitives.

**Tech Stack:** Tailwind CSS, clsx, tailwind-merge, jscpd, ESLint, Node.js

---

### Task 1: Utility Infrastructure (`cn` helper)

**Files:**

- Modify: `package.json`
- Create: `public/js/shared/utils/cn.js`

- [ ] **Step 1: Install dependencies**

Run: `npm install clsx tailwind-merge`

- [ ] **Step 2: Create the `cn` utility**

Create `public/js/shared/utils/cn.js`:

```javascript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind classes safely, resolving conflicts.
 * @param {...(string|Object|Array|null|undefined|boolean)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json public/js/shared/utils/cn.js
git commit -m "feat(ui): add cn utility for tailwind class merging"
```

---

### Task 2: Shared Component Extraction

**Files:**

- Create: `public/js/shared/components/button.js`

- [ ] **Step 1: Create a reusable Button component**

Create `public/js/shared/components/button.js`:

```javascript
import { cn } from '../utils/cn.js';
import { escapeHtml } from '../utils.js';

export function renderButton({
  label = '',
  type = 'button',
  variant = 'primary',
  className = '',
  disabled = false,
  ariaLabel = '',
} = {}) {
  const baseClasses =
    'inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-neutral-900 text-white border-neutral-900 hover:bg-black active:scale-95',
    secondary: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
    ghost: 'border-transparent bg-transparent text-gray-600 hover:bg-gray-100',
  };

  const finalClass = cn(baseClasses, variants[variant], className);
  const attrs = [
    `type="${escapeHtml(type)}"`,
    disabled ? 'disabled aria-disabled="true"' : '',
    ariaLabel ? `aria-label="${escapeHtml(ariaLabel)}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `
    <button ${attrs} class="${escapeHtml(finalClass)}">
      ${escapeHtml(label)}
    </button>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/shared/components/button.js
git commit -m "feat(ui): extract reusable renderButton component"
```

---

### Task 3: Detection Infrastructure (jscpd)

**Files:**

- Modify: `package.json`
- Create: `.jscpd.json`
- Modify: `scripts/run-scoped-guardrails.js`

- [ ] **Step 1: Install jscpd**

Run: `npm install --save-dev jscpd`

- [ ] **Step 2: Create .jscpd.json configuration**

```json
{
  "threshold": 0,
  "reporters": ["console", "json", "html"],
  "ignore": [
    "**/node_modules/**",
    "**/coverage/**",
    "**/*.test.js",
    "**/*.spec.js",
    "**/*.backup.*",
    "**/*~",
    "public/styles.css"
  ],
  "absolute": true,
  "mode": "mild"
}
```

- [ ] **Step 3: Add scripts to package.json**

Add to `"scripts"` in `package.json`:

```json
"lint:dupes": "jscpd public/js",
"lint:dupes:scoped": "node scripts/run-scoped-guardrails.js --jscpd"
```

Also add `lint:dupes:scoped` to `prepush` so duplicate checks gate pushes with the rest of the guardrails.

- [ ] **Step 4: Update run-scoped-guardrails.js to support jscpd**

Add to `scripts/run-scoped-guardrails.js`:

```javascript
if (process.argv.includes('--jscpd')) {
  run('npx', ['jscpd', 'public/js']);
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .jscpd.json scripts/run-scoped-guardrails.js
git commit -m "chore: integrate jscpd for UI duplication detection"
```

---

### Task 4: Semgrep Primitive Boundary Reinforcement

**Files:**

- Modify: `.semgrep/rules.yml`

- [ ] **Step 1: Add a literal-class guard for raw button markup**

Add a Semgrep rule in `.semgrep/rules.yml` because the offending markup lives in JS template strings, not AST selectors that ESLint can reliably match.

Target all frontend JS that can grow duplicate UI primitives, and exclude the canonical primitive file itself:

```yaml
- id: no-raw-pill-button-markup
  patterns:
    - pattern-regex: '(?s)class="[^"]*rounded-full[^"]*(bg-(?:black|neutral-900)|bg-\[#171717\])[^"]*px-4 py-2[^"]*font-semibold[^"]*"'
  paths:
    include:
      - 'public/js/**/*'
    exclude:
      - 'public/js/shared/components/button.js'
      - '**/*.test.js'
      - '**/*.spec.js'
  message: 'Do not inline pill-button markup in feature code. Use renderButton from public/js/shared/components/button.js.'
  severity: ERROR
  languages:
    - javascript
```

Keep `eslint-plugin-boundaries` for import layering only; do not use `no-restricted-syntax` for Tailwind class bundles here.

- [ ] **Step 2: Verify linting**

Run: `npm run lint:logic:scoped`
Expected: rule flags raw button markup anywhere outside the canonical primitive, while the primitive file stays clean.

- [ ] **Step 3: Commit**

```bash
git add .semgrep/rules.yml
git commit -m "refactor: enforce renderButton usage via semgrep"
```

---

### Task 5: AI Context & Primitives Guardrails

**Files:**

- Modify: `AGENTS.md`
- Create: `docs/ui-ux/CONTEXT.md`

- [ ] **Step 1: Create docs/ui-ux/CONTEXT.md**

```markdown
# UI/UX Canonical Primitives

## AI Generation Guardrails

- **Search-First Policy:** Always run GitNexus query / context lookup or AST-grep for existing UI patterns before creating new components or writing long strings of Tailwind classes.
- **No Expansion:** Do not generate new utility strings if a shared component can fulfill the layout.
- **Canonical Source:** UI primitives live in `docs/ui-ux/components/*.md` and are summarized here for agents; update this file and the component docs together.

## Approved Vanilla JS Components

- **Buttons:** `renderButton` in `public/js/shared/components/button.js` (handles primary, secondary, ghost variants)
- **Badges:** `renderStatusBadge` in `public/js/shared/components/status-badge.js`
- **Tables:** `renderDataTable` in `public/js/shared/components/status-badge.js`
- **Class Merging:** Always use `cn()` from `public/js/shared/utils/cn.js` for merging Tailwind classes instead of concatenating strings.
```

- [ ] **Step 2: Update docs navigation and AGENTS.md**

Update `docs/ui-ux/README.md`, `docs/ui-ux/components/chat-components.md`, and `docs/ui-ux/components/workspace-components.md` to point at `docs/ui-ux/CONTEXT.md` as the agent-facing index for canonical UI primitives, then add a short note in `AGENTS.md` under `## Developer Wiki & Knowledge Graph 📚` linking to the new file.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md docs/ui-ux/README.md docs/ui-ux/components/chat-components.md docs/ui-ux/components/workspace-components.md docs/ui-ux/CONTEXT.md
git commit -m "docs: establish AI generation guardrails and context boundaries"
```
