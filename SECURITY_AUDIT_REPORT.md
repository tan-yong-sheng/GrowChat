# GrowChat Security Audit Report
**Date:** April 5, 2026  
**Scope:** Comprehensive security review of GrowChat codebase  
**Status:** CRITICAL ISSUES FOUND - Immediate action required

---

## Executive Summary

This security audit identified **CRITICAL vulnerabilities** that must be remediated before production deployment. The most severe issues involve:

1. **Exposed API Keys in Version Control** - Real credentials committed to `.env` and `.env.local`
2. **Vulnerable Dependencies** - 8 known vulnerabilities including high-severity prototype pollution and code injection
3. **Potential XSS Vulnerabilities** - Extensive use of `innerHTML` with user-controlled content
4. **Missing Security Headers** - No CORS, CSP, or other protective headers configured
5. **Weak JWT Secret Management** - Ephemeral dev secrets used in production scenarios

**Risk Level:** CRITICAL - Production deployment blocked until remediated

---

## CRITICAL ISSUES (Must Fix Before Production)

### 1. EXPOSED API KEYS IN VERSION CONTROL

**Severity:** CRITICAL  
**Files:**
- `/c/Users/tys/Documents/Coding/GrowChat/.env` (Line 1)
- `/c/Users/tys/Documents/Coding/GrowChat/.env.local` (Lines 1-3)

**Details:**
```
.env contains:
  RESEND_API_KEY=re_8BQBdcLE_PKaiCWrPWWv3T86P1h6FowhS

.env.local contains:
  ANTHROPIC_AUTH_TOKEN=sk-9LYky9bQy3LwFPfdfbQy3LwFPfdf
  ANTHROPIC_BASE_URL=https://proxy.tanyongsheng.site
  CSB_API_KEY=csb_v1_1ZkWFqBn5eNIUNg4ofWCzjr00Re3_WNkYLBFFm5I5Zk
```

**Impact:**
- Real API credentials exposed in git history
- Attackers can use these keys to impersonate the application
- Resend API key can send emails on behalf of the application
- Anthropic token can make API calls consuming credits
- CodeSandbox token provides unauthorized access

**Immediate Actions Required:**
1. **REVOKE ALL EXPOSED CREDENTIALS IMMEDIATELY**
   - Resend: Regenerate API key in dashboard
   - Anthropic: Rotate auth token
   - CodeSandbox: Regenerate API key
2. **Remove from git history:**
   ```bash
   git filter-branch --tree-filter 'rm -f .env .env.local' HEAD
   git push origin --force-with-lease
   ```
3. **Verify .gitignore is correct:**
   - `.env*` is already in `.gitignore` (line 213-214)
   - But files were already committed before .gitignore was added
4. **Use git-secrets or similar to prevent future commits:**
   ```bash
   npm install --save-dev git-secrets
   ```

**Fix:**
- Store all secrets in environment variables only
- Use `.env.example` with placeholder values
- Never commit `.env`, `.env.local`, or `.dev.vars`

---

### 2. VULNERABLE DEPENDENCIES - HIGH SEVERITY

**Severity:** CRITICAL  
**Source:** `npm audit` output

**Vulnerabilities Found:**

| Package | Severity | Issue | CVE |
|---------|----------|-------|-----|
| lodash | HIGH | Code Injection via `_.template` | GHSA-r5fr-rjxr-66jc |
| lodash | HIGH | Prototype Pollution via `_.unset` | GHSA-f23m-r3pf-42rh |
| defu | HIGH | Prototype Pollution via `__proto__` | GHSA-737v-mqg7-c878 |
| picomatch | HIGH | Method Injection in POSIX Classes | GHSA-3v7f-55p6-f55p |
| picomatch | HIGH | ReDoS via extglob quantifiers | GHSA-c2c7-rcm5-vvqj |
| brace-expansion | MODERATE | Zero-step sequence DoS | GHSA-f886-m6hf-6m8v |
| xml2js | MODERATE | Prototype pollution | GHSA-776f-qx25-q3cc |

