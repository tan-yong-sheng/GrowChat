# Database Schema

GrowChat uses Cloudflare D1 (SQLite). Migrations are **forward-only, sequentially numbered**, applied at startup by `src/bootstrap/migration-runner.js`. New schema changes should be additive only; filenames must stay sequential. Validation runs before deploy to catch duplicates and ordering mistakes.

**Migration files:** `migrations/001_initial.sql`, `002_settings_permissions.sql`, `003_password_reset_tokens.sql`, `005_message_editing.sql`, `006_audit_logging.sql`, `007_reduction.sql`

## Core Tables (22 tables)

### Auth & Users

| Table                       | Columns                                                                                                                                                                                       | Notes                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **`users`**                 | `id` PK, `email` UNIQUE, `password_hash`, `name`, `account_status`, `settings` (JSON), `preferences` (JSON), `avatar`, `avatar_emoji`, `status`, `last_active_at`, `created_at`, `updated_at` | `account_status`: `'active'` \| `'pending'`. `status`: `'online'` \| `'away'` \| `'offline'` |
| **`refresh_tokens`**        | `id` PK, `user_id` (FK→users), `token_hash`, `expires_at`, `created_at`                                                                                                                       | SHA-256 hashed, 7-day TTL, stored in KV                                                      |
| **`password_reset_tokens`** | `id` PK, `user_id` (FK→users), `token_hash` UNIQUE, `expires_at`, `created_at`                                                                                                                | Added in migration 003, for forgot-password flow                                             |

### Chat

| Table                | Columns                                                                                                                                                                                         | Notes                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **`chats`**          | `id` PK, `user_id` (FK→users), `title`, `model`, `pinned`, `share_id` UNIQUE, `archived`, `current_message_id`, `created_at`, `updated_at`                                                      | ON DELETE CASCADE from users                                                                                               |
| **`messages`**       | `id` PK, `chat_id` (FK→chats), `role`, `content`, `model`, `citations` (JSON), `parent_id`, `status`, `error_code`, `error_message`, `tool_calls` (JSON), `message_blocks` (JSON), `created_at` | `role`: `'user'` \| `'assistant'` \| `'system'`. `status`: `'streaming'` \| `'tool_running'` \| `'cancelled'` \| `'error'` |
| **`message_deltas`** | `message_id` CK PK, `seq` CK PK, `payload` (JSON), `created_at`                                                                                                                                 | Composite primary key. SSE resume capability                                                                               |

### Files & Documents

| Table                   | Columns                                                                                                                                                                                                         | Notes                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **`documents`**         | `id` PK, `user_id` (FK→users), `chat_id` (FK→chats, SET NULL), `filename`, `content_type`, `file_size`, `r2_key`, `r2_url`, `text_excerpt`, `extraction_status`, `extraction_error`, `created_at`, `updated_at` | `extraction_status`: `-1` (error) \| `0` (pending) \| `1` (complete) |
| **`message_documents`** | `id` PK, `message_id` (FK→messages), `document_id` (FK→documents), `mention_type`, `created_at`                                                                                                                 | Many-to-many linking messages to attached documents                  |

### RBAC (Roles, Permissions, ACL)

| Table                   | Columns                                                                                                             | Notes                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **`roles`**             | `id` PK, `name` UNIQUE, `system` (0/1), `created_at`                                                                | Seeds: `admin`, `member`             |
| **`permissions`**       | `id` PK, `key` UNIQUE, `description`, `created_at`                                                                  | 40+ permission keys across 5 domains |
| **`role_permissions`**  | `id` PK, `role_id` (FK→roles), `permission_id` (FK→permissions), `created_at`                                       | Unique: (role_id, permission_id)     |
| **`user_roles`**        | `id` PK, `user_id` (FK→users), `role_id` (FK→roles), `created_at`                                                   | Unique: (user_id, role_id)           |
| **`groups`**            | `id` PK, `name` UNIQUE, `description`, `is_system` (0/1), `created_at`, `updated_at`                                | Admin-created user groups            |
| **`group_members`**     | `id` PK, `group_id` (FK→groups), `user_id` (FK→users), `created_at`                                                 | Unique: (group_id, user_id)          |
| **`group_permissions`** | `id` PK, `group_id` (FK→groups), `permission_id` (FK→permissions), `created_at`                                     | Unique: (group_id, permission_id)    |
| **`audit_log`**         | `id` PK, `actor_id` (FK→users, SET NULL), `action`, `resource_type`, `resource_id`, `metadata` (JSON), `created_at` | Paginated, indexed by creation time  |

