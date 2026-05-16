# Parallel Issue Fix — Worktree Plan

**Date:** 2026-05-15
**Scope:** All 10 open GitHub issues at `tan-yong-sheng/GrowChat`
**Goal:** Fix all issues in parallel via git worktrees, then merge to main with minimal conflict risk.

---

## Open Issues

| #   | Title                                                                 | Severity    | Key Files                                         |
| --- | --------------------------------------------------------------------- | ----------- | ------------------------------------------------- |
| 31  | SSRF via LLM connection test endpoints                                | 🔴 Critical | `src/routers/admin.js`, `src/routers/users.js`    |
| 32  | Connection test relays upstream error bodies, leaks API key fragments | 🔴 High     | `src/routers/admin.js`, `src/routers/users.js`    |
| 23  | Auth form falls back to GET, can leak credentials without JS          | 🔴 High     | `public/auth.html`, `public/js/bootstrap/auth.js` |
| 24  | Local auth registration crashes with 500 when JWT_SECRET too short    | 🟠 High     | `src/routers/auth.js`, `src/shared/jwt-secret.js` |
| 27  | GET /api/auth/me is missing                                           | 🟡 Medium   | `src/routers/auth.js`                             |
| 28  | Auth routes return 404 instead of 405 for wrong methods               | 🟡 Medium   | `src/routers/auth.js`                             |
| 30  | Auth modals do not close on Escape                                    | 🟡 Medium   | `public/js/bootstrap/auth.js`                     |
| 29  | Auth page does not apply the Inter font                               | 🟢 Low      | `public/auth.html`                                |
| 26  | Update fast-uri — close two high-severity Dependabot alerts           | 🟢 Low      | `package.json`, `package-lock.json`               |
| 25  | Update postcss — close medium-severity Dependabot alert               | 🟢 Low      | `package.json`, `package-lock.json`               |

---

## Conflict Analysis

Issues that touch the **same files** will conflict if developed on separate branches and merged independently.

### Conflict Groups

| Group               | Issues        | Shared Files                                      | Conflict Risk                      |
| ------------------- | ------------- | ------------------------------------------------- | ---------------------------------- |
| **Connection test** | #31, #32      | `src/routers/admin.js`, `src/routers/users.js`    | **High** if split; zero if batched |
| **Auth backend**    | #24, #27, #28 | `src/routers/auth.js`                             | **High** if split; zero if batched |
| **Auth frontend**   | #23, #29, #30 | `public/auth.html`, `public/js/bootstrap/auth.js` | **High** if split; zero if batched |
| **Dependencies**    | #25, #26      | `package.json`, `package-lock.json`               | **High** if split; zero if batched |

### Cross-Group Conflicts

| Group A         | Group B       | Overlapping Files? | Risk    |
| --------------- | ------------- | ------------------ | ------- |
| Connection test | Auth backend  | None               | ✅ None |
| Connection test | Auth frontend | None               | ✅ None |
| Connection test | Dependencies  | None               | ✅ None |
| Auth backend    | Auth frontend | None               | ✅ None |
| Auth backend    | Dependencies  | None               | ✅ None |
| Auth frontend   | Dependencies  | None               | ✅ None |

**All four groups are fully independent.** Zero cross-group file overlap.

---

## Worktree Layout

Batch conflicting issues into the same worktree so they land in one PR and never conflict with each other.

```
.worktrees/
├── fix/security-connection-test/   ← Issues #31 + #32
├── fix/auth-backend/               ← Issues #24 + #27 + #28
├── fix/auth-frontend/              ← Issues #23 + #29 + #30
└── fix/deps/                       ← Issues #25 + #26
```

| Worktree                       | Branch                         | Issues        | Rationale                                                                 |
| ------------------------------ | ------------------------------ | ------------- | ------------------------------------------------------------------------- |
| `fix/security-connection-test` | `fix/security-connection-test` | #31, #32      | Same files; SSRF fix and error sanitization are related                   |
| `fix/auth-backend`             | `fix/auth-backend`             | #24, #27, #28 | All touch `src/routers/auth.js`; batch prevents merge conflicts           |
| `fix/auth-frontend`            | `fix/auth-frontend`            | #23, #29, #30 | All touch `public/auth.html` or `auth.js`; batch prevents merge conflicts |
| `fix/deps`                     | `fix/deps`                     | #25, #26      | Both touch `package.json` + lockfile; trivial batch                       |

