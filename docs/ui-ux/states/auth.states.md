# Authentication UI States

This document maps the explicit state machines for elements within the `/auth.html` page to assist in finding unhandled exceptions and visual bugs.

## 0. Google Sign-In Button (`#google-oauth-wrap`)

**Purpose**: Allows users to sign in via Google OAuth 2.0.

### Valid States:

- `Hidden`: The `#google-oauth-wrap` div has class `.hidden`. Occurs when `GOOGLE_CLIENT_ID` is not configured (health endpoint `google_oauth: false`).
- `Visible_Idle`: The "Sign in with Google" button is shown above the email/password form with an "or" divider. Button is clickable, white background with Google 'G' icon.
- `Redirecting`: User has clicked the button. Browser navigates to Google consent screen. No local loading state — this is a top-level navigation.

### State Transitions:

- `Hidden` → `Visible_Idle` (On page load if `google_oauth: true` in health response)
- `Visible_Idle` → `Redirecting` (On click → `window.location.href = '/api/auth/google'`)
- `Redirecting` → `Visible_Idle` (On return from Google callback with error → `handleOAuthError` displays message)

### Error States (OAuth Callback):

- `OAuth_Error`: Error message displayed in `#auth-error` container. Triggered by `?oauth_error=X` query param on return from Google callback.
  - `access_denied`: "Sign in with Google was cancelled."
  - `invalid_state`: "Security check failed. Please try again."
  - `rate_limited`: "Too many attempts. Please wait and try again."
  - `exchange_failed`: "Could not connect to Google. Please try again."
  - `missing_info`: "Google account is missing required information."
  - `pending_account`: "Your account is pending admin approval."

---

## 1. Primary Submit Button (`#auth-submit`)

**Purpose**: Handles both Login and Registration submission.

### Valid States:

- `Disabled_Empty`: User has not touched inputs. Opacity is high, pointer is default, HTML `disabled` attribute is `true`.
- `Disabled_Invalid`: Inputs touched but invalid (e.g. password < 8 chars). Visually dimmed (`opacity-60`), `cursor-not-allowed`.
- `Ready`: Inputs valid. Hover states active.
- `Submitting`: Clicked. Text changes to "Signing in…" / "Signing up…". Button `disabled` is `true`. Visually dimmed (`opacity-60`).

### State Transitions (The Bug Hunter):

- `Ready` → `Submitting` (On Click)
- `Submitting` → `Ready` (On API Error - e.g. 401 Unauthorized. **Bug check**: Does the button text revert exactly to what it was?)
- `Submitting` → `Unmounted` (On 200 OK - Redirects to `/`)

## 2. API Error Message Container (`#auth-error`)

**Purpose**: Inline feedback mechanism below the auth form.

### Valid States:

- `Hidden`: `display: none` or `.hidden` utility class applied.
- `Visible_Error`: Text color is red (`text-red-600`).
- `Visible_Success`: Text color is green (`text-green-600`). (Used specifically for "Pending Admin Approval" during registration).

### State Transitions:

- `Hidden` → `Visible_Error` (API 400/401/500)
- `Visible_Error` → `Hidden` (User begins typing in _any_ input field again. **Bug check**: If user fails login, does the error message disappear the moment they try to correct their password?)

## 3. Forgot Password Modal (`#forgot-password-modal`)

**Purpose**: Overlay to capture email for reset.

### Valid States:

- `Unmounted / Hidden`: Fixed overlay with `display: none`.
- `Open_Idle`: Input focused, Submit button enabled.
- `Open_Submitting`: Button disabled, waiting on API.
- `Open_Success`: Input/Button disappear, green success text shows.
- `Open_Error`: Red error text visible below button.

### State Transitions:

- `Open_Success` → `Hidden` (Timeout of 2000ms. **Bug Check**: Does the modal automatically clean up its state variables after closing so it's fresh if opened again?)
