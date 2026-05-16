# Admin System Pages Redesign & Gap Analysis

> **Date:** 2026-04-30
> **Status:** Design phase — needs validation before implementation

## Current State Audit

### `/admin/system/general` — ✅ Exists, mostly complete

- App Title (read-only)
- Public Registration toggle
- Registration Status select (active/pending)
- Global Default Model select
- **Missing:** App name editing, timezone/locale, attachment limits display

### `/admin/system/security` — ⚠️ Incomplete, mislabeled

- Currently labeled "Email" in the subnav (should be "Security")
- Only has Resend API Key + Send Test Email
- **Missing:** All actual security settings (see below)

### `/admin/system/audit` — ⚠️ Exists but disconnected from layout system

- Audit logs table with filter/pagination/export works
- NOT included in `renderSystemLayout()` in `admin-layout.js` — only added via inline HTML in `admin.js`
- **Missing:** Date range filter, log detail drawer, severity levels, real-time indicator

## Gap Analysis: What Backend Supports vs What UI Surfaces

### Config keys in DB with no UI control:

| Config Key                   | Backend                                       | UI Surface                                |
| ---------------------------- | --------------------------------------------- | ----------------------------------------- |
| `resend_api_key`             | ✅ GET/PUT `/api/admin/email-config`          | ⚠️ Under "Security" tab (wrong placement) |
| `public_registration`        | ✅ GET/PUT `/api/admin/config`                | ✅ General tab                            |
| `public_registration_status` | ✅ GET/PUT `/api/admin/config`                | ✅ General tab                            |
| `default_model_id`           | ✅ GET/PUT `/api/admin/config`                | ✅ General tab                            |
| `openai_connections`         | ✅ GET/PUT `/api/admin/openai/connections`    | ✅ Settings > Connections                 |
| `openai_enabled`             | ✅ (read in connections endpoint)             | ✅ Settings > Connections                 |
| `tool_servers`               | ✅ GET/PUT `/api/admin/tool-servers`          | ✅ Settings > Integrations                |
| `MODEL_ATTACHMENT_CAPS_KEY`  | ✅ GET/PUT `/api/admin/model-attachment-caps` | ✅ Settings > Models                      |

### Backend features with NO admin UI:

| Feature                   | Backend Location                   | UI Gap                                                         |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| Email verification flow   | `email-verification.js`            | No toggle to enable/disable, no "Require verification" setting |
| Rate limiting config      | `rate-limit.js` + `APP_LIMITS`     | No UI to view/adjust limits                                    |
| Session TTL config        | `APP_TTLS` (hardcoded 15min/7day)  | No UI to adjust token TTLs                                     |
| Audit log retention       | No purge/cleanup logic             | No retention policy UI                                         |
| CORS origins              | `cors.js` middleware               | No UI to manage allowed origins                                |
| Password reset flow       | `password-reset.js`                | Works but no admin control panel                               |
| Account status management | `auth.js` active/pending/suspended | Only via Users page, no batch operations                       |

## Recommended `/admin/system/` Redesign

### New Tab Structure

```
/admin/system/
├── General        ← app name, registration, default model
├── Email          ← Resend API key, test email, email verification toggle
├── Security       ← rate limits, session TTL, CORS origins
└── Audit Logs     ← activity log viewer with filters + export
```

**Key change:** Split "Security" into two tabs — "Email" (email delivery config) and "Security" (actual security controls). This matches industry patterns where email/SMTP is its own config area.

### Tab 1: General (minor additions)

```
General Settings
├── App Title              (read-only, from deployment config)
├── Public Registration    (toggle + status select) — existing
├── Default Model          (select) — existing
└── [NEW] App URL          (read-only, from deployment config)
```

Minimal change. The existing general.js is fine. Just rename the subnav label from the generic icon to a gear icon.

### Tab 2: Email (relocate from "Security")

