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

---

## `GET /api/admin/usage`

**Responsibility**: Returns workspace usage metrics for the admin overview dashboard. Requires `admin.user.read` permission (default for GET admin routes).

### Response

```json
{
  "users": {
    "total": 42,
    "active_7d": 10,
    "active_30d": 25,
    "prev_active_7d": 8,
    "prev_active_30d": 20
  },
  "messages": {
    "daily": [
      { "day": "2026-05-19", "count": 42 },
      ...
    ],
    "weekly": [
      { "week": "2026-W20", "count": 150 },
      ...
    ],
    "daily_total": 250,
    "prev_daily_total": 200,
    "weekly_total": 1000,
    "prev_weekly_total": 800
  },
  "sparks": {
    "total": 500,
    "last_30d": 100,
    "prev_30d": 80
  }
}
```

### Data Sources

- **Users**: `users` table — total count, active by `last_active_at` threshold
- **Messages**: `messages` table — grouped by day/week using `date()` and `strftime()`
- **Sparks**: `messages` table where `role = 'assistant'` — proxy for LLM API calls

### Performance Notes

- All queries use `COUNT` with `WHERE` date filters — no full table scans
- `idx_users_last_active_at` and `idx_messages_created_at` indexes support the date range queries
- Previous period values are included for trend indicator computation (↑↓→)