---

## Setup Commands

```bash
# 1. Prune stale worktrees from previous sessions
git worktree prune

# 2. Create worktrees (each branches off main)
git worktree add .worktrees/fix/security-connection-test -b fix/security-connection-test main
git worktree add .worktrees/fix/auth-backend           -b fix/auth-backend           main
git worktree add .worktrees/fix/auth-frontend           -b fix/auth-frontend          main
git worktree add .worktrees/fix/deps                    -b fix/deps                   main

# 3. Install dependencies in each (independent node_modules)
for wt in .worktrees/fix/*/; do
  echo "Installing in $wt..."
  npm install --prefix "$wt"
done
```

---

## Per-Worktree Fix Details

### Worktree 1: `fix/security-connection-test` — Issues #31 + #32

**Priority: Start first.** SSRF is critical.

**Issue #31 — SSRF via LLM connection test:**

- Block loopback (`127.0.0.0/8`), link-local (`169.254.0.0/16`, `fe80::/10`), RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud metadata (`169.254.169.254`).
- Resolve hostname before making the outbound request; validate the resolved IP.
- Apply to both `POST /api/users/me/resources/connections/test` and `POST /api/admin/openai/connections/test`.
- Files: `src/routers/users.js`, `src/routers/admin.js`, shared validation helper (new `src/shared/ssrf-guard.js` or inline).

**Issue #32 — Error body leaks API key fragments:**

