# PLAN3.md - Security Enhancements

## Goal

Strengthen GrowChat's security posture through defense-in-depth improvements that are practical and low-friction. The security audit found no critical or high severity issues - all core controls pass. This plan focuses on minor enhancements that improve resilience without changing architecture.

## Current Security Posture: SECURE ✅

The audit confirms all major security controls are properly implemented:

- ✅ Secrets: No hardcoded credentials, JWT_SECRET validated for production
- ✅ Auth: JWT with HS256, PBKDF2 100k iterations, constant-time comparison
- ✅ SQL: All queries parameterized via D1 `.bind()`
- ✅ Input: Zod validation, file upload whitelist, email validation
- ✅ XSS: DOMPurify sanitization, `escapeHtml` function, `textContent` for plain text
- ✅ Rate Limiting: Auth, file upload, and chat message endpoints
- ✅ Headers: CSP, HSTS, X-Frame-Options, Referrer-Policy configured
- ✅ Dependencies: 0 vulnerabilities (`npm audit` clean)

## CSRF Protection Analysis

### Current State

The application uses Bearer token authentication via the `Authorization` header. A CSRF service exists at `src/services/csrf.js` but is not enforced in routers.

### Why This Is Acceptable

CSRF attacks exploit browsers automatically including cookies in cross-origin requests. Bearer token authentication is inherently CSRF-resistant because:

1. **Custom headers require preflight**: Browsers send an OPTIONS request for cross-origin requests with custom headers (like `Authorization`). The server can reject these if the origin isn't allowed.

2. **No automatic credential inclusion**: Unlike cookies, the `Authorization` header must be explicitly set via JavaScript. Attacker pages cannot forge this header.

