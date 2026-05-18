# GrowChat Authentication - Quick Reference

## Endpoints

| Method | Path                        | Auth   | Purpose                 |
| ------ | --------------------------- | ------ | ----------------------- |
| POST   | `/api/auth/register`        | None   | Create account          |
| POST   | `/api/auth/login`           | None   | Sign in                 |
| POST   | `/api/auth/refresh`         | None   | Get new access token    |
| POST   | `/api/auth/logout`          | Bearer | Sign out                |
| POST   | `/api/auth/forgot-password` | None   | Request password reset  |
| POST   | `/api/auth/reset-password`  | None   | Complete password reset |

---

## Request/Response Examples

### Register

**Request:**

```json
POST /api/auth/register
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "SecurePassword123"
}
```

**Response (Active - First User):**

```json
201 Created
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "account_status": "active",
    "primary_role": "admin",
    "settings": {},
    "created_at": 1234567890,
    "last_active_at": 1234567890,
    "updated_at": 1234567890
  },
  "access_token": "eyJhbGc...",
  "refresh_token": "base64url...",
  "expires_in": 900,
  "refresh_expires_at": 1234574890
}
```

**Response (Pending - Subsequent User):**

```json
201 Created
{
  "user": { ... },
  "account_status": "pending",
  "status": "pending",
  "message": "Account pending approval."
}
```

---

### Login

**Request:**

```json
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response (Success):**

```json
200 OK
{
  "user": { ... },
  "access_token": "eyJhbGc...",
  "refresh_token": "base64url...",
  "expires_in": 900,
  "refresh_expires_at": 1234574890
}
```

**Response (Pending Account):**

```json
403 Forbidden
{
  "error": "pending_account",
  "message": "Account pending approval."
}
```

---

### Refresh Token

**Request:**

```json
POST /api/auth/refresh
{
  "refresh_token": "base64url..."
}
```

**Response:**

```json
200 OK
{
  "user": { ... },
  "access_token": "eyJhbGc...",
  "refresh_token": "base64url...",
  "expires_in": 900,
  "refresh_expires_at": 1234574890
}
```

---

### Logout

**Request:**

```json
POST /api/auth/logout
Authorization: Bearer eyJhbGc...
{
  "refresh_token": "base64url..."
}
```

**Response:**

```json
200 OK
{
  "ok": true
}
```

---

### Forgot Password

**Request:**

```json
POST /api/auth/forgot-password
{
  "email": "user@example.com"
}
```

**Response (Always Success):**

```json
200 OK
{
  "message": "If an account exists with this email, a reset link has been sent."
}
```

---

### Reset Password

**Request:**

```json
POST /api/auth/reset-password
{
  "token": "plaintext_token_from_email",
  "password": "NewPassword123"
}
```

**Response:**

```json
200 OK
{
  "message": "Password reset successful. Please log in with your new password."
}
```

---

## Frontend API Usage

### Get Auth State

```javascript
import { getAuthState } from './public/js/shared/api/auth.js';

const auth = getAuthState();
// { user, access_token, refresh_token, expires_in, refresh_expires_at }
```

### Set Auth State

```javascript
import { setAuthState } from './public/js/shared/api/auth.js';

setAuthState(data);
// Stores in localStorage under key 'growchat_auth'
```

### Clear Auth State

```javascript
import { clearAuthState } from './public/js/shared/api/auth.js';

clearAuthState();
// Removes from localStorage
```

### Check Token Validity

```javascript
import { isAccessTokenUsable } from './public/js/shared/api/auth.js';

if (isAccessTokenUsable(token)) {
  // Token is valid and not expired
}
```

### Refresh Token

```javascript
import { refreshToken } from './public/js/shared/api/auth.js';

const newAuth = await refreshToken(refreshTokenValue);
// Returns new auth state or null if failed
```

### Make Authenticated Request

```javascript
import { apiFetch } from './public/js/shared/api/request.js';

const response = await apiFetch('/api/chats', {
  method: 'GET',
});
// Automatically handles token refresh on 401/403
```

---

## Backend API Usage

### Verify JWT

```javascript
import { verifyJWT } from '../shared/auth.js';

