# Auth APIs

_Related UI Flow:_ [Authentication User Flow](../../ui-ux/user-flows/00-authentication.md)

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

_Note: If account requires approval, returns 201 with `account_status: 'pending'` and omits tokens._

### Dependencies / Internal Calls

- `userRepository.findByEmail`
- `userRepository.create`
- `auth.hashPassword`
- `session.createRefreshToken`
- `auth.signJWT`
- DB writes to `user_roles` (via `ensureUserRoleBinding`)

### Side Effects

- Creates a `users` record with `account_status`, `primary_role`.
- Syncs `users.primary_role` column with the `user_roles` table (ensures consistency for admin first-user path).
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
- **Security Action (issue #146)**: Bumps the per-user `session-version` counter in the `SESSIONS` KV namespace so any stolen clones of the refresh token (still in flight elsewhere) are rejected by `consumeRefreshToken` on their next use.

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
- **Security Action**: Invalidates all existing refresh tokens by bumping the per-user `session-version` counter in the `SESSIONS` KV namespace, causing `consumeRefreshToken` to reject any previously issued refresh tokens on their next use.

---

## `POST /api/auth/change-password`

**Responsibility**: Changes the current user's password while authenticated. Requires an active session and a valid user record.

### Request

- `currentPassword` (string, required)
- `newPassword` (string, required, min 8 chars)
- `confirmNewPassword` (string, required, must match `newPassword`)

### Response (200 OK)

- `message` (string): `"Password changed successfully"`

### Errors

- `400 Bad Request`: Invalid JSON body, missing field, or `confirmNewPassword` does not match `newPassword`.
- `400 Bad Request`: `newPassword` shorter than 8 characters.
- `401 Unauthorized`: `currentPassword` is incorrect.
- `404 Not Found`: Authenticated user not found in the database.
- `429 Too Many Requests`: Rate limit exceeded (5 requests per hour per IP).

### Dependencies / Internal Calls

- `requireString` from `src/validation/request.js`
- `verifyPassword` / `hashPassword` from `src/shared/auth.js`
- `checkRateLimit` / `resolveRateLimitSubject` from `src/services/rate-limit.js`
- `bumpSessionVersion` from `src/shared/session.js`
- `error` / `json` from `src/utils/response.js`
- `createLogger` from `src/utils/logger.js`

### Side Effects

- Updates `users.password_hash` in the database.
- **Security Action**: Bumps the per-user `session-version` in the `SESSIONS` KV namespace **before** the password write, so any concurrently held refresh tokens are rejected on their next use by `consumeRefreshToken`.
- Rate-limited via `checkRateLimit` with the `auth-change-password` action key.
