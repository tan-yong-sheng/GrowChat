# GrowChat Prioritized Action Plan (PLAN5.md)

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Consolidate PLAN3.md (Security) and PLAN4.md (Features) into a single actionable plan with clear priorities, effort estimates, and current status.

**Architecture:** This plan reorganizes 48 items from PLAN3 and PLAN4 into 4 tiers: Quick Wins (< 1 day), Short-term (1-2 weeks), Medium-term (1-2 months), and Long-term (3+ months). Items are prioritized by impact-to-effort ratio.

**Tech Stack:** Cloudflare Workers, D1, KV, R2, Vanilla JS, Vitest, Playwright

---

## Current Status Summary

| Source | Priority | Total | Completed | In Progress | Not Started |
|--------|----------|-------|-----------|-------------|-------------|
| PLAN3.md | Security | 7 | 1 (14%) | 1 | 5 |
| PLAN4.md | P0 | 7 | 0 (0%) | 0 | 7 |
| PLAN4.md | P1 | 16 | 2 (13%) | 2 | 12 |
| PLAN4.md | P2 | 18 | 0 (0%) | 0 | 18 |

**Recently Fixed (2026-04-15):**
- ✅ JWT timing attack vulnerability
- ✅ Refresh token race condition (two-key pattern)
- ✅ Role binding atomic transaction
- ✅ Account status explicit allowlist
- ✅ 403 retry on all routes
- ✅ Admin permission consolidation
- ✅ Test environment optimization (node vs jsdom)

---

## Tier 1: Quick Wins (Complete in 1-2 days)

These items require minimal code changes but provide meaningful improvements.

### TW-001: SRI Hash for DOMPurify CDN Import
**Source:** PLAN3.md #1 | **Priority:** P1 | **Effort:** 30 min | **Impact:** Low

**Current State:**
```js
// public/js/shared/markdown-renderer.js:1
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs';
```

**Files:**
- Modify: `public/js/shared/markdown-renderer.js`
- Modify: `public/index.html` (if inline script loads DOMPurify)

**Step 1: Generate SRI hash**
```bash
curl -s https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs | openssl dgst -sha384 -binary | openssl base64 -A
```

**Step 2: Update import with integrity attribute**
```js
// Note: ES module imports don't support integrity attribute directly.
// Solution: Load via script tag in HTML instead.
```

**Step 3: Update public/index.html**
```html
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs"
        integrity="sha384-[HASH]"
        crossorigin="anonymous"></script>
```

**Step 4: Update markdown-renderer.js**
```js
// Use global DOMPurify instead of import
const DOMPurify = window.DOMPurify;
```

**Step 5: Test**
- Run E2E tests to verify markdown rendering works
- Check browser console for SRI errors

**Step 6: Commit**
```bash
git add public/index.html public/js/shared/markdown-renderer.js
git commit -m "security: add SRI hash for DOMPurify CDN import"
```

---

### TW-002: CORS Origin Validation
**Source:** PLAN3.md #3 | **Priority:** P3 | **Effort:** 1 hour | **Impact:** Defense-in-depth

**Current State:** No origin validation; Cloudflare Workers handles CORS automatically.

**Files:**
- Create: `src/middleware/cors.js`
- Modify: `src/index.js` (add middleware)
- Modify: `wrangler.jsonc` (add ALLOWED_ORIGINS var)

**Step 1: Create CORS middleware**
```js
// src/middleware/cors.js
export function validateOrigin(req, env) {
  const origin = req.headers.get('Origin');
  if (!origin) return null; // Allow requests without origin (same-origin, mobile apps)

  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    return null; // Allow
  }

  return new Response('Origin not allowed', { status: 403 });
}
```

**Step 2: Add to wrangler.jsonc**
```jsonc
"vars": {
  "ALLOWED_ORIGINS": "http://localhost:8787,https://growchat.pages.dev"
}
```

**Step 3: Apply middleware in src/index.js**
```js
import { validateOrigin } from './middleware/cors.js';

// In fetch handler, before routing:
const corsReject = validateOrigin(req, env);
if (corsReject) return corsReject;
```

**Step 4: Write test**
```js
// src/middleware/cors.test.js
import { describe, expect, it } from 'vitest';
import { validateOrigin } from './cors.js';

describe('cors middleware', () => {
  it('allows requests without origin', () => {
    const req = new Request('https://example.com/api/test');
    expect(validateOrigin(req, { ALLOWED_ORIGINS: 'https://allowed.com' })).toBeNull();
  });

  it('allows allowed origins', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://allowed.com' }
    });
    expect(validateOrigin(req, { ALLOWED_ORIGINS: 'https://allowed.com' })).toBeNull();
  });

  it('rejects disallowed origins', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://evil.com' }
    });
    const result = validateOrigin(req, { ALLOWED_ORIGINS: 'https://allowed.com' });
    expect(result.status).toBe(403);
  });
});
```