**Root Cause:**
- `@codesandbox/sdk@2.4.2` depends on vulnerable `blessed-contrib`
- `blessed-contrib` depends on vulnerable `lodash` and `map-canvas`
- `map-canvas` depends on vulnerable `xml2js`

**Impact:**
- Prototype pollution attacks can modify object prototypes
- Code injection via template processing
- Regular expression denial of service (ReDoS)
- Process hang and memory exhaustion

**Fix:**
```bash
# Option 1: Update to compatible versions
npm audit fix

# Option 2: Force update (may have breaking changes)
npm audit fix --force

# Option 3: Remove @codesandbox/sdk if not critical
npm uninstall @codesandbox/sdk
```

**Verification:**
```bash
npm audit --audit-level=high
# Should show 0 vulnerabilities
```

---

### 3. WEAK JWT SECRET MANAGEMENT

**Severity:** CRITICAL  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/src/shared/jwt-secret.js`

**Issue:**
```javascript
// Lines 26-30
if (!devJwtSecret) {
  devJwtSecret = generateSecret();
  console.warn('JWT_SECRET not set. Using ephemeral dev-only secret for localhost.');
}
return devJwtSecret;
```

**Problems:**
1. Ephemeral secret regenerated on each worker restart
2. All sessions invalidated on deployment
3. No validation that JWT_SECRET is set in production
4. Secret is in-memory only, not persisted

**Impact:**
- Session hijacking possible if secret is compromised
- All user sessions lost on deployment
- No audit trail of secret changes

**Fix:**
```javascript
export function getJwtSecret(env, req) {
  if (env?.JWT_SECRET) return env.JWT_SECRET;
  
  const hostname = getRequestHostname(req);
  if (!isLocalHost(hostname)) {
    throw new Error('JWT_SECRET environment variable is required for non-localhost deployments');
  }
  
  // Dev-only: generate ephemeral secret
  if (!devJwtSecret) {
    devJwtSecret = generateSecret();
    console.warn('JWT_SECRET not set. Using ephemeral dev-only secret for localhost.');
  }
  return devJwtSecret;
}
```

**Required Actions:**
1. Set `JWT_SECRET` environment variable in production
2. Use strong random value (minimum 32 bytes)
3. Rotate periodically (e.g., quarterly)
4. Store in secure secret management system (Cloudflare Secrets, AWS Secrets Manager, etc.)

---

### 4. MISSING SECURITY HEADERS

**Severity:** HIGH  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/src/utils/response.js`

**Issue:**
No security headers are set in HTTP responses. Missing:
- `Content-Security-Policy` (CSP)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy`

**Impact:**
- XSS attacks not mitigated
- Clickjacking attacks possible
- MIME type sniffing vulnerabilities
- No protection against protocol downgrade

**Fix:**
Add to response headers in `src/utils/response.js`:

```javascript
export function preflight(req) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
```

---

### 5. POTENTIAL XSS VULNERABILITIES IN FRONTEND

**Severity:** HIGH  
**Files:** Multiple files using `innerHTML` with user content

**Examples:**
- `/c/Users/tys/Documents/Coding/GrowChat/public/js/bootstrap/app.js:91` - Direct innerHTML assignment
- `/c/Users/tys/Documents/Coding/GrowChat/public/js/features/chat/chat-message-dom.js:33` - innerHTML with rendered content
- `/c/Users/tys/Documents/Coding/GrowChat/public/js/shared/markdown-renderer.js:450` - SVG content via innerHTML

**Issue:**
While `escapeHtml()` is used in many places, the pattern is error-prone:
```javascript
// RISKY: Easy to forget escapeHtml()
el.innerHTML = renderAssistantMessageBody({ ... });

// SAFER: Use textContent for plain text
el.textContent = userInput;

