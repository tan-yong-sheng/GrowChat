# User Account States

This explicit state machine maps the lifecycle of a user account from creation to access.

## Valid States
- `pending`: Account created but requires admin approval (e.g., if `public_registration_status` is configured to pending). User cannot log in.
- `active`: Account is fully operational. User can issue sessions.

## Implicit Transitions (The State Machine)
- `null` → `active` (First user registration on a fresh instance automatically bypasses pending state and is granted the `admin` role).
- `null` → `pending` (Subsequent user registrations if `public_registration_status` is pending).
- `pending` → `active` (Admin action via UI/API).

## Security Guardrails
- If a user in `active` state has an active session, but an admin downgrades their status to `pending`, the `resolveAuthUser` middleware and `POST /api/auth/refresh` endpoint will intercept the subsequent requests and throw a 403 Forbidden, effectively severing their access without needing to eagerly clear all refresh tokens.