**Step 5: Run tests**
```bash
npx vitest run src/middleware/cors.test.js
```

**Step 6: Commit**
```bash
git add src/middleware/cors.js src/middleware/cors.test.js src/index.js wrangler.jsonc
git commit -m "security: add CORS origin validation middleware"
```

---

### TW-003: Security Rotation Documentation
**Source:** PLAN3.md #7 | **Priority:** P6 | **Effort:** 30 min | **Impact:** Compliance

**Files:**
- Create: `SECURITY.md`

**Step 1: Create SECURITY.md**
```markdown
# Security Documentation

## Secret Rotation Procedures

### JWT_SECRET Rotation

**Impact:** All existing sessions will be invalidated. Users must re-authenticate.

**Procedure:**
1. Generate new secret: `openssl rand -hex 32`
2. Update in Cloudflare: `wrangler secret put JWT_SECRET`
3. Deploy: `npm run deploy`
4. Monitor for authentication errors

**Recommended Schedule:** Quarterly or after personnel changes.

### RESEND_API_KEY Rotation

**Impact:** Password reset emails will fail until new key is active.

**Procedure:**
1. Generate new key in Resend dashboard
2. Update: `wrangler secret put RESEND_API_KEY`
3. Test password reset flow immediately

## Incident Response

1. Identify scope of incident
2. Rotate affected secrets immediately
3. Review audit logs (if available)
4. Document incident in GitHub Issues

## Contact

Security issues: Create private issue in GitHub repository.
```

**Step 2: Commit**
```bash
git add SECURITY.md
git commit -m "docs: add SECURITY.md with secret rotation procedures"
```

---

### TW-004: ESLint and Prettier Setup
**Source:** PLAN4.md P2 #39 | **Priority:** Low | **Effort:** 1 hour | **Impact:** DX

**Files:**
- Create: `.eslintrc.json`
- Create: `.prettierrc`
- Modify: `package.json` (add scripts)

**Step 1: Install dependencies**
```bash
npm install -D eslint prettier eslint-config-prettier @eslint/js
```

**Step 2: Create .eslintrc.json**
```json
{
  "env": {
    "browser": true,
    "es2024": true,
    "node": true
  },
  "extends": ["eslint:recommended", "prettier"],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "off"
  }
}
```

**Step 3: Create .prettierrc**
```json
{
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```

**Step 4: Add scripts to package.json**
```json
{
  "scripts": {
    "lint": "eslint 'src/**/*.js' 'public/js/**/*.js' --ignore-pattern 'node_modules'",
    "lint:fix": "eslint 'src/**/*.js' 'public/js/**/*.js' --fix",
    "format": "prettier --write 'src/**/*.js' 'public/js/**/*.js'",
    "format:check": "prettier --check 'src/**/*.js' 'public/js/**/*.js'"
  }
}
```

**Step 5: Run and fix issues**
```bash
npm run format
npm run lint
```

**Step 6: Commit**
```bash
git add .eslintrc.json .prettierrc package.json package-lock.json
git commit -m "chore: add ESLint and Prettier configuration"
```

---

## Tier 2: Short-term (1-2 weeks)

These items require moderate effort but are essential for production readiness.

### ST-001: Email Verification Flow
**Source:** PLAN4.md P0 #3 | **Priority:** High | **Effort:** 1-2 weeks | **Impact:** High

**Current State:** Users can register without email verification. `account_status` only tracks 'active' or 'pending' (admin-set, not verification).

**Architecture:**
1. New `email_verifications` table stores verification tokens
2. Registration sets `account_status = 'pending_verification'`
3. Email sent with verification link
4. Clicking link verifies email and sets status to 'active'

**Files:**
- Create: `migrations/004_email_verification.sql`
- Modify: `src/routers/auth.js` (registration, verification endpoints)
- Modify: `src/bootstrap/worker-context.js` (check verification status)
- Modify: `public/js/features/auth/auth-form.js` (show verification message)

**Database Schema:**
```sql
-- migrations/004_email_verification.sql
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token_hash);
```