```
Email Configuration
├── Resend API Key         (masked input + save) — existing
├── Send Test Email        (input + button) — existing
├── From Email Address     (read-only, from env RESEND_FROM_EMAIL)
├── [NEW] Email Verification Toggle  (require email verification on signup)
└── [NEW] Verification Email Preview (link to test the verification email)
```

**Why separate:** Every SaaS admin panel treats SMTP/email config as its own section. Mixing it with "Security" hides it from the admin who just wants to fix email delivery.

### Tab 3: Security (new — actual security controls)

```
Security Settings
├── Rate Limits
│   ├── Chat messages per minute   (display: 30)
│   ├── Login attempts per 10 min  (display: 10)
│   ├── Registration per 10 min    (display: 5)
│   └── File uploads per hour      (display: 10)
│   └── Note: "Rate limits are configured in deployment config"
├── Authentication
│   ├── Access Token TTL    (display: 15 minutes)
│   ├── Refresh Token TTL   (display: 7 days)
│   └── Note: "Token TTLs are configured in deployment config"
├── [FUTURE] Allowed CORS Origins  (comma-separated list)
├── [FUTURE] Force HTTPS toggle
└── [FUTURE] Password Policy (min length, complexity)
```

**Design decision:** For now, rate limits and TTLs are **read-only displays** since they're hardcoded in `APP_LIMITS` / `APP_TTLS`. Showing them gives admins visibility even without edit capability. Mark with "(configured in deployment)" hints. Future: make them DB-configurable.

### Tab 4: Audit Logs (fix layout integration)

```
Audit Logs
├── Filter bar (user, action type) — existing
├── [NEW] Date range filter (from/to)
├── Table with columns — existing
├── [NEW] Row click → detail drawer (full details JSON)
├── Pagination — existing
├── Export CSV — existing
└── [FUTURE] Retention policy (auto-purge after N days)
```

**Fix:** Add audit tab to `renderSystemLayout()` in `admin-layout.js` so it's part of the layout system, not injected ad-hoc.

## Layout System Fix (Critical)

### Problem

`renderSystemLayout()` in `admin-layout.js` only builds General + Security nav items.
Audit Logs tab is injected via inline HTML in `admin.js` `renderSubContent()`.
This creates a **dual-source-of-truth** bug: first render uses layout (no audit tab), re-render uses inline HTML (has audit tab).

### Fix

Add Audit Logs to `renderSystemLayout()` items array, and remove the duplicate inline HTML from `admin.js`.

## Subnav Label Fix

Current: Security tab shows label "Email" in the subnav (line 286 of admin.js).
This is confusing — the tab URL is `/admin/system/security` but the label says "Email".

**Fix:** Either:

- A) Rename the tab to "Email" and create a new "Security" tab for actual security controls (recommended)
- B) Keep "Security" label and add email config under it as a section

Option A is recommended — it matches how every major SaaS platform organizes admin settings.

## Implementation Order

1. **Fix layout system** — add Audit Logs to `renderSystemLayout()`, remove duplicate inline HTML
2. **Rename "Security" → "Email"** — update subnav label to match content
3. **Create new "Security" tab** — read-only display of rate limits + token TTLs
4. **Enhance Audit Logs** — date range filter, detail drawer on row click
5. **Add email verification toggle** — to Email tab (requires backend `require_email_verification` config key)

## Research References

- **OpenIAM**: System tab has audit batch size, crypto algorithm, email regex, provisioning toggle
- **Paymenter**: Separate tabs for General, Security (captcha/proxy/session), Mail (SMTP), Social Login
- **rConfig**: Organized by functional area — System Management, Security & Access, Data Management, Monitoring
- **osTicket**: System settings include helpdesk URL, HTTPS forcing, log level, log purge, ACL
- **FortiSOAR**: Audit Log is a dedicated page under Settings, with date filters and chronological display
- **Veld Systems**: "Every admin action must be logged with who did it, when, what changed, and why. Non-negotiable."
