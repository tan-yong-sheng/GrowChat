# GrowChat Authentication Flow

Complete authentication system: registration, login, token refresh, password reset, and session management.

## 1. REGISTRATION (`POST /api/auth/register`)

```
Frontend (public/js/bootstrap/auth.js)
  ↓
  POST /api/auth/register { email, name, password }
  ↓
Backend (src/routers/auth.js)
  ├─ Rate limit check (auth-register)
  ├─ Validate email, name, password (min 8 chars)
  ├─ Check if email exists → 409 if duplicate
  ├─ Hash password (PBKDF2, 100k iterations, SHA-256)
  ├─ Determine account status:
  │  ├─ First user → 'active' + 'admin' role
  │  └─ Subsequent → 'pending' or 'active' (config-driven)
  ├─ Create user in DB
  ├─ Bind role in user_roles table
  └─ Response:
     ├─ If pending: { user, account_status: 'pending', message }
     └─ If active: { user, access_token (JWT), refresh_token, expires_in: 900 }

Frontend receives:
  ├─ If pending → show green message, stay on auth page
  └─ If active → setAuthState(data) → redirect to /
```

**Key Points:**
- First user auto-activated as admin, public registration disabled
- Subsequent users pending by default (configurable via `public_registration_status`)
- Password min 8 chars, no complexity requirements
- Email lowercased before storage

---

## 2. LOGIN (`POST /api/auth/login`)

```
Frontend (public/js/bootstrap/auth.js)
  ↓
  POST /api/auth/login { email, password }
  ↓
Backend (src/routers/auth.js)
  ├─ Rate limit check (auth-login)
  ├─ Validate email, password
  ├─ Find user by email
  ├─ Load primary_role from user_roles table
  ├─ Verify password (constant-time comparison)
  ├─ Check account_status === 'active'
  │  └─ If not → 403 { error: 'pending_account' }
  ├─ Touch last_active_at
  ├─ Create access_token (JWT, HS256, 15min TTL)
  ├─ Create refresh_token (opaque, hashed in KV, 7-day TTL)
  └─ Response: { user, access_token, refresh_token, expires_in: 900 }

Frontend receives:
  ├─ setAuthState(data) → store in localStorage
  └─ redirect to /
```

**Key Points:**
- Account status must be 'active' (explicit allowlist)
- Pending accounts return 403 with `error: 'pending_account'`
- Role loaded from RBAC table on every login
- last_active_at updated for analytics

---

## 3. TOKEN REFRESH (`POST /api/auth/refresh`)

```
Frontend (public/js/shared/api/request.js apiFetch)
  ├─ Check if access_token expired (JWT exp claim)
  ├─ If expired + refresh_token exists:
  │  └─ POST /api/auth/refresh { refresh_token }
  │
Backend (src/routers/auth.js)
  ├─ Consume refresh_token (two-key pattern):
  │  ├─ Delete refresh:{hash} gate key (prevents reuse)
  │  ├─ Read refresh-data:{hash} session data
  │  └─ Verify not expired
  ├─ Find user by userId from session
  ├─ Load primary_role
  ├─ Check account_status === 'active'
  ├─ Touch last_active_at
  ├─ Create new access_token (JWT)
  ├─ Create new refresh_token (opaque)
  └─ Response: { user, access_token, refresh_token, expires_in: 900 }

Frontend receives:
  ├─ setAuthState(data) → update localStorage
  └─ Retry original request with new Bearer token
```

**Key Points:**
- Two-key pattern prevents concurrent token reuse (race-safe in KV)
- Refresh token is single-use; new one issued on each refresh
- Account status re-checked (can be revoked mid-session)
- Automatic retry of failed request with new token

---

## 4. LOGOUT (`POST /api/auth/logout`)

```
Frontend (optional)
  ↓
  POST /api/auth/logout { refresh_token }
  ↓
Backend (src/routers/auth.js)
  ├─ Revoke refresh_token:
  │  ├─ Delete refresh:{hash}
  │  └─ Delete refresh-data:{hash}
  └─ Response: { ok: true }

Frontend:
  ├─ clearAuthState() → remove from localStorage
  └─ redirect to /auth.html
```