- Replace upstream error text with a generic client-facing message (e.g. "Connection test failed. Check your API key and base URL.").
- Log the full provider error server-side with secret redaction.
- Normalize all connection-test failures into a small set of safe error codes.
- Files: `src/routers/users.js`, `src/routers/admin.js` (same files as #31 — confirms batching).

**Test:**

- Add unit tests for the SSRF guard (loopback, RFC1918, metadata IPs rejected).
- Add unit tests that verify error responses contain no upstream error text.

---

### Worktree 2: `fix/auth-backend` — Issues #24 + #27 + #28

**Issue #24 — JWT_SECRET too short → 500 crash:**

- Fail fast at startup or on first use: if `JWT_SECRET` < 32 bytes, throw a clear error message naming the secret and the required length.
- File: `src/shared/jwt-secret.js`, `src/routers/auth.js`.

**Issue #27 — GET /api/auth/me is missing:**

- Add `GET /api/auth/me` handler that returns the authenticated user profile.
- File: `src/routers/auth.js`.

**Issue #28 — Auth routes return 404 instead of 405:**

- Add method-not-allowed handling for auth routes that exist but don't accept the request method.
- File: `src/routers/auth.js`.

**Merge order within worktree (to reduce intermediate conflicts):**

1. #28 first (structural router change — method handling)
2. #27 next (new route, clean addition)
3. #24 last (JWT validation, touches different helper file)

**Test:**

- Regression test for short JWT_SECRET error message.
- Test for `GET /api/auth/me` returning user profile.
- Test for `GET /api/auth/login` returning 405.

---

### Worktree 3: `fix/auth-frontend` — Issues #23 + #29 + #30

**Issue #23 — Auth form GET fallback leaks credentials:**

- Change the `<form>` method to `POST` explicitly, or add `action="javascript:void(0)"` / remove the action attribute and rely on JS fetch.
- If JS is unavailable, the form must not submit credentials via GET — consider rendering a `<noscript>` message instead, or using a POST action that server-side rejects gracefully.
- Files: `public/auth.html`, `public/js/bootstrap/auth.js`.

**Issue #29 — Auth page missing Inter font:**

- Add the Inter font `<link>` and `body { font-family: "Inter", "Archivo", sans-serif; }` to `public/auth.html`, matching `public/index.html`.
- File: `public/auth.html`.

**Issue #30 — Auth modals ignore Escape key:**

- Add a `keydown` listener for `Escape` that closes the forgot-password and reset-password modals.
- File: `public/js/bootstrap/auth.js`.

**Merge order within worktree:**

1. #29 first (isolated HTML change — font link)
2. #30 next (JS addition — Escape handler)
3. #23 last (form behavior change — most invasive)

**Test:**

- Manual QA for Escape key on both modals.
- Manual QA for Inter font rendering on `/auth`.
- Unit test or manual QA for form not submitting via GET with JS disabled.

---

### Worktree 4: `fix/deps` — Issues #25 + #26

**Issue #25 — Update postcss:**

- `npm audit fix` or `npm update postcss` to a version satisfying the open advisory.
- Verify `npm run build:css` still produces identical output.

**Issue #26 — Update fast-uri:**

- `npm audit fix` or `npm update fast-uri` to a version satisfying both high-severity advisories.

**Both in one `npm audit fix` pass, likely.**

**Test:**

- `npm run build:css` output matches before/after.
- `npm test` passes.
- Verify Dependabot alerts close after merge.

---

## Merge Workflow

### When a worktree is ready to merge

```
1. Push from the worktree
   cd .worktrees/fix/deps
   git push -u origin fix/deps

2. Create PR (auto-close issues on merge)
   gh pr create --title "fix: update fast-uri and postcss (Dependabot)" \
     --body "Closes #25, Closes #26" --repo tan-yong-sheng/GrowChat

3. After review + merge to main → clean up
   cd /mnt/data/Coding/GrowChat
   git worktree remove .worktrees/fix/deps
   git branch -d fix/deps
   git fetch --prune
```

### When a worktree finishes AFTER another has already merged

**Every remaining worktree must rebase onto fresh main before pushing:**

```bash
cd .worktrees/fix/auth-backend
git fetch origin
git rebase origin/main      # picks up whatever just merged
# resolve any conflicts (unlikely across groups, but possible)
git rebase --continue
git push --force-with-lease  # safe force-push after rebase
gh pr create --title "fix: auth backend — JWT crash, /me endpoint, 405 handling" \
  --body "Closes #24, Closes #27, Closes #28" --repo tan-yong-sheng/GrowChat
```

### Rebase all remaining worktrees after any merge

```bash
# Run from the main worktree
for wt in .worktrees/fix/*/; do
  branch=$(git -C "$wt" branch --show-current)
  echo "Rebasing $branch onto origin/main..."
  git -C "$wt" fetch origin
  git -C "$wt" rebase origin/main || echo "⚠️  CONFLICT in $wt — resolve manually"
done
```

### Cleanup after all merges

```bash
# Remove all worktrees
for wt in .worktrees/fix/*/; do
  git worktree remove "$wt"
done

# Prune stale refs
git worktree prune
git fetch --prune

# Verify clean
git worktree list
```

---

## Rules

1. **One PR per worktree.** Each worktree → one PR → one merge. Don't split.
2. **Rebase, don't merge.** `git rebase origin/main` keeps linear history; conflicts are easier to resolve.
3. **Always rebase after a sibling merges.** Never push a stale branch.
4. **`--force-with-lease` only.** Never bare `--force`; `--force-with-lease` is safe and rejects if someone else pushed first.
5. **Close issues from the PR body.** Use `Closes #31` / `Fixes #32` — GitHub auto-closes on merge.
6. **`.worktrees/` is gitignored.** ✅ Already in `.gitignore`; no pollution.
7. **`npm install` per worktree.** Each worktree needs its own `node_modules`.

---

## Suggested Merge Order

Priority-based — merge the most impactful fixes first so they're in production sooner:

| Order | Worktree                       | Issues        | Rationale                                      |
| ----- | ------------------------------ | ------------- | ---------------------------------------------- |
| 1st   | `fix/security-connection-test` | #31, #32      | SSRF is critical; error leak is high severity  |
| 2nd   | `fix/auth-backend`             | #24, #27, #28 | JWT crash is high severity; others are medium  |
| 3rd   | `fix/auth-frontend`            | #23, #29, #30 | Credential leak is high; others are medium/low |
| 4th   | `fix/deps`                     | #25, #26      | Low severity; trivial fix; can go last         |

---

## Pre-existing Stale Worktrees

Two worktrees from previous sessions are prunable:

```
worktrees/agent-a8016dbb  → prunable (gitdir points to non-existent location)
worktrees/short-term      → prunable (gitdir points to non-existent location)
```

**Run `git worktree prune` before creating new worktrees.**