// SAFEST: Use DOMPurify for HTML content
el.innerHTML = DOMPurify.sanitize(userInput);
```

**Impact:**
- Stored XSS if user input not properly escaped
- Reflected XSS through URL parameters
- DOM-based XSS through client-side processing

**Fix:**
1. Install DOMPurify:
   ```bash
   npm install dompurify
   ```

2. Use for all user-controlled HTML:
   ```javascript
   import DOMPurify from 'dompurify';
   
   el.innerHTML = DOMPurify.sanitize(userContent);
   ```

3. Audit all `innerHTML` assignments for user input

---

### 6. MISSING RATE LIMITING ON CRITICAL ENDPOINTS

**Severity:** HIGH  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/src/routers/auth.js`

**Issue:**
Password reset endpoint lacks rate limiting:
```javascript
// Line 477 - No rate limit check
async function handlePasswordReset(req, env, db, body) {
  // ... directly processes password reset without rate limiting
}
```

**Impact:**
- Brute force attacks on password reset
- Email flooding attacks
- Account enumeration via timing attacks

**Fix:**
Add rate limiting to auth endpoints:
```javascript
const resetLimit = await checkRateLimit(env.CACHE, {
  action: 'password-reset',
  subject: email, // Rate limit by email, not user
  limit: 3,
  windowSeconds: 3600, // 3 attempts per hour
});

if (!resetLimit.allowed) {
  return error(req, 'Too many password reset attempts', 429);
}
```

---

## HIGH SEVERITY ISSUES (Should Fix)

### 7. MISSING AUTHORIZATION CHECKS

**Severity:** HIGH  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/src/routers/files.js:116`

**Issue:**
File access doesn't verify ownership in all code paths:
```javascript
// Potential issue: Verify user owns the document
const doc = await db.first('SELECT * FROM documents WHERE id = ?', [docId]);
// Missing: if (doc.user_id !== user.sub) return error(req, 'Forbidden', 403);
```

**Fix:**
Always verify resource ownership:
```javascript
const doc = await requireOwnedDocument(db, docId, user.sub);
if (!doc) {
  return error(req, 'Document not found or access denied', 404);
}
```

---

### 8. QUERY PARAMETER TOKEN EXPOSURE

**Severity:** HIGH  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/src/bootstrap/worker-context.js:18-19`

**Issue:**
```javascript
const queryToken = url.searchParams.get('access_token');
if (queryToken) return queryToken.trim();
```

**Problems:**
- Tokens in query parameters are logged in server logs
- Tokens visible in browser history
- Tokens exposed in referrer headers

**Fix:**
Only accept tokens in Authorization header:
```javascript
function readBearerToken(req) {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

// Remove query parameter token support
```

---

### 9. MISSING CSRF PROTECTION

**Severity:** HIGH  
**Issue:**
No CSRF token validation on state-changing operations (POST, PUT, DELETE)

**Fix:**
Implement CSRF token validation:
```javascript
// Generate token on GET requests
const csrfToken = crypto.randomUUID();
await env.SESSIONS.put(`csrf:${csrfToken}`, userId, { expirationTtl: 3600 });

// Validate on POST/PUT/DELETE
const token = req.headers.get('X-CSRF-Token');
const stored = await env.SESSIONS.get(`csrf:${token}`);
if (!stored) return error(req, 'Invalid CSRF token', 403);
```

---

### 10. INSUFFICIENT INPUT VALIDATION

**Severity:** HIGH  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/src/validation/request.js`

**Issue:**
Limited validation on user inputs. Example:
```javascript
// Minimal validation
const email = body.email?.trim();
if (!email) return error(req, 'email required', 400);
// Missing: email format validation, length limits
```

**Fix:**
Use schema validation library (Zod):
```javascript
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

const validated = userSchema.parse(body);
```

---

## MEDIUM SEVERITY ISSUES (Should Fix)

### 11. SENSITIVE DATA IN ERROR MESSAGES

**Severity:** MEDIUM  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/src/index.js:95`

**Issue:**
```javascript
return error(req, `worker_crash: ${message}`, 500);
```

Error messages may expose internal details.

