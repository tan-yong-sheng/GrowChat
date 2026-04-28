# RBAC & Groups Routes

## RBAC Routes (`src/routers/rbac.js`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/rbac/roles` | `admin.rbac.admin` | List all roles with permissions |
| POST | `/api/admin/rbac/roles` | `admin.rbac.admin` | Create custom role |
| PUT | `/api/admin/rbac/roles/:id` | `admin.rbac.admin` | Update custom role |
| DELETE | `/api/admin/rbac/roles/:id` | `admin.rbac.admin` | Delete custom role |
| GET | `/api/admin/rbac/permissions` | `admin.rbac.admin` | List all permissions (grouped) |
| POST | `/api/admin/rbac/bindings` | `admin.rbac.admin` | Create role-permission binding |
| GET | `/api/admin/audit` | `admin.audit.read` | List audit log (paginated) |

## Groups Routes (`src/routers/groups.js`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/groups` | `admin.user.read` | List all groups |
| POST | `/api/admin/groups` | `admin.user.write` | Create group |
| GET | `/api/admin/groups/:id` | `admin.user.read` | Get group + members |
| PUT | `/api/admin/groups/:id` | `admin.user.write` | Update group |
| DELETE | `/api/admin/groups/:id` | `admin.user.write` | Delete group |
| POST | `/api/admin/groups/:id/users` | `admin.user.write` | Add members to group |
| DELETE | `/api/admin/groups/:id/users` | `admin.user.write` | Remove members from group |

## RBAC Seed Data

The initial database migration (`001_initial.sql`) seeds the following roles:

- `admin` — full administrative access
- `member` — standard user with chat, file, and model access

Permissions are grouped by domain: `admin.*`, `chat.*`, `file.*`, `model.*`, and custom model management permissions.
