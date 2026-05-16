# Admin System Routes Design

> **Date:** 2026-04-30
> **Status:** Approved — ready for implementation
> **Decisions:** D1–D5 resolved (see Decision Log below)

## Route Map

```
/admin/system/
├── general        ← app title, registration, default model (existing)
├── email-auth     ← email delivery + authentication (NEW — replaces "security")
├── security       ← operational security: rate limits, token TTLs (NEW)
└── audit          ← activity log viewer with filters + export (FIXED)
```

## Decision Log

| #   | Decision                   | Choice                                                    | Rationale                                                                         |
| --- | -------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D1  | Email + auth tab structure | Single page with section headers                          | Dependency chain visible on one page; avoids over-segmentation for ~5 settings    |
| D2  | Tab count                  | 4 tabs: General, Email & Auth, Security, Audit Logs       | Future-proof; Security tab gives rate limits/TTLs a home even if read-only today  |
| D3  | Audit integration          | Add to `renderSystemLayout()`                             | Fixes dual-source-of-truth bug; consistent left-nav across all system tabs        |
| D4  | Security tab data source   | Build read-only API endpoint `/api/admin/security-config` | Real data from server; API exists when values become DB-configurable later        |
| D5  | Email+auth route URL       | `/admin/system/email-auth`                                | URL matches scope; "email" alone misrepresents the auth settings also on the page |

## Tab Details

### Tab 1: General (`/admin/system/general`)

**Status:** ✅ Exists, minimal changes needed

Current fields:

- App Title (read-only)
- Public Registration toggle
- Registration Status select
- Global Default Model select

No changes required. The module `settings/general.js` and its helpers stay as-is.

---

### Tab 2: Email & Auth (`/admin/system/email-auth`)

**Status:** 🆕 New — replaces current "Security" tab

**Layout:** Single page with two named card-sections inside.

```
┌─────────────────────────────────────────────┐
│  Email & Auth                               │
├─────────────────────────────────────────────┤
│                                             │
│  ── Email Delivery ──────────────────────── │
│                                             │
│  Resend API Key                             │
│  ┌────────────────────────────────────────┐ │
│  │ ••••••••                               │ │
│  └────────────────────────────────────────┘ │
│  An API key is configured. Enter a new key  │
│  to replace it.                             │
│                                             │
│  From Email Address                         │
│  ┌────────────────────────────────────────┐ │
│  │ noreply@example.com (read-only)        │ │
│  └────────────────────────────────────────┘ │
│  Configured via RESEND_FROM_EMAIL env var.  │
│                                             │
│  Send Test Email                            │
│  ┌──────────────────────┐ ┌──────────────┐  │
│  │ test@example.com     │ │  Send Test   │  │
│  └──────────────────────┘ └──────────────┘  │
│                                             │
│  ── Authentication ────────────────────── │
│                                             │
│  Email Verification                        │
│  ┌───────────────────────────────────────┐ │
│  │ Require email verification  [toggle]   │ │
│  └───────────────────────────────────────┘ │
│  New users must verify their email before   │
│  accessing the app. Requires Resend.        │
│                                             │
│  Registration Default                       │
│  ┌───────────────────────────────────────┐ │
│  │ New accounts default to:  [select]      │ │
│  │   • Active — immediate access           │ │
│  │   • Pending — admin approval required   │ │
│  └───────────────────────────────────────┘ │
│  This sets the default status when a new     │
│  user registers.                             │
│                                             │
└─────────────────────────────────────────────┘
```

**New fields (beyond what security.js has today):**

- From Email Address (read-only, from `RESEND_FROM_EMAIL` env or API)
- Email Verification toggle (new backend config key `require_email_verification`)
- Registration Default status (moved conceptually from General — but stays in General for now, referenced here)

**Implementation:**