**Fix:**
```javascript
console.error('Worker error:', message); // Log internally
return error(req, 'Internal server error', 500); // Generic response
```

---

### 12. MISSING AUDIT LOGGING

**Severity:** MEDIUM  
**Issue:**
Limited audit trail for security-relevant events:
- Login attempts (successful and failed)
- Permission changes
- API key access
- File downloads

**Fix:**
Implement comprehensive audit logging:
```javascript
await logAuditEvent(env, {
  actor_id: user.sub,
  action: 'login_success',
  resource_type: 'user',
  resource_id: user.id,
  ip_address: req.headers.get('CF-Connecting-IP'),
  user_agent: req.headers.get('User-Agent'),
  timestamp: new Date().toISOString(),
});
```

---

### 13. MISSING ACCOUNT LOCKOUT

**Severity:** MEDIUM  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/src/routers/auth.js`

**Issue:**
No account lockout after failed login attempts.

**Fix:**
Implement progressive delays:
```javascript
const loginAttempts = await getLoginAttempts(env, email);
if (loginAttempts > 5) {
  return error(req, 'Account temporarily locked', 429);
}

if (!passwordMatch) {
  await incrementLoginAttempts(env, email);
  return error(req, 'Invalid credentials', 401);
}

await clearLoginAttempts(env, email);
```

---

### 14. MISSING SECURE COOKIE FLAGS

**Severity:** MEDIUM  
**Issue:**
No explicit secure cookie configuration for session tokens.

**Fix:**
Ensure cookies use secure flags:
```javascript
// If using cookies for tokens (not recommended)
Set-Cookie: token=...; HttpOnly; Secure; SameSite=Strict; Max-Age=3600
```

**Better:** Use Authorization header with Bearer tokens (already implemented)

---

### 15. MISSING CONTENT SECURITY POLICY

**Severity:** MEDIUM  
**Issue:**
No CSP header to prevent inline script execution.

**Fix:**
Add CSP header (see issue #4 above):
```http
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
```

---

## LOW SEVERITY ISSUES (Nice to Have)

### 16. MISSING SECURITY.TXT

**Severity:** LOW  
**Fix:**
Create `public/.well-known/security.txt`:
```text
Contact: security@growchat.com
Expires: 2027-04-05T00:00:00.000Z
Preferred-Languages: en
```

---

### 17. MISSING SUBRESOURCE INTEGRITY

**Severity:** LOW  
**File:** `/c/Users/tys/Documents/Coding/GrowChat/public/index.html`

**Issue:**
CDN resources loaded without integrity checks:
```html
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
```

**Fix:**
Add SRI hashes:
```html
<script 
  src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"
  integrity="sha384-..."
  crossorigin="anonymous">