### Resources (Connections, Tool Servers, Custom Models)

| Table                   | Columns                                                                                                                                                                                       | Notes                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **`user_connections`**  | `id` PK, `user_id` (FK→users), `name`, `provider_type`, `base_url`, `key`, `headers` (JSON), `auth_type`, `enabled`, `manual_models` (JSON), `manual_models_mode`, `created_at`, `updated_at` | Unique: (user_id, id). `provider_type` default: `'openai-compatible'` |
| **`user_tool_servers`** | `id` PK, `user_id` (FK→users), `server_json`, `created_at`, `updated_at`                                                                                                                      | Unique: (user_id, id). JSON-encoded MCP server config                 |
| **`custom_models`**     | `id` PK, `name`, `provider`, `base_url`, `description`, `max_tokens`, `temperature`, `created_at`                                                                                             | Admin-defined model configurations                                    |
| **`model_access`**      | `model_id` PK, `is_enabled`, `updated_at`                                                                                                                                                     | Per-model enabled/disabled flag                                       |

#### ACL Tables (3 parallel structures)

| Table                       | Columns                                                                                               | Notes                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **`model_acl_rules`**       | `id` PK, `model_id`, `principal_type`, `principal_id`, `effect`, `action`, `created_at`, `updated_at` | `principal_type`: `'user'` \| `'group'`. `effect`: `'allow'` \| `'deny'` |
| **`connection_acl_rules`**  | Idem                                                                                                  | Same structure for connections                                           |
| **`tool_server_acl_rules`** | Idem                                                                                                  | Same structure for tool servers                                          |

### System

| Table            | Columns                         | Notes                                                                       |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------- |
| **`app_config`** | `key` PK, `value`, `updated_at` | Key-value store for app settings (registration toggle, default model, etc.) |

## Seed Data

Migration 001 seeds:

- **2 system roles**: `admin`, `member`
- **12 baseline permissions**: `chat.read`, `chat.write`, `chat.delete`, `chat.share`, `model.use`, `model.admin`, `file.upload`, `file.delete`, `admin.user.read`, `admin.user.write`, `admin.audit.read`, `admin.rbac.admin`
- **16 role-permission bindings**: admin gets all 12; member gets 4 (`chat.read`, `chat.write`, `model.use`, `file.upload`)

Migration 002 adds:

- **28 new permissions**: user settings (5), admin settings (6), connection/control (3), model/control (3), tool-server (3), integration (3), connection.use
- **33 role-permission bindings**: member gets personal settings + use-level; admin gets full admin-level permissions

## Key Relationships

```
users ─┬─→ chats ──→ messages ──→ message_deltas
       │                       ↕
       │                    message_documents
       │                       ↕
       │                 documents ──→ (R2: r2_key)
       │
       ├─→ refresh_tokens
       ├─→ password_reset_tokens
       ├─→ user_roles ──→ roles ──→ role_permissions ──→ permissions
       ├─→ user_connections
       ├─→ user_tool_servers
       ├─→ documents
       └─→ audit_log (actor_id, SET NULL)

groups ──→ group_members ──→ users
       └─→ group_permissions ──→ permissions

model_acl_rules ──→ models (model_id string reference)
connection_acl_rules ──→ connections (connection_id string reference)
tool_server_acl_rules ──→ tool_servers (tool_server_id string reference)

app_config ─── (key-value, no FKs)
custom_models ─── (standalone, admin-managed)
model_access ─── (model_id PK, no FK to custom_models)
```

## Index Summary

- **Hot query paths** covered: user→chats by updated_at, messages by chat+date, documents by user+status
- **ACL lookups**: indexed by (model/connection/tool_server)_id and (principal_type, principal_id)
- **Audit log**: indexed by creation time DESC for paginated queries

### `email_verifications` (REMOVED in migration 007)

The `email_verifications` table was dropped in `migrations/007_reduction.sql`. Email verification has been removed from the auth flow.

### `documents.extraction_status`

Always set to `1` (done) on insert. The column is retained for backward compatibility but no extraction work is performed.
