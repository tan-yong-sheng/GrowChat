# GrowChat Security Remediation Guide

This document provides step-by-step instructions to fix the critical security vulnerabilities found in the GrowChat codebase.

---

## PHASE 1: CRITICAL FIXES (Do First)

### 1. Remove Exposed Credentials from Git History

**IMPORTANT:** Do this immediately to prevent credential reuse.

```bash
# Step 1: Revoke exposed credentials
# - Resend: Go to https://resend.com/api-keys and delete the exposed key
# - Anthropic: Rotate auth token in your Claude account settings
# - CodeSandbox: Regenerate API key

# Step 2: Remove from git history
cd /path/to/GrowChat

# Option A: Remove all .env files from history
git filter-branch --tree-filter 'rm -f .env .env.local .dev.vars' HEAD

# Option B: Use git-filter-repo (faster for large repos)
git filter-repo --path .env --path .env.local --path .dev.vars --invert-paths

# Step 3: Force push (WARNING: This rewrites history)
git push origin --force-with-lease

# Step 4: Ask all team members to re-clone
# They should delete their local clones and re-clone from the cleaned repo
```

### 2. Update .gitignore

Verify that sensitive files are properly ignored:

```bash
# Check current .gitignore
cat .gitignore | grep -E "\.env|\.dev\.vars"

# Should see:
# .env*
# !.env.example
# .dev.vars*
# !.dev.vars.example
```

### 3. Update All Exposed Credentials

Create new `.env.example` with placeholder values:

```bash
# .env.example
OPENAI_API_KEY=your-openai-key-here
OPENAI_BASE_URL=

DEFAULT_MODEL=gpt-4-turbo

CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token

EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_key_here

ANTHROPIC_AUTH_TOKEN=your-anthropic-token
ANTHROPIC_BASE_URL=https://api.anthropic.com

CSB_API_KEY=csb_your_key_here

JWT_SECRET=your-jwt-secret-32-bytes-minimum
```

### 4. Fix JWT Secret Management

Edit `src/shared/jwt-secret.js`:

```javascript
let devJwtSecret = null;

function isLocalHost(hostname) {
  if (!hostname) return false;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

function getRequestHostname(req) {
  try {
    return new URL(req.url).hostname;
  } catch {
    return '';
  }
}

function generateSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getJwtSecret(env, req) {
  // FIX: Require JWT_SECRET for production
  if (env?.JWT_SECRET) {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 bytes');
    }
    return env.JWT_SECRET;
  }
  
  const hostname = getRequestHostname(req);
  
  // FIX: Reject production hostnames without JWT_SECRET
  if (!isLocalHost(hostname)) {
    throw new Error('JWT_SECRET environment variable is required for non-localhost deployments. Set it in your Cloudflare Workers secrets.');
  }
  
  // Dev-only: generate ephemeral secret
  if (!devJwtSecret) {
    devJwtSecret = generateSecret();
    console.warn('JWT_SECRET not set. Using ephemeral dev-only secret for localhost.');
  }
  return devJwtSecret;
}
```

### 5. Update Dependencies

Fix known vulnerabilities:

```bash
# Check current vulnerabilities
npm audit

# Try automatic fix first
npm audit fix

# If automatic fix doesn't work, review:
# 1. Update @codesandbox/sdk if possible
npm outdated @codesandbox/sdk
npm update @codesandbox/sdk

# 2. If that doesn't help, remove it if not critical
npm uninstall @codesandbox/sdk

# Verify fix
npm audit
# Should show: "found 0 vulnerabilities"
```

### 6. Add Security Headers

Edit `src/utils/response.js`:

```javascript
export function preflight(req) {
  const origin = req.headers.get('Origin');
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:8787',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8787',
    // Add production domain here
    // 'https://growchat.com',
  ];
  
  const isAllowedOrigin = allowedOrigins.includes(origin);
  
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    },
  });
}

export function json(req, data, status = 200, headers = {}) {
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
  
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...securityHeaders,
      ...headers,
    },
  });
}

export function error(req, message, status = 400, headers = {}) {
  // Sanitize error message - don't expose internal details
  const sanitizedMessage = status >= 500 ? 'Internal server error' : message;
  return json(req, { error: sanitizedMessage }, status, headers);
}
```

---

## PHASE 2: HIGH PRIORITY FIXES

### 7. Add CSRF Protection

Create `src/services/csrf.js`:

```javascript
export async function generateCsrfToken(env, sessionId) {
  const token = crypto.randomUUID();
  const key = `csrf:${token}`;
  
  await env.SESSIONS.put(
    key,
    JSON.stringify({ sessionId, createdAt: Date.now() }),
    { expirationTtl: 3600 } // 1 hour
  );
  
  return token;
}

export async function validateCsrfToken(env, token, sessionId) {
  if (!token) return false;
  
  const key = `csrf:${token}`;
  const stored = await env.SESSIONS.get(key, 'json');
  
  if (!stored) return false;
  if (stored.sessionId !== sessionId) return false;
  
  // Consume token (one-time use)
  await env.SESSIONS.delete(key);
  
  return true;
}
```