</script>
```

---

### 18. MISSING DEPENDENCY SCANNING

**Severity:** LOW  
**Fix:**
Enable Dependabot in GitHub:
1. Go to Settings > Code security and analysis
2. Enable "Dependabot alerts"
3. Enable "Dependabot security updates"

---

## SECURITY BEST PRACTICES CHECKLIST

| Item | Status | Notes |
|------|--------|-------|
| Secrets in environment variables | ❌ FAIL | .env files committed |
| Dependencies up to date | ❌ FAIL | 8 vulnerabilities found |
| Security headers configured | ❌ FAIL | No CSP, HSTS, etc. |
| Input validation | ⚠️ PARTIAL | Basic validation only |
| Output escaping | ✅ PASS | escapeHtml() used |
| SQL injection prevention | ✅ PASS | Parameterized queries |
| Authentication | ✅ PASS | JWT implemented |
| Authorization | ⚠️ PARTIAL | Missing some checks |
| Rate limiting | ⚠️ PARTIAL | Some endpoints only |
| Audit logging | ❌ FAIL | Limited logging |
| HTTPS enforcement | ⚠️ PARTIAL | Depends on deployment |
| CORS configured | ❌ FAIL | Permissive CORS |
| CSRF protection | ❌ FAIL | Not implemented |
| Account lockout | ❌ FAIL | Not implemented |
| Password requirements | ⚠️ PARTIAL | No complexity rules |
| Session timeout | ✅ PASS | TTL configured |
| Secure cookies | ✅ PASS | Using Bearer tokens |
| Error handling | ⚠️ PARTIAL | May expose details |
| Dependency scanning | ❌ FAIL | No automated scanning |

---

## REMEDIATION ROADMAP

### Phase 1: CRITICAL (Do Immediately)
- [ ] Revoke exposed API keys
- [ ] Remove secrets from git history
- [ ] Update vulnerable dependencies
- [ ] Set JWT_SECRET environment variable
- [ ] Add security headers

**Timeline:** 24 hours

### Phase 2: HIGH (Do Before Production)
- [ ] Implement CSRF protection
- [ ] Add rate limiting to auth endpoints
- [ ] Verify authorization on all endpoints
- [ ] Remove query parameter token support
- [ ] Add DOMPurify for XSS prevention

**Timeline:** 1 week

### Phase 3: MEDIUM (Do Before Launch)
- [ ] Implement audit logging
- [ ] Add account lockout
- [ ] Sanitize error messages
- [ ] Add CSP header
- [ ] Implement input validation schema

**Timeline:** 2 weeks

### Phase 4: LOW (Ongoing)
- [ ] Add security.txt
- [ ] Add SRI to CDN resources
- [ ] Enable Dependabot
- [ ] Regular security audits
- [ ] Penetration testing

**Timeline:** Ongoing

---

## COMPLIANCE CHECKLIST

| Standard | Status | Notes |
|----------|--------|-------|
| OWASP Top 10 | ⚠️ PARTIAL | Multiple issues found |
| GDPR | ⚠️ PARTIAL | Need data retention policy |
| SOC 2 | ❌ FAIL | Audit logging required |
| PCI DSS | ❌ FAIL | Not applicable (no payment processing) |
| HIPAA | ❌ FAIL | Not applicable (no health data) |

---

## TESTING RECOMMENDATIONS

### Security Testing
```bash
# Dependency scanning
npm audit

# OWASP ZAP scanning
docker run -t owasp/zap2docker-stable zap-baseline.py -t https://growchat.local

# Manual penetration testing
# - Test SQL injection
# - Test XSS payloads
# - Test CSRF
# - Test authentication bypass
# - Test authorization bypass
```

### Automated Testing
```bash
# Add to CI/CD pipeline
npm audit --audit-level=high
npm run test
npm run test:e2e
```

---

## INCIDENT RESPONSE

If a security incident occurs:

1. **Immediate Actions (0-1 hour)**
   - Revoke compromised credentials
   - Isolate affected systems
   - Preserve logs and evidence
   - Notify security team

2. **Investigation (1-24 hours)**
   - Determine scope of breach
   - Identify affected users
   - Review audit logs
   - Document timeline

3. **Remediation (24-72 hours)**
   - Deploy security patches
   - Reset user passwords
   - Notify affected users
   - Update security measures

4. **Post-Incident (1-2 weeks)**
   - Conduct root cause analysis
   - Implement preventive measures
   - Update security policies
   - Conduct security training

---

## REFERENCES

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OWASP Cheat Sheets: https://cheatsheetseries.owasp.org/
- npm Security: https://docs.npmjs.com/cli/v8/commands/npm-audit
- Cloudflare Security: https://www.cloudflare.com/learning/security/
- CWE Top 25: https://cwe.mitre.org/top25/

---

## SIGN-OFF

**Audit Conducted By:** Security Reviewer  
**Date:** April 5, 2026  
**Status:** CRITICAL ISSUES FOUND - PRODUCTION DEPLOYMENT BLOCKED

**Next Steps:**
1. Review this report with development team
2. Create tickets for each issue
3. Prioritize Phase 1 items
4. Schedule follow-up audit after remediation

---

**CONFIDENTIAL - For Authorized Personnel Only**
