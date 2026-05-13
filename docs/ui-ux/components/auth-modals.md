# Authentication Modals

## Used In
- `public/auth.html`

## Modal Variants

### 1. `forgot-password-modal`
- **Purpose**: Capture email address to initiate password reset flow.
- **Triggers**:
  - `button_click` on `#forgot-password` (Forgot password? link)
- **Dependencies**:
  - Requires backend endpoint `POST /api/auth/forgot-password`

### 2. `reset-password-modal`
- **Purpose**: Capture new password and confirm password from user returning via email link.
- **Triggers**:
  - `auto_open` (Edge case): Triggers automatically on page load *only if* the URL contains `?token=...`.
- **Dependencies**:
  - Requires backend endpoint `POST /api/auth/reset-password`
  - Requires valid JWT token in URL query parameter.

## Shared Interaction Rules (Modals)
- **Backdrop**: Both use a fixed inset container with `bg-black bg-opacity-50` and `z-50`.
- **Dismissal**:
  - Click on the explicit `#modal-close` cancel button.
  - Click on the backdrop (outside the inner `.bg-white` container).
- **Focus Management**:
  - Opening the modal automatically calls `.focus()` on the primary input field.
  - *Bug Check*: Ensure keyboard tabbing does not escape the modal container.
