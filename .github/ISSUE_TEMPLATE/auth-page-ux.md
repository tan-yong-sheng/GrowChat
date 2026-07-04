---
name: 'Auth Page UX: Hide Sign up / Forgot Password when no users exist'
about: "Improve the `/auth.html` page — if the app has zero users, it's a fresh install and we should only show the sign-up form; don't show 'Forgot Password'. If public registration is disabled, hide the 'Sign up' toggle."
title: "fix: auth page should show sign-up only when no users, hide 'Forgot Password' and 'Sign up' according to registration state"
labels: ['auth', 'ux']
assignees: ''
---

## Summary

The `/auth.html` page currently shows both **Sign In** and **Sign Up** modes, the **Forgot Password** link, and the **"Don't have an account?"** toggle regardless of whether the system has any registered users yet. This creates confusing UX on a fresh deployment where:

- No one has registered → there's nobody to "sign in" as → **"Forgot Password"** makes no sense (no users = no passwords to forget)
- If the admin has **disabled public registration** → the "Sign up" button shouldn't appear

This issue addresses both conditions via the existing `/api/health` endpoint (which returns `initialized: false` when zero users exist).

## Current Behavior

See [`public/js/bootstrap/auth.js`](https://github.com/nicobailon/GrowChat/blob/main/public/js/bootstrap/auth.js) and [`public/auth.html`](https://github.com/nicobailon/GrowChat/blob/main/public/auth.html).

### When the app has zero users (fresh install)

- `bootstrapAuthMode()` detects `initialized === false` and correctly switches mode to `register`
- But the **"Forgot Password?"** link (`#forgot-password`) and **"Don't have an account?" / "Sign in"** toggle (`#toggle-mode`) are still rendered in the DOM

### When public registration is disabled (after first user)

- The `/api/auth/register` endpoint returns 403 with `error: 'Public registration is disabled'`
- But the frontend still shows the **"Sign up"** / **"Create an account"** toggle text and the name field

## Desired Behavior

### Case A: Fresh install (zero users)

- **Hide** `#forgot-password` button (no users → no passwords to forget)
- **Hide** the "Don't have an account?" / "Sign in" toggle section at the bottom
- **Show only**: Name field + Email + Password + **"Create an account"** / **"Sign up"** form
- **Title**: stays as "Create an account"

### Case B: Public registration disabled + has users

- **Keep** the login form visible
- **Hide** the "Don't have an account?" / "Sign up" toggle text and button
- **Keep** "Forgot Password?" visible (there are users who can forget)
- **Title**: "Sign in to GrowChat"

### Case C: Normal (has users + public registration enabled)

- Current behavior — show both login and registration toggle, forgot password

## Implementation Details

### Step 1 — Extend `/api/health` response

- Currently returns `initialized: boolean` and `ok: boolean`
- Add field `publicRegistrationEnabled: boolean` (read from `app_config` key `public_registration`)
- This lets the frontend know both pieces of state in one call

### Step 2 — Update `bootstrapAuthMode()` in `auth.js`

- Pass the `publicRegistrationEnabled` flag alongside `initialized`
- Use both flags to decide visibility:

| `initialized` | `publicRegistrationEnabled` | Show                                                 |
| ------------- | --------------------------- | ---------------------------------------------------- |
| `false`       | —                           | Sign-up only. Hide forgot password, hide toggle text |
| `true`        | `true`                      | Full both-login-and-register mode                    |
| `true`        | `false`                     | Login only. Hide sign-up toggle                      |

- **Add visibility toggles**:
  - `#forgot-password`: `.hidden` when `initialized === false`
  - `#toggle-text` / `#toggle-mode`: `.hidden` when `initialized === false` (no users → no "Don't have an account?")

### Step 3 — Conditional on registration disabled

- `#name-wrap`: Only show when registering
- `#toggle-text` / `#toggle-mode`: Only show when `publicRegistrationEnabled === true`
- `toggleModeBtn`: Hide entirely when `publicRegistrationEnabled === false`

## Related Files

- `public/auth.html` — static HTML template
- `public/js/bootstrap/auth.js` — client-side state machine
- `src/routers/public.js` — `/api/health` endpoint (already has `initialized` flag)
- `src/routers/auth-register.js` — checks `public_registration` before allowing registration

## Relevant Docs

- [`docs/ui-ux/states/auth.states.md`](https://github.com/nicobailon/GrowChat/blob/main/docs/ui-ux/states/auth.states.md) — current auth state machine
- [`docs/backend/AUTH_FLOW.md`](https://github.com/nicobailon/GrowChat/blob/main/docs/backend/AUTH_FLOW.md) — registration flow, first-user-as-admin pattern

## Design Considerations

- **Single-action page**: When `initialized === false`, the auth page should feel like a sign-up-only page. No "toggle" mode, no "Forgot Password" — just "Create your account".
- **Accessibility**: The `#forgot-password` button should have proper `aria-hidden` when hidden. The `#toggle-mode` button should not be focusable when hidden (add `tabindex="-1"` or remove from DOM).
- **First-user race condition**: Two concurrent requests may both see `initialized === false`. The backend handles this with `first_admin_claimed` sentinel. The frontend should handle the 409 "Retry" response gracefully.
- **Responsiveness**: `min-h-[44px]` buttons should remain for touch targets when visible.