**Tasks:**
1. Create migration file
2. Add verification token generation on registration
3. Create `/api/auth/verify-email` endpoint
4. Create `/api/auth/resend-verification` endpoint
5. Update login to check verification status
6. Update frontend to show "check your email" message
7. Add email template for verification
8. Write unit tests
9. Write E2E tests

---

### ST-002: Message Editing
**Source:** PLAN4.md P1 #9 | **Priority:** Medium | **Effort:** 3-5 days | **Impact:** Medium

**Current State:** Messages are immutable after sending.

**Architecture:**
1. Add `edited_at` column to `messages` table
2. New endpoint: `PATCH /api/chats/:id/messages/:messageId`
3. Store edit history in `message_edits` table (optional)
4. Frontend shows "(edited)" indicator

**Files:**
- Create: `migrations/005_message_editing.sql`
- Modify: `src/routers/chat.js` (add edit endpoint)
- Modify: `public/js/features/chat/chat-message.js` (edit UI)
- Modify: `public/js/features/chat/chat-input.js` (edit mode)

**Database Schema:**
```sql
-- migrations/005_message_editing.sql
ALTER TABLE messages ADD COLUMN edited_at INTEGER;

-- Optional: track edit history
CREATE TABLE IF NOT EXISTS message_edits (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  previous_content TEXT NOT NULL,
  edited_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

### ST-003: Session Management UI
**Source:** PLAN4.md P1 #16 | **Priority:** Medium | **Effort:** 3-5 days | **Impact:** Medium

**Current State:** Users cannot see or revoke active sessions.

**Architecture:**
1. Store session metadata in KV (device, IP, last active)
2. New endpoint: `GET /api/auth/sessions`
3. New endpoint: `DELETE /api/auth/sessions/:sessionId`
4. Frontend: Settings page shows active sessions with revoke button

**Files:**
- Modify: `src/shared/session.js` (store session metadata)
- Modify: `src/routers/auth.js` (add session endpoints)
- Create: `public/js/features/settings/sessions.js`
- Modify: `public/js/features/settings/settings-modal.js`

---

### ST-004: Audit Logging Enhancement
**Source:** PLAN4.md P1 #15 | **Priority:** Medium | **Effort:** 1 week | **Impact:** Medium

**Current State:** `logAuditEvent` exists but not widely used.

**Architecture:**
1. Create `audit_logs` table in D1
2. Create audit middleware for sensitive actions
3. Add admin UI to view audit logs
4. Export functionality for compliance

**Database Schema:**
```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT, -- JSON
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
```

---

## Tier 3: Medium-term (1-2 months)

### MT-001: Message Search
**Source:** PLAN4.md P0 #1 | **Priority:** High | **Effort:** 3-4 weeks | **Impact:** High

**Current State:** No search functionality. Users cannot find past messages.

**Architecture Options:**
1. **D1 FTS5** - Built-in SQLite full-text search
2. **Meilisearch** - Dedicated search service
3. **Algolia** - Cloud search service

**Recommended:** D1 FTS5 for simplicity, no additional infrastructure.

**Implementation:**
1. Create FTS5 virtual table on messages content
2. New endpoint: `GET /api/search?q=term&chat_id=optional`
3. Frontend: Search modal with results
4. Index management on message create/edit/delete

**Database:**
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  role,
  chat_id,
  content='messages',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, role, chat_id)
  VALUES (new.rowid, new.content, new.role, new.chat_id);
END;
```

---

### MT-002: Direct/DM Chats
**Source:** PLAN4.md P0 #2 | **Priority:** High | **Effort:** 3-4 weeks | **Impact:** High

**Current State:** Only group chats exist. All chats are team/workspace based.

**Architecture:**
1. Add `type` column to `chats` table ('group' | 'direct')
2. Add `is_direct` boolean
3. DM chats have exactly 2 members
4. UI: New DM button, user selector
5. Routing: Click user avatar → open DM

**Database:**
```sql
ALTER TABLE chats ADD COLUMN type TEXT DEFAULT 'group' CHECK (type IN ('group', 'direct'));

-- DM constraint: exactly 2 members
-- Application-level validation required
```

---

### MT-003: GDPR Data Export
**Source:** PLAN4.md P1 #13 | **Priority:** Medium | **Effort:** 1-2 weeks | **Impact:** Compliance

**Architecture:**
1. New endpoint: `POST /api/account/export`
2. Async job generates ZIP with:
   - User profile (JSON)
   - All messages (JSON)
   - All chats (JSON)
   - Settings (JSON)
3. Email notification when export ready
4. Download endpoint with expiry

---

