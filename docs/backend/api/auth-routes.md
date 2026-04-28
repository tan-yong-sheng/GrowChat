# Authentication Routes

Source: `src/routers/auth.js`

## Overview

GrowChat uses JWT (HS256) for access tokens (15-min TTL) and SHA-256 hashed refresh tokens stored in KV (7-day TTL). Passwords use PBKDF2 with 100,000 iterations and constant-time comparison.

No email verification is required for registration.

## Routes

### POST `/api/auth/register`

Register a new account. The first registered user automatically receives the `admin` role.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Response:** `{ success: true, user: { id, email, ... } }`

### POST `/api/auth/login`

Authenticate and receive JWT + refresh token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Response:** `{ success: true, token: "<jwt>", refreshToken: "<token>", user: { id, email, ... } }`

Account status check: requires `'active'` status. Returns 403 for `'pending'` accounts.

### POST `/api/auth/refresh`

Refresh an expired access token using a valid refresh token.

**Request Body:**
```json
{
  "refreshToken": "<token>"
}
```

Or send via `Authorization: Bearer <refresh-token>`.

**Response:** `{ success: true, token: "<new-jwt>", refreshToken: "<new-refresh-token>" }`

### POST `/api/auth/logout`

Invalidate the current refresh token.

**Request Body:**
```json
{
  "refreshToken": "<token>"
}
```

Or send via `Authorization: Bearer <refresh-token>`.

### POST `/api/auth/forgot-password`

Request a password reset email. Sends a time-limited token to the user's email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

### POST `/api/auth/reset-password`

Reset password using the token received via email.

**Request Body:**
```json
{
  "token": "<reset-token>",
  "password": "new-secure-password"
}
```

## Token Lifecycle

```
Register → [JWT 15min + Refresh 7d in KV]
  └─ Login → [JWT 15min + Refresh 7d in KV]
       └─ Refresh → [new JWT 15min + new Refresh 7d in KV]
            └─ Logout → Refresh token deleted from KV
```

See also: [public-routes.md](./public-routes.md) for public route registry.
