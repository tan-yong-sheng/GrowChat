# Auth APIs

*Related UI Flow:* [Authentication User Flow](../../ui-ux/user-flows/00-authentication.md)

## `POST /api/auth/register`
**Responsibility**: Creates a new user account and initializes their primary role. The first user created becomes the `admin` and disables public registration. Subsequent users become `member` or `pending`.

### Request
- `email` (string, required)
- `name` (string, required)
- `password` (string, required, min 8 chars)

### Response (201 Created)
- `user` (object: sanitized user data)
- `access_token` (string)
- `refresh_token` (string)
- `expires_in` (number: 900)
- `refresh_expires_at` (number: timestamp)

*Note: If account requires approval, returns 201 with `account_status: 'pending'` and omits tokens.*

### Dependencies / Internal Calls
- `userRepository.findByEmail`
- `userRepository.create`
- `auth.hashPassword`
- `session.createRefreshToken`
- `auth.signJWT`
- DB writes to `user_roles` (via `ensureUserRoleBinding`)

### Side Effects
- Creates a `users` record.
- Creates a `refresh_tokens` record.
- Creates a `user_roles` record.

---

## `POST /api/auth/login`
**Responsibility**: Authenticates an existing user and issues session tokens.

### Request
- `email` (string, required)
- `password` (string, required)

### Response (200 OK)
- `user` (object)
- `access_token` (string)
- `refresh_token` (string)
- `expires_in` (number: 900)
- `refresh_expires_at` (number: timestamp)

### Errors
- `401 Unauthorized`: Invalid credentials.
- `403 Forbidden`: Account pending approval (`error: 'pending_account'`).
- `429 Too Many Requests`: Rate limit exceeded.

### Side Effects
- Updates `last_active_at` on the `users` record via `users.touchLastActive(user.id)`.
- Issues new `refresh_tokens` record.

---

## `POST /api/auth/refresh`
**Responsibility**: Issues a fresh access token using a valid refresh token.

### Request
- `refresh_token` (string, required)

### Response (200 OK)
- identical to `/api/auth/login` success.

### Side Effects
- Consumes (deletes/invalidates) the old refresh token via `consumeRefreshToken`.
- Updates `last_active_at` on the `users` record.
- Issues new `refresh_tokens` record.

---

## `POST /api/auth/logout`
**Responsibility**: Revokes the user's current refresh token to destroy the persistent session.

### Request
- `refresh_token` (string, optional)

### Side Effects
- Deletes the specific token from `refresh_tokens` via `revokeRefreshToken`.

---

## `POST /api/auth/forgot-password`
**Responsibility**: Generates a secure, time-limited token and sends a password reset email.

### Request
- `email` (string, required)

### Side Effects
- Creates a record in `password_reset_tokens` (hashed token, 1 hour TTL).
- Triggers `emailService.send()` to deliver the HTML reset email.

---

## `POST /api/auth/reset-password`
**Responsibility**: Validates a reset token and updates the user's password.

### Request
- `token` (string, required)
- `password` (string, required, min 8 chars)

### Side Effects
- Updates `password_hash` in `users`.
- Deletes the used token from `password_reset_tokens`.
- **Security Action**: Deletes ALL active sessions for the user (`DELETE FROM refresh_tokens WHERE user_id = ?`) to force re-authentication everywhere.
