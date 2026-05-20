# Auth Service Flow

## Email/Password Login

1. **Client** initiates `POST /api/auth/login`.
2. **Router** (`src/routers/auth.js`) validates payload schema via `requireString` and `validateEmail`.
3. **Rate Limiter** (`checkRateLimit`) verifies the request origin/IP hasn't exceeded login thresholds.
4. **Repository** (`users.findByEmail`) queries the DB for the user record.
5. **Logic** (`verifyPassword`) compares the bcrypt hash.
6. **Authorization Check**: Enforces `isActiveAccount(user)`. If `pending`, aborts with 403.
7. **Side Effect**: `users.touchLastActive()` updates the DB timestamp.
8. **Token Generation**:
   - `signJWT` creates the short-lived (15m) access token containing role claims.
   - `createRefreshToken` creates a long-lived opaque token and stores it in the `refresh_tokens` DB table.
9. **Response** sent to Client.

---

## Google OAuth 2.0 Login

1. **Client** clicks "Sign in with Google" button (visible only when `GOOGLE_CLIENT_ID` is configured).
2. **Browser** navigates to `GET /api/auth/google`.
3. **Router** (`src/routers/auth.js`) checks `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are configured (503 if not).
4. **Rate Limiter** (`checkRateLimit`) verifies the request origin/IP under `auth-google` action.
5. **CSRF State**: Generates `crypto.randomUUID()`, stores in SESSIONS KV with 10-min TTL.
6. **Redirect** (302) to Google consent screen with `state`, `client_id`, `scope=openid email profile`.
7. **User** grants consent on Google's page.
8. **Google** redirects to `GET /api/auth/google/callback?code=X&state=Y`.
9. **Router** validates `state` parameter against KV (one-time use, 10-min TTL). If invalid → 302 redirect with `oauth_error=invalid_state`.
10. **Rate Limiter** (`checkRateLimit`) verifies under `auth-google-callback` action.
11. **Token Exchange**: `fetch()` to `oauth2.googleapis.com/token` with `code`, `client_id`, `client_secret`, `redirect_uri`.
12. **User Info**: `fetch()` to `www.googleapis.com/oauth2/v3/userinfo` with Google access token.
13. **Account Resolution** (3-step lookup):
    - `users.findByGoogleId(sub)` → if found, log in directly.
    - `users.findByEmail(email)` → if found, link via `updateGoogleId(userId, sub)`.
    - If no match → auto-provision: `users.create({ email, name, googleId: sub, passwordHash: 'oauth:no-password', accountStatus: 'active' })`.
14. **Authorization Check**: Enforces `isActiveAccount(user)`. If `pending` → 302 redirect with `oauth_error=pending_account`.
15. **Side Effects**: `users.touchLastActive()`, `ensureUserRoleBinding()`.
16. **Token Generation**: Same as email/password login — `signJWT` + `createRefreshToken`.
17. **Security Audit**: `logSecurityEvent(env, 'login_success', { provider: 'google' })`.
18. **Redirect** (302) to `/auth.html#access_token=X&refresh_token=Y&expires_in=900`.
19. **Frontend** (`handleOAuthCallback`) extracts tokens from URL hash fragment, clears hash, calls `setAuthState(data)`, redirects to `/`.
