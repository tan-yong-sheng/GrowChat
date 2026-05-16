# Admin UI Fixes — Scrollbar, Default Model, Email Delivery

**Date:** 2026-04-30
**Status:** Approved

## Problem Statement

Three issues across `/admin/**` pages:

1. **Missing scrollbar** — admin content areas use `scrollbar-hidden`, making scrollable content undiscoverable
2. **Default Model selector** — misplaced on Models page, adds config complexity for minimal value
3. **Email Delivery page** — hardcoded to Resend, needs multi-provider support (API-based only — Workers can't do SMTP)

## Design

### 1. Scrollbar Fix

Replace `scrollbar-hidden` with auto-hiding thin scrollbar on all admin main content scroll containers.

**Approach:** Custom CSS utility `.scrollbar-thin-auto` that:

- Shows a 4px thin scrollbar thumb on hover/scroll
- Hides when idle (transparent by default)
- Cross-browser: `-webkit-scrollbar` + `scrollbar-width: thin` + `scrollbar-color`

**Affected files:** `admin-layout.js`, `email-delivery.js`, `registration.js`, `security-overview.js`, `policies.js`, `connections.js`, and any admin page with `scrollbar-hidden` on the main scroll container.

**Note:** Small scrollable regions (member lists, modals) can keep `scrollbar-hidden` — the fix targets only the primary page content area.

### 2. Default Model Selector — Remove

- Delete `loadDefaultModel()`/`saveDefaultModel()` from `models.js`
- Delete `defaultModelId` from `modelsState`
- Delete the `<select id="default-model-select">` HTML and SVG chevron
- Delete the `default-model-select` event binding in `bindDelegatedEvents`
- App behavior: uses first enabled model (existing fallback, unchanged)
- Backend cleanup: separate task (remove `default_model_id` from config endpoint)

### 3. Email Delivery Page Redesign

**New layout:**

1. **Provider selector** — dropdown: Resend / SendGrid / Mailgun
2. **From Email** — editable text input, shared across all providers
3. **Provider config** — shown based on selected provider:
   - Resend: API Key
   - SendGrid: API Key
   - Mailgun: API Key + Domain
4. **Send Test Email** — email input + send button

**Data model (stored in `/api/admin/config`):**

- `email_provider`: `"resend"` | `"sendgrid"` | `"mailgun"`
- `email_api_key`: string (for the active provider)
- `email_from`: string (shared from address, editable)

**Migration:** Existing `resend_api_key` → `email_api_key`, existing `RESEND_FROM_EMAIL` env var → `email_from` default.

**Backend changes needed (separate task):**

- `/api/admin/config` accepts `email_provider`, `email_api_key`, `email_from`
- Email sending logic routes through selected provider
- SendGrid: `POST https://api.sendgrid.com/v3/mail/send`
- Mailgun: `POST https://api.mailgun.net/v3/{domain}/messages`

**Scope for this task:** Frontend UI only. Backend multi-provider routing is a follow-up.