try {
  const payload = await verifyJWT(token, jwtSecret);
  // { sub, email, primary_role, name, iat, exp }
} catch (err) {
  // Token invalid or expired
}
```

### Hash Password

```javascript
import { hashPassword } from '../shared/auth.js';

const hash = await hashPassword(password);
// Format: pbkdf2:salt:hash
```

### Verify Password

```javascript
import { verifyPassword } from '../shared/auth.js';

const isValid = await verifyPassword(password, storedHash);
// true or false
```

### Create Refresh Token

```javascript
import { createRefreshToken } from '../shared/session.js';

const { token, expiresAt } = await createRefreshToken(env, userId);
// Stores in KV with two-key pattern
```

### Consume Refresh Token

```javascript
import { consumeRefreshToken } from '../shared/session.js';

const session = await consumeRefreshToken(env, token);
// { userId, expiresAt } or null if invalid/expired
```

### Revoke Refresh Token

```javascript
import { revokeRefreshToken } from '../shared/session.js';

await revokeRefreshToken(env, token);
// Deletes both gate and data keys from KV
```

---

## Common Error Codes

| Code | Meaning                                     | Action                             |
| ---- | ------------------------------------------- | ---------------------------------- |
| 400  | Bad request (validation error)              | Check request format               |
| 401  | Unauthorized (invalid credentials or token) | Re-login or refresh token          |
| 403  | Forbidden (account pending or revoked)      | Wait for approval or contact admin |
| 409  | Conflict (email already registered)         | Use different email or login       |
| 429  | Rate limited                                | Wait before retrying               |
| 500  | Server error                                | Check logs, retry later            |

---

## Token Lifetimes

| Token                | TTL        | Renewable                       |
| -------------------- | ---------- | ------------------------------- |
| Access Token (JWT)   | 15 minutes | Yes (via refresh)               |
| Refresh Token        | 7 days     | Yes (new one issued on refresh) |
| Password Reset Token | 1 hour     | No (single-use)                 |
| Client Session ID    | Session    | No (per tab)                    |

---

## Security Checklist

- [ ] JWT_SECRET configured in environment
- [ ] RESEND_API_KEY configured for password reset emails
- [ ] Rate limits enforced on all auth endpoints
- [ ] HTTPS enforced in production
- [ ] Cookies set with Secure + HttpOnly flags (if used)
- [ ] CORS configured correctly
- [ ] Password reset tokens hashed in database
- [ ] Refresh tokens hashed in KV
- [ ] Account status checked on every auth event
- [ ] Role bindings synced on login/refresh
- [ ] Password reset revokes all refresh tokens

---

## Testing Auth Flows

### Unit Tests

```bash
pnpm test src/routers/auth.test.js
```

### RBAC Tests

```bash
pnpm test tests/rbac.test.js
pnpm test tests/rbac.integration.test.js
```

### E2E Tests

```bash
pnpm run test:e2e
# Tests: auth.spec.ts, chat.spec.ts, admin-settings.spec.ts
```

---

## Debugging Tips

### Check Auth State in Browser Console

```javascript
JSON.parse(localStorage.getItem('growchat_auth'));
```

### Decode JWT Payload

```javascript
const parts = token.split('.');
const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')));
```

### Check Token Expiry

```javascript
const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
const payload = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')));
new Date(payload.exp * 1000);
```

### Trace Token Refresh

- Open DevTools Network tab
- Look for `POST /api/auth/refresh` requests
- Check response for new tokens

### Check Rate Limits

- Rate limit state stored in KV under `rate-limit:*` keys
- Check CACHE namespace in wrangler.toml

---

## Related Documentation

- **Full Auth Flow**: `docs/backend/AUTH_FLOW.md`
- **Sequence Diagrams**: `docs/backend/AUTH_FLOW_SEQUENCES.md`
- **RBAC System**: `docs/backend/RBAC.md`
- **API Contracts**: `docs/backend/API.md`
- **Database Schema**: `migrations/001_initial.sql`