**Key Points:**
- Logout is optional (tokens expire naturally)
- Refresh token revocation is immediate
- Access token remains valid until expiry (can't be revoked server-side)

---

## 5. PASSWORD RESET FLOW

### 5a. Request Reset (`POST /api/auth/forgot-password`)

```
Frontend (public/js/bootstrap/auth.js modal)
  ↓
  POST /api/auth/forgot-password { email }
  ↓
Backend (src/routers/auth.js)
  ├─ Rate limit check (auth-forgot-password)
  ├─ Find user by email
  ├─ Generate random 32-byte token
  ├─ Hash token (SHA-256) → store hash in DB
  ├─ Insert password_reset_tokens record (1-hour TTL)
  ├─ Send email with reset link:
  │  └─ /auth/reset-password?token={plaintext_token}
  └─ Response: { message: 'Check your email...' }
     (Always success, even if email not found — security)

Frontend:
  └─ Show success message, close modal
```

**Key Points:**
- Rate limited per IP/user
- Always returns success (prevents email enumeration)
- Token sent in URL query param (standard pattern, see security notes)
- 1-hour expiry

### 5b. Reset Password (`POST /api/auth/reset-password`)

```
Frontend (public/js/bootstrap/auth.js modal, triggered by ?token= URL param)
  ↓
  POST /api/auth/reset-password { token, password }
  ↓
Backend (src/routers/auth.js)
  ├─ Rate limit check (auth-reset-password)
  ├─ Hash token (SHA-256)
  ├─ Find password_reset_tokens record by hash
  ├─ Verify not expired
  ├─ Hash new password (PBKDF2)
  ├─ Update users.password_hash
  ├─ Delete password_reset_tokens record (single-use)
  ├─ Revoke all refresh_tokens for user (force re-login)
  └─ Response: { message: 'Password reset successful...' }

Frontend:
  └─ Redirect to /auth.html after 2s
```

**Key Points:**
- Single-use token (deleted after consumption)
- All existing refresh tokens revoked (forces re-login on all devices)
- Password min 8 chars
- Rate limited per IP/user

---

## 6. TOKEN STORAGE & LIFECYCLE

### Access Token (JWT)

| Property | Value |
|----------|-------|
| **Format** | HS256 JWT |
| **Payload** | `{ sub, email, primary_role, name, iat, exp }` |
| **TTL** | 15 minutes (900 seconds) |
| **Storage** | localStorage (key: `growchat_auth`) |
| **Sent as** | `Authorization: Bearer {token}` |
| **Validation** | Client-side expiry check; server verifies signature |

### Refresh Token (Opaque)

| Property | Value |
|----------|-------|
| **Format** | Base64-URL-encoded 32-byte random |
| **Storage** | KV namespace `SESSIONS` (two-key pattern) |
| **Keys** | `refresh:{hash}` (gate), `refresh-data:{hash}` (data) |
| **TTL** | 7 days |
| **Sent as** | JSON body in `/api/auth/refresh` |
| **Reuse Prevention** | Gate key deleted atomically before reading data |

### Client Session ID

| Property | Value |
|----------|-------|
| **Format** | `{timestamp}-{uuid}` |
| **Storage** | sessionStorage (key: `growchat_client_session_id`) |
| **Sent as** | `x-client-session-id` header |
| **Purpose** | Track client sessions for logging/analytics |

---

## 7. SECURITY PROPERTIES

| Property | Implementation |
|----------|-----------------|
| **Password Hashing** | PBKDF2-SHA256, 100k iterations, 16-byte salt |
| **JWT Signing** | HS256 (HMAC-SHA256) with `JWT_SECRET` env var |
| **Token Comparison** | Constant-time (prevents timing attacks) |
| **Refresh Token Reuse** | Two-key pattern (gate + data) prevents concurrent reuse |
| **Password Reset** | Single-use token, 1-hour TTL, hashed in DB |
| **Rate Limiting** | Per-action (register, login, forgot, reset) per IP |
| **Account Status** | Explicit allowlist: only 'active' is active |
| **Role Binding** | Synced on every auth event (login, refresh, register) |
| **PBKDF2 Iterations** | 100,000 (industry standard as of 2024) |

### Password Reset Security Notes

The reset token is embedded in the URL query parameter. This is a standard pattern but has known risks:

- **Server logs**: Token appears in access logs (mitigated by logging URL paths only)
- **Browser history**: Token stored in history (cleared on tab close in modern browsers)
- **URL bar**: Token visible to shoulder surfers (user should close tab after use)
- **Referer header**: Token could leak via Referer (reset page has no external links)

Mitigations:
- Token is hashed in database (plaintext never stored)
- Token is single-use (deleted on consumption)
- Token expires after 1 hour
- All existing refresh tokens revoked on password reset

---

## 8. ERROR HANDLING

| Scenario | Status | Response |
|----------|--------|----------|
| Invalid credentials | 401 | `{ error: 'Invalid credentials' }` |
| Pending account | 403 | `{ error: 'pending_account', message: 'Account pending approval.' }` |
| Rate limited | 429 | `{ error: '...', retry_after: N }` |
| Expired refresh token | 401 | `{ error: 'Invalid refresh token' }` |
| Invalid reset token | 400 | `{ error: 'Invalid or expired reset token' }` |
| Email already registered | 409 | `{ error: 'Email already registered' }` |
| Public registration disabled | 403 | `{ error: 'Public registration is disabled' }` |

---

## 9. FRONTEND REQUEST FLOW (apiFetch)

```javascript
// src/public/js/shared/api/request.js
apiFetch(path, options)
  ├─ Get auth state from localStorage
  ├─ If access_token expired + refresh_token exists:
  │  ├─ Call refreshToken() → POST /api/auth/refresh
  │  └─ Update auth state
  ├─ Add Authorization header: Bearer {access_token}
  ├─ Add x-client-session-id header
  ├─ Fetch request
  ├─ If 401 or 403 + refresh_token exists:
  │  ├─ Retry refresh
  │  └─ Retry original request with new token
  └─ Return response
```

**Key Points:**
- Proactive refresh before request (if token expired)
- Reactive refresh on 401/403 (if token became invalid server-side)
- Both paths update localStorage with new tokens
- Client session ID sent on every request for analytics

---

## 10. BOOTSTRAP FLOW

```
1. App loads (public/js/bootstrap/app.js)
2. Check localStorage for auth state
3. If no auth state → redirect to /auth.html
4. If auth state exists:
   ├─ Decode JWT to check expiry
   ├─ If expired + refresh_token → auto-refresh
   ├─ If refresh fails → clear auth, redirect to /auth.html
   └─ If valid → load main app
```

---

## 11. DATABASE SCHEMA

### users table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  account_status TEXT DEFAULT 'pending',
  settings TEXT,
  created_at INTEGER,
  last_active_at INTEGER,
  updated_at INTEGER
);
```

### user_roles table (RBAC)
```sql
CREATE TABLE user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
);
```

### password_reset_tokens table
```sql
CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### refresh_tokens (KV storage)
```
Key: refresh:{hash}
Value: '1' (gate key, deleted on consume)
TTL: 7 days

Key: refresh-data:{hash}
Value: { userId, expiresAt }
TTL: 7 days
```

---

## 12. CONFIGURATION

| Config Key | Default | Purpose |
|-----------|---------|---------|
| `public_registration` | `true` | Enable/disable public registration |
| `public_registration_status` | `pending` | Default account status for new users |
| `JWT_SECRET` | (required) | Secret for signing JWTs |
| `RESEND_API_KEY` | (optional) | Email service for password resets |
| `EMAIL_FROM` | `noreply@resend.dev` | From address for emails |

---

## 13. RATE LIMITS

| Action | Limit | Window |
|--------|-------|--------|
| `auth-register` | 5 per IP | 1 hour |
| `auth-login` | 10 per IP | 1 hour |
| `auth-forgot-password` | 5 per IP | 1 hour |
| `auth-reset-password` | 5 per IP | 1 hour |

---

## 14. RELATED FILES

- **Frontend**: `public/js/bootstrap/auth.js`, `public/js/shared/api/auth.js`, `public/js/shared/api/request.js`
- **Backend**: `src/routers/auth.js`, `src/shared/auth.js`, `src/shared/session.js`
- **Tests**: `src/routers/auth.test.js`, `tests/rbac.test.js`
- **Email**: `src/services/email/email-service.js`
- **Rate Limiting**: `src/services/rate-limit.js`
