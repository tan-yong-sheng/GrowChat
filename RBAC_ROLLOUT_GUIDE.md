# RBAC Implementation Rollout Guide

**Date**: 2026-03-07
**Version**: 1.0
**Status**: Ready for Deployment

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Schema Migration Steps](#schema-migration-steps)
3. [Deployment Procedure](#deployment-procedure)
4. [Manual Verification Tests](#manual-verification-tests)
5. [Monitoring and Alerts](#monitoring-and-alerts)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Post-Deployment Validation](#post-deployment-validation)

---

## Pre-Deployment Checklist

### Infrastructure Requirements
- [ ] Staging environment D1 database available
- [ ] Production D1 database backed up
- [ ] Cloudflare Workers deployment staging available
- [ ] Monitoring tools configured (error tracking, logs)
- [ ] Team notified of deployment window
- [ ] Rollback plan documented and tested

### Code Review Completion
- [ ] All commits reviewed and approved
- [ ] Test suites pass (rbac.test.js, rbac.integration.test.js)
- [ ] No TODOs or FIXMEs in authorization core
- [ ] SQL injection prevention audit passed
- [ ] Security review completed

### Database Preparation
- [ ] RBAC migration file validated: `migrations/008_rbac_core.sql`
- [ ] SQL syntax verified (no syntax errors)
- [ ] Migration is idempotent (can run multiple times safely)
- [ ] All 5 tables created: roles, permissions, role_permissions, user_roles, audit_log
- [ ] All 9 indexes created for performance
- [ ] Default seed data complete: 6 roles, 20+ permissions

### Configuration Validation
- [ ] `src/index.js` has RBAC schema compatibility check
- [ ] `rbacRouter` imported and added to API_ROUTES
- [ ] RBAC endpoints configured correctly
- [ ] No hardcoded secrets in code
- [ ] All environment bindings present

---

## Schema Migration Steps

### Step 1: Pre-Migration Validation

```bash
# 1. Verify current schema
wrangler d1 execute growchat --command "SELECT COUNT(*) as users FROM users;"

# 2. Backup database
wrangler d1 execute growchat --file backup.sql
# OR via Cloudflare dashboard: Export SQL dump

# 3. Verify backup integrity
# Check file size and timestamp
ls -lh backup-*.sql
```

### Step 2: Apply RBAC Migration

```bash
# Apply migration to production database
wrangler d1 execute growchat --file=migrations/008_rbac_core.sql

# Verify migration success
wrangler d1 execute growchat --command "SELECT COUNT(*) as count FROM roles;"
# Expected output: count=6 (system roles)

wrangler d1 execute growchat --command "SELECT COUNT(*) as count FROM permissions;"
# Expected output: count=20+ (all permissions)

wrangler d1 execute growchat --command "SELECT COUNT(*) as count FROM role_permissions;"
# Expected output: count should be >0 (role-permission mappings)
```

### Step 3: Initialize User Roles

For existing users, assign default roles based on legacy `users.role` field:

```bash
# This step is handled automatically by:
# - Users with role='admin' become 'admin' role
# - Users with role='user' become 'member' role
# - Users with role='inactive' remain 'inactive'
#
# Manual migration if needed:
# INSERT INTO user_roles (id, user_id, role_id, created_at)
# SELECT UUID(), u.id, r.id, u.created_at
# FROM users u
# JOIN roles r ON u.role = r.name
# WHERE NOT EXISTS (
#   SELECT 1 FROM user_roles WHERE user_id = u.id
# );
```

### Step 4: Verify Migration Integrity

```bash
# Check all tables exist
wrangler d1 execute growchat --command ".tables"

# Verify row counts
wrangler d1 execute growchat --command "
  SELECT
    'roles' as table_name, COUNT(*) as count FROM roles
  UNION ALL
  SELECT 'permissions', COUNT(*) FROM permissions
  UNION ALL
  SELECT 'role_permissions', COUNT(*) FROM role_permissions
  UNION ALL
  SELECT 'user_roles', COUNT(*) FROM user_roles
  UNION ALL
  SELECT 'audit_log', COUNT(*) FROM audit_log;
"
```

---

## Deployment Procedure

### Phase 1: Staging Deployment (Required First)

```bash
# 1. Deploy to staging Worker
npm run build
wrangler deploy --env staging

# 2. Run all tests against staging
npm test -- --env staging

# 3. Manual smoke tests (see below)

# 4. Load test staging
# Simulate realistic traffic patterns
# Monitor: CPU, memory, response times
```

### Phase 2: Production Deployment

```bash
# 1. Final pre-deployment checks
- [ ] Team standby ready
- [ ] Monitoring dashboards open
- [ ] Runbook visible to on-call engineer
- [ ] Rollback procedure reviewed

# 2. Deploy to production
npm run deploy  # Builds CSS and deploys Worker

# 3. Monitor deployment progress
# Check Cloudflare dashboard: Deployments > Recent Deployments
# Expected: Status = Active, no errors

# 4. Verify deployment
# Check: Worker logs for schema compatibility check
# Should see NO "RBAC schema initialization pending" warnings
# (if migration was already applied)

# 5. Post-deployment validation
# See "Post-Deployment Validation" section below
```

---

## Manual Verification Tests

### Test 1: RBAC Endpoints Accessible

```bash
# Get admin token (with admin role)
export ADMIN_TOKEN="<admin-user-jwt>"

# 1. List roles
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.growchat.app/api/admin/rbac/roles

# Expected response:
# {
#   "roles": [
#     {"id": "...", "name": "admin", "is_system": 1, ...},
#     ... (6 system roles total)
#   ]
# }

# 2. List permissions
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.growchat.app/api/admin/rbac/permissions

# Expected response:
# {
#   "permissions": [...],
#   "grouped_by_category": {...}
# }

# 3. List audit log
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.growchat.app/api/admin/audit

# Expected response:
# {
#   "audit_log": [...],
#   "total": N,
#   "limit": 50,
#   "offset": 0
# }
```

### Test 2: Authorization Enforcement

```bash
# Test non-admin cannot access RBAC endpoints
export USER_TOKEN="<regular-user-jwt>"

curl -H "Authorization: Bearer $USER_TOKEN" \
  https://api.growchat.app/api/admin/rbac/roles

# Expected response: 403 Forbidden
# {
#   "error": "Forbidden"
# }
```

### Test 3: Audit Logging

```bash
# Create a new FAQ to trigger audit event
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Test FAQ?",
    "answer": "Test Answer",
    "category": "test"
  }' \
  https://api.growchat.app/api/admin/faqs

# Query audit log for this event
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  'https://api.growchat.app/api/admin/audit?action=faq_created'

# Expected response:
# Audit entry with action='faq_created', metadata with category and tags_count
```

### Test 4: Last-Owner Protection

```bash
# Setup: Ensure only one admin exists
# List all users with admin role
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.growchat.app/api/admin/users

# Attempt to demote the last admin
export ADMIN_USER_ID="<the-only-admin-id>"

curl -X PUT \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "manager"}' \
  https://api.growchat.app/api/admin/users/$ADMIN_USER_ID

# Expected response: 409 Conflict
# {
#   "error": "Cannot demote last admin"
# }
```

### Test 5: System Role Immutability

```bash
# Attempt to modify system role
curl -X PUT \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "administrator"}' \
  https://api.growchat.app/api/admin/rbac/roles/admin

# Expected response: 403 Forbidden
# {
#   "error": "Cannot modify system role"
# }
```

### Test 6: Backward Compatibility

```bash
# User should still access their own profile without RBAC
curl -H "Authorization: Bearer $USER_TOKEN" \
  https://api.growchat.app/api/users/me

# Expected response: 200 OK with user profile

# User should still access their chats
curl -H "Authorization: Bearer $USER_TOKEN" \
  https://api.growchat.app/api/chats

# Expected response: 200 OK with chat list

# Public endpoints still work without auth
curl https://api.growchat.app/api/models

# Expected response: 200 OK with model list
```

### Test 7: Create Custom Role

```bash
# Create a new custom role
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "moderator",
    "description": "Can manage FAQs and files"
  }' \
  https://api.growchat.app/api/admin/rbac/roles

# Expected response: 201 Created
# {
#   "role": {
#     "id": "<new-role-id>",
#     "name": "moderator",
#     "is_system": 0
#   }
# }
```

### Test 8: Add Permission to Role

```bash
# Bind permission to custom role
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role_id": "<moderator-role-id>",
    "permission_id": "<kb.write-permission-id>"
  }' \
  https://api.growchat.app/api/admin/rbac/bindings

# Expected response: 201 Created
# {
#   "binding": {
#     "role_id": "...",
#     "permission_id": "...",
#     "role_name": "moderator",
#     "permission_action": "kb.write"
#   }
# }
```

### Test 9: Audit Log Filtering

```bash
# Filter audit log by action
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  'https://api.growchat.app/api/admin/audit?action=user_updated'

# Filter by resource type
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  'https://api.growchat.app/api/admin/audit?resource_type=file'

# Filter by actor
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  'https://api.growchat.app/api/admin/audit?actor_id=<user-id>'

# All responses should show filtered results
```

### Test 10: Error Message Safety

```bash
# Attempt unauthorized action
curl -X POST \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"name": "new_role"}' \
  https://api.growchat.app/api/admin/rbac/roles

# Expected response: 403 Forbidden
# {
#   "error": "Forbidden"
# }
# Note: NO SQL errors, table names, or internal details exposed
```

---

## Monitoring and Alerts

### Key Metrics to Monitor

```
1. RBAC Authorization Checks
   - Metric: rbac.authorization.allow_count (gauge)
   - Metric: rbac.authorization.deny_count (gauge)
   - Alert: If deny_count > 100/min, investigate

2. Audit Log Growth
   - Metric: rbac.audit_log.size (bytes)
   - Metric: rbac.audit_log.entries_per_minute
   - Alert: If growth > expected baseline

3. RBAC Endpoint Latency
   - Metric: http.request.duration_ms (histogram)
   - Path: /api/admin/rbac/*
   - Alert: P95 latency > 500ms

4. Schema Compatibility Errors
   - Log: "RBAC schema initialization pending"
   - Alert: If any worker shows this message after deployment
```

### Log Messages to Monitor

```bash
# Good (expected during deployment)
"RBAC schema initialization pending: Run migrations/008_rbac_core.sql"

# Warning (investigate)
"Failed to generate embedding for FAQ"
"Authorization check failed: insufficient_scope"

# Error (immediate action required)
"Schema compatibility check skipped"
"Failed to load RBAC permissions"
"Duplicate column name in schema migration"
```

### Dashboard Setup

1. Create dashboard in monitoring tool (e.g., Datadog, New Relic)
2. Add charts for:
   - Authorization allow/deny rates
   - Response times by endpoint
   - Error rates
   - Database query performance
3. Set up alerts for:
   - Authorization deny rate > baseline
   - Response time P95 > 1s
   - Database errors > 0
   - Schema compatibility warnings

---

## Rollback Procedures

### Quick Rollback (Worker Only)

```bash
# If RBAC functionality broken but basic chat still works:
# 1. Revert Worker to previous version
wrangler rollback

# 2. Verify chat still works
curl -H "Authorization: Bearer $TOKEN" \
  https://api.growchat.app/api/chats

# 3. Restore service
# Should work immediately - DB migration is still present
```

### Full Rollback (DB + Worker)

```bash
# If database migration caused issues:
# 1. Keep Worker on previous version (see above)

# 2. Restore database from backup
# Via Cloudflare dashboard or:
wrangler d1 execute growchat --file backup-pre-rbac.sql

# 3. Verify data integrity
wrangler d1 execute growchat --command "
  SELECT COUNT(*) FROM users;
  SELECT COUNT(*) FROM chats;
  SELECT COUNT(*) FROM messages;
"

# 4. Restart Worker with previous version
# Database will no longer have RBAC tables (expected)
```

### Partial Rollback (Keep DB, Revert Worker)

```bash
# Most common scenario: Keep RBAC schema, revert Worker code
# 1. Revert Worker to pre-RBAC version
wrangler rollback

# 2. RBAC tables remain in database (safe)
# 3. Previous Worker code ignores RBAC tables (backward compatible)
# 4. All existing functionality restored
# 5. Can re-deploy RBAC Worker once issues fixed
```

---

## Troubleshooting Guide

### Issue: "RBAC schema not found" Warnings

**Symptoms**:
- Log messages: "RBAC schema initialization pending"
- RBAC endpoints return 500 errors

**Solutions**:
```bash
# 1. Check if migration was applied
wrangler d1 execute growchat --command "SELECT COUNT(*) FROM roles;"

# If error "no such table: roles"
# 2. Apply migration
wrangler d1 execute growchat --file=migrations/008_rbac_core.sql

# 3. Verify
wrangler d1 execute growchat --command "SELECT COUNT(*) FROM roles;"
# Should return: count=6
```

### Issue: Authorization Denying All Admin Operations

**Symptoms**:
- All RBAC endpoints return 403 Forbidden
- Even admin users cannot access

**Solutions**:
```bash
# 1. Verify admin user has admin role
wrangler d1 execute growchat --command "
  SELECT u.id, u.email, r.name FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE u.email = 'admin@example.com';
"

# 2. If not found, assign admin role
wrangler d1 execute growchat --command "
  INSERT INTO user_roles (id, user_id, role_id, created_at)
  SELECT UUID(), u.id, r.id, unixepoch()
  FROM users u, roles r
  WHERE u.email = 'admin@example.com'
  AND r.name = 'admin';
"

# 3. Verify JWT token includes correct user ID
# Decode JWT and check 'sub' claim matches user.id in database
```

### Issue: Audit Log Not Recording Events

**Symptoms**:
- Mutations complete but no audit entries appear
- GET /api/admin/audit returns empty

**Solutions**:
```bash
# 1. Verify audit_log table exists
wrangler d1 execute growchat --command \
  "SELECT COUNT(*) FROM audit_log;"

# 2. Check for errors in logs
# Look for "Failed to create audit event" messages

# 3. Verify logAuditEvent is imported in routers
grep -r "logAuditEvent" src/routers/

# 4. Test audit logging directly
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"question":"Test?","answer":"Test"}' \
  https://api.growchat.app/api/admin/faqs

# 5. Check for audit entry
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  'https://api.growchat.app/api/admin/audit?action=faq_created'
```

### Issue: Last-Owner Protection Not Working

**Symptoms**:
- Can demote/delete the last admin
- Admin lockout possible

**Solutions**:
```bash
# 1. Verify isLastOwnerOfRole is called
grep -r "isLastOwnerOfRole" src/routers/

# 2. Check if only one admin exists
wrangler d1 execute growchat --command "
  SELECT u.id, u.email, r.name FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE r.name = 'admin';
"

# 3. If protection not working, manually verify
# Attempt to demote should return 409 Conflict
# with error message "Cannot demote last admin"

# 4. If still failing, check authorize.js
# Ensure isLastOwnerOfRole() is called before role change
```

### Issue: SQL Injection Concerns

**Symptoms**:
- Suspicious SQL errors in logs
- Query parameters appearing in error messages

**Solutions**:
```bash
# 1. Verify all queries are parameterized
grep -r 'DB.prepare.*\+' src/

# Should return: 0 results (no string concatenation)

# 2. Code review all authorize.js queries
# Each should use bind() for parameters

# 3. Run SQL injection tests
# See tests/rbac.test.js for SQL injection test cases

# 4. If found, report issue and patch immediately
```

---

## Post-Deployment Validation

### Step 1: Verify Core Functionality (0-5 minutes)

```bash
# 1. Health check
curl https://api.growchat.app/api/models
# Expected: 200 OK

# 2. Auth still works
curl -X POST -d '{"email":"test@example.com","password":"..."}' \
  https://api.growchat.app/api/auth/login
# Expected: 200 OK with tokens

# 3. Chat still works
curl -H "Authorization: Bearer $TOKEN" \
  https://api.growchat.app/api/chats
# Expected: 200 OK with chat list
```

### Step 2: Verify RBAC Functionality (5-15 minutes)

```bash
# Run all Test 1-10 from Manual Verification Tests section above
# Verify each test passes as expected
```

### Step 3: Monitor Metrics (15-60 minutes)

```bash
# 1. Watch error rate in logs
# Should see NO "RBAC schema" warnings

# 2. Watch response times
# RBAC endpoints should respond in <500ms

# 3. Watch authorization metrics
# Deny count should be proportional to users trying admin endpoints

# 4. Watch audit log growth
# Should grow with each mutation

# 5. Check database performance
# Query times should remain <100ms
```

### Step 4: User Communication (15+ minutes)

- [ ] Notify operations team: "RBAC deployment successful"
- [ ] Post status update to stakeholders
- [ ] Create incident/postmortem if any issues found
- [ ] Document lessons learned

### Step 5: Post-Deployment Review (24 hours)

```
Checklist:
- [ ] No critical errors in logs (24 hour window)
- [ ] Error rate < baseline
- [ ] Response times normal
- [ ] Audit log growing as expected
- [ ] No user complaints
- [ ] All admin features working
- [ ] All user features unchanged
```

---

## Success Criteria

✅ **Deployment successful when**:
- [x] All 5 RBAC tables exist in database
- [x] All 6 system roles created
- [x] All 20+ permissions seeded
- [x] Schema compatibility check passes (no warnings)
- [x] RBAC endpoints accessible to admin users
- [x] Authorization enforced (non-admin denied)
- [x] Audit log recording all mutations
- [x] Last-owner protection working
- [x] All backward compatibility tests pass
- [x] No security issues in authorization core
- [x] Error messages safe (no SQL leakage)
- [x] Performance acceptable (<500ms for RBAC endpoints)
- [x] Monitoring dashboards show expected metrics

---

## Quick Reference

### Common Commands

```bash
# List roles
curl -H "Auth: Bearer $TOKEN" /api/admin/rbac/roles

# Create custom role
curl -X POST -H "Auth: Bearer $TOKEN" \
  -d '{"name":"role","description":"desc"}' \
  /api/admin/rbac/roles

# List permissions
curl -H "Auth: Bearer $TOKEN" /api/admin/rbac/permissions

# Query audit log
curl -H "Auth: Bearer $TOKEN" \
  '/api/admin/audit?action=user_updated&limit=50'

# Check schema
wrangler d1 execute growchat --command "SELECT COUNT(*) FROM roles;"
```

### Incident Response

**If RBAC down, chat down**:
1. Rollback Worker
2. Verify chat still works
3. Investigate database

**If RBAC down, chat up**:
1. Check logs for schema errors
2. Verify database migration applied
3. Fix and redeploy

**If authorization too strict**:
1. Check user roles in database
2. Verify permission matrix
3. Check audit log for denials

---

## Contact & Escalation

- **On-Call Engineer**: [contact info]
- **Database Admin**: [contact info]
- **DevOps Lead**: [contact info]
- **CTO**: [contact info]

---

**Document Version**: 1.0
**Last Updated**: 2026-03-07
**Next Review**: 2026-04-07
