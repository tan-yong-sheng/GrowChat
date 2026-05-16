# Admin & User Settings APIs

## `GET /api/admin/config`
**Responsibility**: Retrieves global workspace configurations (like public registration status, default models). Requires `admin.user.read` permission.

### Response
- `public_registration` (boolean)
- `registration_status` (string: `active` | `pending`)
- `default_model_id` (string)

---

## `PUT /api/admin/config`
**Responsibility**: Updates global workspace config. Requires `admin.user.write` permission.

### Side Effects
- Writes to `kv_settings` (or config table).
- Logs audit event.

---

## `GET /api/admin/openai/connections`
**Responsibility**: Lists all workspace-level OpenAI-compatible API providers.

---

## `PUT /api/admin/openai/connections`
**Responsibility**: Updates workspace LLM connections.

### Request Payload Requirements
- `providerType`: Must map to valid enum.
- `url`: Must validate `http://` or `https://`.
- `key` and `headers`: Must be `< 4096` characters.

---

## `GET /api/admin/users/:id/access`
**Responsibility**: An internal inspector tool to evaluate the effective RBAC and ACLs of any given user, resolving group memberships and role policies down to exact accessible resources (models, connections, MCP servers).

### Response
- `user`: sanitized profile
- `groups`: array of group memberships
- `role_permissions`: array of flat string permissions (e.g., `['admin.user.read']`)
- `access`:
  - `models`: specific model IDs they can use.
  - `connections`: specific connections they can view/use.
  - `mcp_servers`: specific MCP tool servers available to them.
