# Security Documentation

This document outlines security procedures for GrowChat, including secret rotation, incident response, and security best practices.

## Secret Rotation Procedures

### JWT_SECRET Rotation

**Impact:** All existing sessions will be invalidated. Users must re-authenticate.

**Procedure:**
1. Generate new secret:
   ```bash
   openssl rand -hex 32
   ```
2. Update in Cloudflare:
   ```bash
   wrangler secret put JWT_SECRET
   ```
3. Deploy:
   ```bash
   npm run deploy
   ```
4. Monitor for authentication errors in logs

**Recommended Schedule:** Quarterly or after personnel changes.

### RESEND_API_KEY Rotation

**Impact:** Password reset emails will fail until new key is active.

**Procedure:**
1. Generate new key in [Resend dashboard](https://resend.com/api-keys)
2. Update:
   ```bash
   wrangler secret put RESEND_API_KEY
   ```
3. Test password reset flow immediately after deployment

**Recommended Schedule:** Annually or if key is suspected compromised.

## Environment Variables

| Variable | Purpose | Rotation Impact |
|----------|---------|-----------------|
| `JWT_SECRET` | Signs access tokens | Invalidates all sessions |
| `RESEND_API_KEY` | Email delivery | Breaks password reset until replaced |
| `RESEND_FROM_EMAIL` | Sender address | No rotation needed |

## Incident Response

### 1. Identify Scope

- What data was exposed?
- Which systems are affected?
- Is the breach ongoing?

### 2. Immediate Actions

1. **Rotate affected secrets** - See procedures above
2. **Block malicious IPs** - Use Cloudflare firewall rules
3. **Review audit logs** - Check for suspicious activity
4. **Notify affected users** - If personal data was exposed

### 3. Post-Incident

1. Document incident timeline
2. Update security measures
3. Review and improve detection
4. Create GitHub issue for tracking (private if sensitive)

## Security Best Practices

### Authentication

- JWT tokens expire after 15 minutes
- Refresh tokens are hashed and stored in KV
- Passwords use PBKDF2 with 100,000 iterations

### API Security

- All API routes require authentication (except public routes)
- Rate limiting on auth, file upload, and message endpoints
- CORS validation for production deployments

### Data Protection

- All database queries use parameterized statements
- File uploads are scanned and validated
- User content is sanitized with DOMPurify

## Reporting Security Issues

For security vulnerabilities, please:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer with details
3. Allow 90 days for response before disclosure

## Compliance

GrowChat implements security controls for:

- **OWASP Top 10** - Protection against common web vulnerabilities
- **Data minimization** - Only collect necessary user data
- **Encryption** - TLS in transit, hashed passwords at rest

---

*Last updated: 2026-04-15*
