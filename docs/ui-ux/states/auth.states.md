# Authentication UI States

This document maps the explicit state machines for elements within the `/auth.html` page to assist in finding unhandled exceptions and visual bugs.

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
- `Visible_Error` → `Hidden` (User begins typing in *any* input field again. **Bug check**: If user fails login, does the error message disappear the moment they try to correct their password?)

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
