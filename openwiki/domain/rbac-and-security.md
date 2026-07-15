# RBAC, Authorization & Security

## Permission Model

GrowChat implements a **deny-by-default** authorization model with machine-readable denial reasons.

### Key Concepts

| Concept         | Description                                                            |
| --------------- | ---------------------------------------------------------------------- |
| **Roles**       | Named sets of permissions (e.g., "admin", "member", custom roles)      |
| **Permissions** | Granular string keys (e.g., `connections:create`, `users:manage`)      |
| **Groups**      | Collections of users for ACL targeting                                 |
| **Bindings**    | User-to-role assignments (can be direct or via group membership)       |
| **Scopes**      | `admin`, `role:{roleName}`, `group:{groupId}`, `user:{userId}`, `self` |

### Permission Resolution

```
resolvePermissions(db, user)
  → Query: SELECT DISTINCT permission keys
     FROM role_permissions rp
     JOIN user_bindings ub ON ub.role_id = rp.role_id
     WHERE ub.user_id = ? AND ub.enabled = 1
```

Defined in `src/utils/authorize.js`.

### Denial Reasons

| Code                    | Meaning                            |
| ----------------------- | ---------------------------------- |
| `missing_permission`    | User lacks required permission key |
| `account_not_active`    | Account is pending or deactivated  |
| `last_owner_protected`  | Cannot remove last owner role      |
| `system_role_immutable` | Cannot modify system roles         |
| `invalid_request`       | Malformed authorization request    |

## ACL Systems

Three parallel ACL systems control access to resources:

### 1. Connection ACL (`src/utils/connection-acl.js`)

Controls which users can see/use LLM provider connections.

**Scope types:**

- `admin` — Admin-only connections
- `role:{roleName}` — Specific roles
- `group:{groupId}` — Group members
- `user:{userId}` — Specific users
- `self` — Self-managed connections

**Enforcement points:**

- `admin-connections-access.js` — Admin configures ACL rules
- `connections-user.js` — User's available connections filtered by ACL
- `message-input-tool-selection.js` — Model selector shows only permitted models

### 2. Model ACL (`src/utils/model-acl.js`)

Controls which models users can select in the chat interface. Mirrors the same scope system as connection ACLs.

**Enforcement:**

- `models-helpers.js` — Model listing filtered by ACL
- `model-selector-controller.js` — UI model selector checks permissions

### 3. Tool Server ACL (`src/utils/tool-server-acl.js`)

Controls MCP tool access per user.

**Enforcement:**

- `admin-tool-servers-access.js` — Admin tool server ACL management
- `chat/mcp.js` — `shouldSkipMcpTool()` checks tool visibility
- `assistant-runner.js` — Tools filtered before sending to LLM

## Authorization Audit

All authorization checks can optionally log to the `audit_log` table for security monitoring.

- `src/utils/authorize-audit.js` — Authorization event logging
- `src/services/audit-log.js` — Audit log write service
- `src/routers/admin/admin-config-audit-logs.js` — Audit log viewing

## CSRF Protection

- `src/services/csrf.js` — CSRF token generation and validation for state-changing operations

## Rate Limiting

- `src/services/rate-limit.js` — Configurable rate limiting per endpoint

## Security Headers

Applied to all responses via `src/utils/response.js`:

| Header                      | Value                                          |
| --------------------------- | ---------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                      |
| `X-Frame-Options`           | `DENY`                                         |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`              |
| `Permissions-Policy`        | Restrictive (no geolocation, camera, etc.)     |
| `Content-Security-Policy`   | Self + CDN scripts/styles                      |
| SRI                         | Generated SHA-384 hashes for JS/CSS assets     |

## Email Security

- Configurable via admin panel (`admin-email-security.js`)
- Supports Resend as email provider
- Email verification for new accounts
- Password reset via email links

## Key Source Files

| File                                              | Purpose                          |
| ------------------------------------------------- | -------------------------------- |
| `src/utils/authorize.js`                          | Centralized authorization engine |
| `src/utils/connection-acl.js`                     | Connection-level ACL enforcement |
| `src/utils/model-acl.js`                          | Model-level ACL enforcement      |
| `src/utils/tool-server-acl.js`                    | Tool server ACL enforcement      |
| `src/utils/authorize-audit.js`                    | Authorization audit logging      |
| `src/utils/acl-shared.js`                         | Shared ACL utilities             |
| `src/utils/acl-rule-filter.js`                    | ACL rule matching                |
| `src/services/csrf.js`                            | CSRF protection                  |
| `src/services/rate-limit.js`                      | Rate limiting                    |
| `src/services/audit-log.js`                       | Audit log write service          |
| `src/routers/admin/admin-connections-access.js`   | Admin connection ACL UI          |
| `src/routers/admin/admin-tool-servers-access.js`  | Admin tool server ACL UI         |
| `src/routers/rbac-*.js`                           | RBAC CRUD endpoints              |
| `public/js/shared/utils/workspace-permissions.js` | Client-side permission helpers   |
