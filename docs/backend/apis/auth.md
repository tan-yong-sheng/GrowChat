# Auth APIs

_Related UI Flow:_ [Authentication User Flow](../../ui-ux/user-flows/00-authentication.md)

## `GET /api/auth/google`

**Responsibility**: Redirects the user to Google's OAuth 2.0 consent screen. Generates a CSRF-protected `state` parameter stored in KV.

### Prerequisites

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be configured as wrangler secrets.
- If either is missing, returns `503 Service Unavailable`.

### Request

- No body required. This is a browser redirect (top-level navigation).

### Response (302 Found)

- Redirects to `https://accounts.google.com/o/oauth2/v2/auth` with query parameters:
  - `client_id`
  - `redirect_uri` → `GET /api/auth/google/callback`
  - `response_type=code`
  - `scope=openid email profile`
  - `state` → cryptographically random UUID stored in KV
  - `access_type=offline`
  - `prompt=consent`

### Side Effects

- Generates a random state token via `crypto.randomUUID()`.
- Stores state in SESSIONS KV with key `oauth-state:{state}`, TTL 10 minutes.
- Rate-limited under `auth-google` action.
- Logs security event on 503 (not configured).

---

## `GET /api/auth/google/callback`

**Responsibility**: Handles the OAuth callback from Google. Exchanges the authorization code for tokens and user info, then creates/links the user account and issues JWT + refresh token.

### Request (from Google redirect)

- `code` (string, required) — Authorization code from Google.
- `state` (string, required) — CSRF state parameter.
- `error` (string, optional) — Error from Google (e.g., `access_denied`).

### Success Response (302 Found)

Redirects to `/auth.html` with tokens in URL hash fragment:

- `#access_token={jwt}`
- `&refresh_token={opaque}`
- `&expires_in=900`

Hash fragments are NOT sent to the server, keeping tokens secure.

### Error Responses (302 Redirects)

- `?oauth_error=access_denied` — User denied consent on Google's consent screen.
- `?oauth_error=invalid_state` — CSRF state parameter missing, expired, or already consumed.
- `?oauth_error=pending_account` — Google-linked account exists but has `pending` status.
- `?oauth_error=exchange_failed` — Token exchange with Google failed.
- `?oauth_error=missing_info` — Google user info missing email or sub.
- `?oauth_error=rate_limited` — Rate limit exceeded on callback.

### Account Resolution Logic

1. **Find by `google_id`**: If a user with `google_id = sub` exists → log in directly.
2. **Email match**: If no google_id match but a user with the same email exists → link accounts by setting `google_id` on the existing user.
3. **Auto-provision**: If no match at all → create new account with:
   - `email` from Google profile
   - `name` from Google profile
   - `password_hash` = `'oauth:no-password'` (sentinel, not a valid hash)
   - `google_id` = Google `sub` ID
   - `account_status` = `'active'` (email verified by Google)
   - `primary_role` = `'member'` (or `'admin'` if first user)

### Dependencies / Internal Calls

- `env.SESSIONS.get/delete` — Validate and consume CSRF state
- `fetch()` to `oauth2.googleapis.com/token` — Exchange code for tokens
- `fetch()` to `www.googleapis.com/oauth2/v3/userinfo` — Get user profile
- `userRepository.findByGoogleId`
- `userRepository.findByEmail`
- `userRepository.create`
- `userRepository.updateGoogleId`
- `auth.signJWT` — Issue access token
- `session.createRefreshToken` — Issue refresh token
- `logSecurityEvent` — Log login success/failure

### Side Effects

- Consumes (deletes) the OAuth state from KV (one-time use).
- May create a new `users` record (auto-provisioning).
- May update `google_id` on an existing `users` record (email matching).
- Creates a `refresh_tokens` record.
- Creates a `user_roles` record (via `ensureUserRoleBinding`).
- Logs `login_success` or `login_failure` security events.

---

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

## Google OAuth 2.0 Configuration

| Config Key             | Type            | Purpose                                         |
| ---------------------- | --------------- | ----------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | wrangler secret | Google OAuth client ID (required for OAuth)     |
| `GOOGLE_CLIENT_SECRET` | wrangler secret | Google OAuth client secret (required for OAuth) |

Set via `wrangler secret put GOOGLE_CLIENT_ID` and `wrangler secret put GOOGLE_CLIENT_SECRET`.

When these secrets are not configured, the Google OAuth routes return `503`, and the "Sign in with Google" button is hidden on the auth page.

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