3. **Same-origin policy protection**: Even if an attacker obtains a token via XSS, they must call the API directly (not through the victim's browser), which changes the attack vector entirely.

### Decision: Keep Current Approach

Enforcing CSRF tokens would add complexity without meaningful security benefit for this authentication model. The token service can remain as infrastructure for future features if cookie-based auth is ever needed.

## Recommended Enhancements

### 1. Add Subresource Integrity (SRI) for External Scripts

**Priority:** Low  
**Effort:** Small

The CSP allows `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`. Add SRI hashes for the DOMPurify CDN dependency.

**Implementation:**
- Generate SRI hash for the specific DOMPurify version being loaded
- Update the CDN import to include `integrity` and `crossorigin` attributes
- Pin the version to avoid unexpected changes

**Current state:** `public/js/shared/markdown-renderer.js:1`
```js
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs';
```

**Enhanced:**
```js
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs' 
  /* integrity: sha384-[hash] crossorigin: anonymous */;
```

### 2. Consider Removing `'unsafe-inline'` from CSP `script-src`

**Priority:** Low (hardening)  
**Effort:** Medium

The CSP includes `'unsafe-inline'` in `script-src`, which weakens XSS protection since all inline scripts are trusted.

**Current CSP:**
```
"Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; ..."
```

**Recommended approach:**
- Audit all inline scripts in `public/index.html`
- Where possible, move to external modules
- For remaining inline scripts, use nonces or hashes
- Remove `'unsafe-inline'` once all inline scripts are accounted for

**Note:** This is a progressive hardening item. The `'unsafe-inline'` directive is common in SPAs and is acceptable for production with other controls (DOMPurify, `escapeHtml`) in place.

### 3. Add CORS Origin Validation

**Priority:** Low (defense in depth)  
**Effort:** Small

Cloudflare Workers automatically handle CORS for `wrangler dev`, but production should explicitly validate allowed origins.

**Implementation:**
- Add an `ALLOWED_ORIGINS` environment variable
- Create a lightweight CORS middleware that checks `Origin` against the allowlist
- For Cloudflare Workers, this can be added to `src/bootstrap/worker-context.js`

**Example:**
```js
function handleCors(req, env) {
  const origin = req.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS?.split(',') || [];
  
  if (origin && !allowed.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }
  
  return null; // Continue if origin is allowed or no origin present
}
```

**Note:** Cloudflare Workers already provide origin isolation at the edge, so this is defense-in-depth rather than critical.

### 4. Improve Error Response Consistency

**Priority:** Low  
**Effort:** Small

Some error paths may leak more information than necessary. The error handling is good overall, but review these patterns:

**Current patterns (good):**
- `src/errors/http-errors.js` - Generic `internal_error` for 500s
- HttpError classes with appropriate status codes

**Minor improvement:**
- Ensure `console.error` calls don't include user-provided input that could contain sensitive data
- The existing error structure is solid; no changes required unless specific leaks are identified

### 5. Add Security Headers to Error Responses

**Priority:** Low  
**Effort:** Very small

Verify that security headers are included on all responses, including errors and redirects.

**Current state:** `src/utils/response.js` adds headers to successful responses.

**Enhancement:**
- Ensure `json()` and `error()` helper functions consistently apply security headers
- Verify redirect responses also include security headers where applicable

### 6. Consider Token Binding (Optional)

**Priority:** Low (future enhancement)  
**Effort:** Medium

Bind JWT tokens to client characteristics to reduce impact of token theft:

**Options:**
- Bind to IP address (may cause issues with mobile users switching networks)
- Bind to User-Agent hash
- Add `jti` (JWT ID) claim for token tracking and revocation

**Implementation:**
```js
// In signJWT
{
  sub: user.id,
  ip_hash: await sha256Hex(req.headers.get('CF-Connecting-IP') || ''),
  jti: crypto.randomUUID(),
  ...
}

// In verifyJWT
const expectedIpHash = await sha256Hex(req.headers.get('CF-Connecting-IP') || '');
if (payload.ip_hash !== expectedIpHash) {
  throw new Error('Token bound to different client');
}
```

**Note:** IP binding can cause friction for users on mobile networks or behind CG-NATs. Consider this optional.

### 7. Regular Secret Rotation Documentation

**Priority:** Low  
**Effort:** Very small

Document the process for rotating JWT_SECRET and other secrets:

**Create:** `SECURITY.md` with:
- Instructions for rotating JWT_SECRET via `wrangler secret put JWT_SECRET`
- Impact assessment (all existing sessions invalidated)
- Recommended rotation schedule (quarterly or after personnel changes)

## What NOT To Change

### Do NOT Enforce CSRF Tokens

- Bearer token auth is inherently CSRF-safe
- Adding CSRF tokens would require changes to every API call in the frontend
- Adds complexity without addressing a real attack vector
- The existing CSRF service can remain for future use cases

### Do NOT Change Password Hashing Algorithm

- PBKDF2 with 100k iterations is secure and well-tested
- Argon2 would require additional dependencies and may not be available in Cloudflare Workers runtime
- The current implementation uses Web Crypto API, which is natively available

### Do NOT Add Complex Rate Limiting

- The current rate limiting is appropriately scoped
- Adding user-based rate limiting (beyond IP-based) is unnecessary for this use case
- Cloudflare Workers provides edge-level protection against abuse

## Implementation Priority

| Priority | Enhancement | Impact | Effort | Timeline |
|----------|-------------|--------|--------|----------|
| P1 | SRI for DOMPurify import | Low | 30 min | Immediate |
| P2 | Error response header consistency | Low | 1 hour | Soon |
| P3 | CORS origin validation | Defense in depth | 1 hour | Next release |
| P4 | CSP `'unsafe-inline'` removal | Medium | 4-8 hours | Backlog |
| P5 | Token binding (optional) | Low | 2-3 hours | Future |
| P6 | Security rotation docs | Compliance | 30 min | Anytime |

## Acceptance Criteria

- SRI hash added for DOMPurify CDN import
- All error and redirect responses include security headers
- CORS origin validation functional in production
- `SECURITY.md` created with rotation procedures
- No new security regressions introduced

## Risk Assessment

**Current risk level:** LOW

The application already implements all critical security controls. The enhancements in this plan are incremental improvements that reduce theoretical attack surface but do not address any identified vulnerabilities.

**If no changes are made:** The application remains secure for production use with its current security posture.