# Auth Service Flow

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