### MT-004: GDPR Data Deletion
**Source:** PLAN4.md P1 #14 | **Priority:** Medium | **Effort:** 1-2 weeks | **Impact:** Compliance

**Architecture:**
1. Soft delete: Mark user as 'deleted'
2. Hard delete: Cascade delete all user data
3. 30-day grace period before hard delete
4. Admin can restore within grace period

---

## Tier 4: Long-term (3+ months)

### LT-001: TypeScript Migration
**Source:** PLAN4.md P0 #6 | **Priority:** High | **Effort:** 6+ months | **Impact:** High

**Strategy:** Incremental migration, not big-bang rewrite.

**Phase 1: Setup (1 week)**
1. Add `tsconfig.json`
2. Add `@types/*` packages
3. Enable `allowJs: true`
4. Add `tsc --noEmit` to CI

**Phase 2: New Code (ongoing)**
1. All new files in TypeScript
2. Shared utilities converted first
3. Type definitions for API responses

**Phase 3:
**Phase 3: Incremental Migration (3-6 months)**
1. Convert routers one by one
2. Convert frontend modules
3. Add strict mode gradually

---

### LT-002: Offline Mode
**Source:** PLAN4.md P0 #7 | **Priority:** High | **Effort:** 2-3 months | **Impact:** High

**Architecture:**
1. Service Worker for caching
2. IndexedDB for message queue
3. Background sync API
4. Conflict resolution for offline edits

**Implementation:**
1. Create `public/sw.js` service worker
2. Create `src/client/db.js` for IndexedDB
3. Add sync logic to message sending
4. Add offline indicator UI

---

## Summary

| Tier | Items | Total Effort | Recommended Timeline |
|------|-------|--------------|---------------------|
| Quick Wins | 4 | 1-2 days | Week 1 |
| Short-term | 4 | 4-6 weeks | Weeks 2-8 |
| Medium-term | 4 | 6-8 weeks | Weeks 8-16 |
| Long-term | 2 | 8+ months | Ongoing |

## Recommended Execution Order

### Week 1: Quick Wins
1. TW-001: SRI for DOMPurify
2. TW-002: CORS validation
3. TW-003: Security docs
4. TW-004: ESLint/Prettier

### Weeks 2-4: Critical Security
5. ST-001: Email verification

### Weeks 5-8: Core Features
6. MT-001: Message search
7. ST-003: Session management UI
8. ST-002: Message editing

### Weeks 9-16: Compliance & UX
9. MT-003: GDPR export
10. MT-004: GDPR deletion
11. MT-002: DM chats
12. ST-004: Audit logging

### Ongoing: Long-term
13. LT-001: TypeScript (incremental)
14. LT-002: Offline mode

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Scope creep on LT-001 (TypeScript) | High | High | Strict incremental approach |
| MT-001 (Search) performance issues | Medium | Medium | Benchmark early, add pagination |
| Email deliverability (ST-001) | Low | High | Test with real email providers |
| GDPR compliance gaps | Medium | High | Legal review before launch |

---

## Appendix: Original Item Mapping

### PLAN3.md Items
| # | Original | New ID | Status |
|---|----------|--------|--------|
| 1 | SRI for DOMPurify | TW-001 | Not Started |
| 2 | Remove unsafe-inline | - | Backlog (complex) |
| 3 | CORS validation | TW-002 | Not Started |
| 4 | Error response consistency | - | Partial (acceptable) |
| 5 | Security headers on errors | - | ✅ Complete |
| 6 | Token binding | - | Backlog (optional) |
| 7 | Secret rotation docs | TW-003 | Not Started |

### PLAN4.md P0 Items
| # | Original | New ID | Status |
|---|----------|--------|--------|
| 1 | Message Search | MT-001 | Not Started |
| 2 | DM Chats | MT-002 | Not Started |
| 3 | Email Verification | ST-001 | Not Started |
| 4 | CSRF | - | ✅ Acceptable (Bearer tokens) |
| 5 | API Tests | - | Backlog |
| 6 | TypeScript | LT-001 | Not Started |
| 7 | Offline Mode | LT-002 | Not Started |

### PLAN4.md P1 Items (Selected)
| # | Original | New ID | Status |
|---|----------|--------|--------|
| 9 | Message Editing | ST-002 | Not Started |
| 13 | GDPR Export | MT-003 | Not Started |
| 14 | GDPR Deletion | MT-004 | Not Started |
| 15 | Audit Logging | ST-004 | Not Started |
| 16 | Session Management | ST-003 | Not Started |
| 23 | Chat Resume | - | ✅ Partial (message_deltas exist) |