Update form submissions to include CSRF token:

```javascript
// Before: 
fetch('/api/endpoint', { method: 'POST', body: formData });

// After:
const csrfToken = document.querySelector('[name="csrf-token"]')?.value;
fetch('/api/endpoint', {
  method: 'POST',
  body: formData,
  headers: { 'X-CSRF-Token': csrfToken },
});
```

### 8. Add Rate Limiting to Auth Endpoints

Edit `src/routers/auth.js`:

```javascript
// Password reset endpoint
if (req.method === 'POST' && path === '/api/auth/password-reset') {
  const body = await req.json();
  const email = requireString(body.email, 'email');
  
  // FIX: Add rate limiting by email
  const resetLimit = await checkRateLimit(env.CACHE, {
    action: 'password-reset',
    subject: email,
    limit: 3,
    windowSeconds: 3600, // 3 attempts per hour
  });
  
  if (!resetLimit.allowed) {
    return error(req, 'Too many password reset attempts. Try again later.', 429);
  }
  
  // ... rest of password reset logic
}
```

### 9. Install and Use DOMPurify

```bash
npm install dompurify
npm install --save-dev @types/dompurify
```

Update frontend code to sanitize HTML:

```javascript
// In public/js/shared/markdown-renderer.js

import DOMPurify from 'dompurify';

// When rendering user content:
const cleanHtml = DOMPurify.sanitize(userContent, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'title'],
});

el.innerHTML = cleanHtml;
```

### 10. Remove Query Parameter Token Support

Edit `src/bootstrap/worker-context.js`:

```javascript
export function resolveAuthUser(req, env) {
  // FIX: Only accept tokens in Authorization header
  let token = readBearerToken(req);
  
  // REMOVE THIS:
  // if (!token) {
  //   const queryToken = url.searchParams.get('access_token');
  //   if (queryToken) token = queryToken.trim();
  // }
  
  if (!token) return null;
  
  try {
    const secret = getJwtSecret(env, req);
    const decoded = await verifyJWT(token, secret);
    return decoded;
  } catch (err) {
    return null;
  }
}
```

---

## PHASE 3: MEDIUM PRIORITY FIXES

### 11. Implement Audit Logging

Create `src/services/audit-logger.js`:

```javascript
export async function logAuditEvent(env, {
  actor_id,
  action,
  resource_type,
  resource_id,
  status = 'success',
  metadata = {},
  ip_address,
  user_agent,
}) {
  const event = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor_id,
    action,
    resource_type,
    resource_id,
    status,
    metadata,
    ip_address,
    user_agent,
  };
  
  try {
    const db = createDB(env.DB);
    await db.run(
      `INSERT INTO audit_logs (id, timestamp, actor_id, action, resource_type, resource_id, status, metadata, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.timestamp,
        event.actor_id,
        event.action,
        event.resource_type,
        event.resource_id,
        event.status,
        JSON.stringify(event.metadata),
        event.ip_address,
        event.user_agent,
      ]
    );
  } catch (err) {
    console.error('Failed to log audit event:', err);
    // Don't fail the operation if logging fails
  }
  
  return event;
}
```

Add migration for audit logs table:

```sql
-- migrations/audit_logs.sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  status TEXT NOT NULL,
  metadata TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
```

### 12. Add Input Validation Schema

Create `src/validation/schemas.js`:

```javascript
import { z } from 'zod';