- Create `settings/email-auth.js` — replaces `settings/security.js`
- Create `settings/email-auth-helpers.js` — state management
- Section headers use `text-base font-medium text-gray-900` with `border-gray-100/30` divider (matching General's section pattern)
- Registration toggle reuses the same toggle component from General

---

### Tab 3: Security (`/admin/system/security`)

**Status:** 🆕 New — operational security reference

```
┌─────────────────────────────────────────────┐
│  Security                                   │
├─────────────────────────────────────────────┤
│                                             │
│  ── Rate Limits ────────────────────────── │
│                                             │
│  Chat messages per minute         30        │
│  Login attempts per 10 min        10        │
│  Registrations per 10 min          5        │
│  File uploads per hour           10        │
│                                             │
│  ℹ Rate limits are configured in deployment │
│    config and cannot be changed here.       │
│                                             │
│  ── Authentication ─────────────────────── │
│                                             │
│  Access Token TTL            15 minutes     │
│  Refresh Token TTL           7 days         │
│                                             │
│  ℹ Token TTLs are configured in deployment  │
│    config and cannot be changed here.       │
│                                             │
│  ── Future ─────────────────────────────── │
│                                             │
│  🔒 Allowed CORS Origins        —         │
│  🔒 Force HTTPS                 —         │
│  🔒 Password Policy             —         │
│                                             │
│  These settings will be configurable in a   │
│  future update.                             │
│                                             │
└─────────────────────────────────────────────┘
```

**Design decisions:**

- All values are **read-only display** (no edit controls)
- Rate limit rows: label left, value right, monospace font for numbers
- "Configured in deployment config" hints use the `text-[10px] text-gray-700` pattern from General
- Future section shows locked items with 🔒 to set expectations
- New API endpoint: `GET /api/admin/security-config` returns `APP_LIMITS` + `APP_TTLS`

**API response shape:**

```json
{
  "rate_limits": {
    "chat_messages_per_minute": 30,
    "login_attempts_per_10min": 10,
    "registrations_per_10min": 5,
    "file_uploads_per_hour": 10
  },
  "token_ttls": {
    "access_token_seconds": 900,
    "refresh_token_seconds": 604800,
    "access_token_display": "15 minutes",
    "refresh_token_display": "7 days"
  }
}
```

---

### Tab 4: Audit Logs (`/admin/system/audit`)

**Status:** 🔧 Fixed — integrated into layout system

**Current problems:**

1. NOT in `renderSystemLayout()` — only added via inline HTML in `admin.js`
2. Uses standalone DOM element creation instead of shared settings shell
3. Filter bar styling doesn't match GrowChat's monochrome design language

**Fix:**

1. Add Audit Logs to `renderSystemLayout()` items array
2. Refactor `audit-logs.js` to render into a container element instead of returning a standalone DOM element
3. Audit content uses the full body area inside the settings shell (not constrained to `max-w-2xl`)

**Audit content rendering approach:**

- The `renderSystemLayout()` shell provides the left nav + body container
- The audit module renders into `#admin-sub-body` just like General and Security
- But the audit content expands to full width (no `max-w-2xl` constraint) since tables need space
- Filter bar redesigned to match GrowChat's pill-button aesthetic

---

## Navigation Config Changes

### `admin-layout.js` — `renderSystemLayout()`

Current items array:

```js
items: [{
  href: '/admin/system/general',
  key: 'general',
  label: 'General',
  ...
}, {
  href: '/admin/system/security',
  key: 'security',
  label: 'Security',  // ← WRONG: shows email content
  ...
}]
```

New items array:

```js
items: [
  {
    href: '/admin/system/general',
    key: 'general',
    label: 'General',
    active: subTab === 'general',
    icon: '...', // gear/person icon (existing)
  },
  {
    href: '/admin/system/email-auth',
    key: 'email-auth',
    label: 'Email & Auth',
    active: subTab === 'email-auth',
    icon: '...', // envelope icon
  },
  {
    href: '/admin/system/security',
    key: 'security',
    label: 'Security',
    active: subTab === 'security',
    icon: '...', // shield icon
  },
  {
    href: '/admin/system/audit',
    key: 'audit',
    label: 'Audit Logs',
    active: subTab === 'audit',
    icon: '...', // clock icon (existing)
  },
];
```

### `admin-route-state.js` — route resolution

Add new routes:

```js
if (pathname === '/admin/system/email-auth' || pathname.startsWith('/admin/system/email-auth/')) {
  return { mainTab: 'system', subTab: 'email-auth', canonicalPath: '/admin/system/email-auth' };
}

if (pathname === '/admin/system/security' || pathname.startsWith('/admin/system/security/')) {
  return { mainTab: 'system', subTab: 'security', canonicalPath: '/admin/system/security' };
}
```

Update redirect for old "security" → "email-auth":

```js
// Old security tab now routes to email-auth (email delivery moved there)
if (pathname === '/admin/settings/email' || pathname.startsWith('/admin/settings/email/')) {
  return { mainTab: 'system', subTab: 'email-auth', canonicalPath: '/admin/system/email-auth' };
}
```

### `admin.js` — subnav rendering + content dispatch

Remove inline HTML for system subnav (lines 278-290). Now handled by `renderSystemLayout()`.

Add content dispatch for new tabs:

```js
if (mainTab === 'system') {
  if (subTab === 'general') {
    systemModules.renderGeneralSettings?.(subContentEl, data);
  } else if (subTab === 'email-auth') {
    systemModules.renderEmailAuthSettings?.(subContentEl, data);
  } else if (subTab === 'security') {
    systemModules.renderSecuritySettings?.(subContentEl, data);
  } else if (subTab === 'audit') {
    // render audit logs
  }
}
```

### `app.js` — redirect updates

Add redirect from old security path:

```js
if (path === '/admin/system/security' || path.startsWith('/admin/system/security/')) {
  window.history.replaceState({}, '', '/admin/system/email-auth');
}
```

Wait — actually `/admin/system/security` now has a DIFFERENT page (the real Security tab with rate limits). So we should NOT redirect. The old "security" content (email config) moves to `/admin/system/email-auth`. Users who bookmarked `/admin/system/security` will see the new Security page (rate limits + TTLs). This is correct behavior.

---

## File Changes Summary

### New files

| File                                                             | Purpose                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| `public/js/features/admin/settings/email-auth.js`                | Email & Auth tab (replaces security.js for email content) |
| `public/js/features/admin/settings/email-auth-helpers.js`        | State management for email-auth                           |
| `public/js/features/admin/settings/security-overview.js`         | Security tab (read-only rate limits + TTLs)               |
| `public/js/features/admin/settings/security-overview-helpers.js` | State management for security overview                    |

### Modified files

| File                                            | Change                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `public/js/features/admin/admin-layout.js`      | Add email-auth, security, audit to `renderSystemLayout()` items                               |
| `public/js/features/admin/admin-route-state.js` | Add email-auth + security routes; update old email redirect                                   |
| `public/js/features/admin/admin.js`             | Remove inline subnav HTML for system; add email-auth + security dispatch; fix audit rendering |
| `public/js/features/admin/audit-logs.js`        | Refactor to render into container (not return standalone DOM)                                 |
| `src/routers/admin.js`                          | Add `GET /api/admin/security-config` endpoint                                                 |

### Retired files

| File                                            | Reason                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `public/js/features/admin/settings/security.js` | Replaced by `email-auth.js` (email content) + `security-overview.js` (real security) |

---

## Implementation Order

1. **Backend first:** Add `GET /api/admin/security-config` endpoint
2. **Layout system:** Update `renderSystemLayout()` with 4-tab nav
3. **Route state:** Add `email-auth` + `security` routes to `admin-route-state.js`
4. **Email & Auth tab:** Create `email-auth.js` + helpers (migrate from `security.js`)
5. **Security tab:** Create `security-overview.js` + helpers (new read-only display)
6. **Audit fix:** Refactor `audit-logs.js` to render inside the shell; remove inline HTML from `admin.js`
7. **Cleanup:** Remove old `security.js`, remove inline subnav HTML from `admin.js`
8. **Test:** Unit tests for new route state, security-config API, and rendering modules

---

## Icons for New Tabs

### Email & Auth

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
  <path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v7A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 13.5 3h-11ZM2 4.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 .5.5v.387l-6 3.2-6-3.2V4.5ZM2 6.013V11.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V6.013l-6 3.2a.5.5 0 0 1-.5 0l-6-3.2Z"/>
</svg>
```

### Security (shield with check)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-5">
  <path fill-rule="evenodd" d="M8 1a.75.75 0 0 1 .75.75v1.258a5.25 5.25 0 1 1-1.5 0V1.75A.75.75 0 0 1 8 1ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Z" clip-rule="evenodd"/>
</svg>
```

(Reuse the existing shield icon from the old Security tab — it still works)

### Audit Logs (clock)

```svg
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
</svg>
```

(Reuse the existing clock icon from the current audit subnav)