export const userRegistrationSchema = z.object({
  email: z.string().email().max(255),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must include uppercase letter')
    .regex(/[a-z]/, 'Password must include lowercase letter')
    .regex(/[0-9]/, 'Password must include number'),
  name: z.string().min(1).max(255),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const chatMessageSchema = z.object({
  chat_id: z.string().uuid(),
  message: z.string().min(1).max(10000),
  attachments: z.array(z.string().uuid()).optional(),
});

// Usage:
export function validateInput(schema, data) {
  try {
    return { valid: true, data: schema.parse(data) };
  } catch (err) {
    return { valid: false, error: err.errors[0]?.message || 'Invalid input' };
  }
}
```

### 13. Implement Account Lockout

Create `src/services/account-lockout.js`:

```javascript
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60; // 15 minutes

export async function recordFailedLogin(env, email) {
  const key = `login-attempts:${email}`;
  const current = await env.CACHE.get(key, 'json') || { attempts: 0 };
  
  current.attempts += 1;
  current.lastAttempt = Date.now();
  
  await env.CACHE.put(key, JSON.stringify(current), {
    expirationTtl: LOCKOUT_DURATION,
  });
  
  return current.attempts;
}

export async function getFailedLoginCount(env, email) {
  const key = `login-attempts:${email}`;
  const current = await env.CACHE.get(key, 'json');
  return current?.attempts || 0;
}

export async function isAccountLocked(env, email) {
  const attempts = await getFailedLoginCount(env, email);
  return attempts >= MAX_ATTEMPTS;
}

export async function clearFailedLogins(env, email) {
  const key = `login-attempts:${email}`;
  await env.CACHE.delete(key);
}
```

Update login endpoint:

```javascript
// In src/routers/auth.js

// Check if account is locked
if (await isAccountLocked(env, email)) {
  return error(req, 'Account temporarily locked. Try again in 15 minutes.', 429);
}

// ... verify password ...

if (!passwordMatch) {
  const attempts = await recordFailedLogin(env, email);
  const remaining = MAX_ATTEMPTS - attempts;
  
  if (remaining > 0) {
    return error(req, `Invalid credentials. ${remaining} attempts remaining.`, 401);
  } else {
    return error(req, 'Account locked due to too many failed attempts.', 429);
  }
}

// Success - clear failed attempts
await clearFailedLogins(env, email);
```

### 14. Sanitize Error Messages

Edit error handling throughout codebase:

```javascript
// In src/index.js
catch (err) {
  console.error('Unhandled worker error:', err); // Log internally
  const message = 'Internal server error'; // Never expose err.message
  if (path.startsWith('/api/')) {
    return error(req, message, 500);
  }
  return new Response(message, {
    status: 500,
    headers: { 'Content-Type': 'text/plain' },
  });
}
```

---

## PHASE 4: TESTING & VERIFICATION

### 15. Add Security Tests

Create `tests/security.test.js`:

```javascript
import { describe, it, expect } from 'vitest';

describe('Security Tests', () => {
  it('should reject requests without CSRF token on POST', async () => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
    });
    expect(response.status).toBe(403);
  });
  
  it('should rate limit password reset attempts', async () => {
    const email = 'test@example.com';
    
    for (let i = 0; i < 3; i++) {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      expect(response.status).toBe(200);
    }
    
    const response = await fetch('/api/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    expect(response.status).toBe(429);
  });
  
  it('should reject XSS payloads', async () => {
    const xssPayload = '<img src=x onerror="alert(1)">';
    // Test that payload is escaped
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ message: xssPayload }),
    });
    expect(response.status).toBe(200);
    // Verify message is escaped in response
    const data = await response.json();
    expect(data.message).not.toContain('onerror=');
  });
});
```

### 16. Run Automated Security Checks

```bash
# Check dependencies
npm audit

# Run tests
npm test

# Run security tests
npm test -- tests/security.test.js

# OWASP ZAP scanning (requires Docker)
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:8787
```

### 17. Create Pre-commit Hook

Create `.husky/pre-commit`:

```bash
#!/bin/bash

# Check for secrets
git diff --cached | grep -E "OPENAI_API_KEY|RESEND_API_KEY|ANTHROPIC_AUTH_TOKEN|sk_|re_" && {
  echo "ERROR: Potential secret found in commit"
  echo "Please remove sensitive information before committing"
  exit 1
}

# Run security tests
npm run test -- tests/security.test.js

# Check dependencies
npm audit --audit-level=moderate

exit 0
```

Make it executable:
```bash
chmod +x .husky/pre-commit
```

---

## PHASE 5: PRODUCTION DEPLOYMENT

### 18. Production Environment Setup

Set environment variables in Cloudflare Workers:

```bash
# Generate secure JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set in Cloudflare
wrangler secret put JWT_SECRET
# Paste the generated secret

wrangler secret put OPENAI_API_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put ANTHROPIC_AUTH_TOKEN

# Deploy
npm run deploy
```

### 19. Update wrangler.jsonc

```jsonc
{
  "env": {
    "production": {
      "vars": {
        "APP_NAME": "GrowChat",
        "ENVIRONMENT": "production",
        "EMAIL_PROVIDER": "resend"
        // NOTE: Do NOT put secrets here
        // Use wrangler secret put instead
      },
      // ... rest of production config
    }
  }
}
```

### 20. Verify Production Security

```bash
# Check security headers
curl -I https://growchat.com
# Should see:
# Strict-Transport-Security: max-age=31536000
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Content-Security-Policy: ...

# Check certificate
openssl s_client -connect growchat.com:443

# Check for exposed credentials
git log --all --grep="password\|secret\|key"
```

---

## CHECKLIST FOR SIGN-OFF

- [ ] All exposed credentials revoked
- [ ] Secrets removed from git history
- [ ] Dependencies updated (0 vulnerabilities)
- [ ] JWT_SECRET configured and strong
- [ ] Security headers added
- [ ] CSRF protection implemented
- [ ] Rate limiting on auth endpoints
- [ ] DOMPurify installed and used
- [ ] Query parameter tokens removed
- [ ] Audit logging implemented
- [ ] Account lockout implemented
- [ ] Input validation schema created
- [ ] Error messages sanitized
- [ ] Security tests passing
- [ ] Pre-commit hooks working
- [ ] Production environment configured
- [ ] Security headers verified

---

## REFERENCES

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Cloudflare Workers Security](https://developers.cloudflare.com/workers/platform/security/)
- [npm Audit Documentation](https://docs.npmjs.com/cli/v8/commands/npm-audit)
