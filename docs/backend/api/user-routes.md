# User Routes (Profile & Resources)

Source: `src/routers/users.js`, `src/routers/user-settings.js`

## User Profile (`/api/users/me`)

### GET `/api/users/me`

Get current user's profile.

**Query Parameters:**
- `include` — Comma-separated: `permissions`, `roles`

### PUT `/api/users/me`

Update current user profile (name, avatar, emoji, status, preferences, settings).

### POST `/api/users/me/update`

Update current user profile (without settings field).

### GET `/api/users/me/permissions`

Get effective permissions for current user.

### GET `/api/users/me/roles`

Get roles assigned to current user.

### GET `/api/users/me/settings`

Get combined workspace + user settings with capability flags.

## User Connections & MCP Servers (`/api/users/me/resources/`)

### Connections

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/users/me/resources/connections` | List workspace + personal connections |
| POST | `/api/users/me/resources/connections` | Create personal connection |
| POST | `/api/users/me/resources/connections/test` | Test personal connection |
| PUT | `/api/users/me/resources/connections/:id` | Update personal connection |
| DELETE | `/api/users/me/resources/connections/:id` | Delete personal connection |

### MCP Servers

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/users/me/resources/mcp-servers` | List workspace + personal MCP servers |
| POST | `/api/users/me/resources/mcp-servers` | Create personal MCP server |
| POST | `/api/users/me/resources/mcp-servers/test` | Test personal MCP server |
| POST | `/api/users/me/resources/mcp-servers/oauth/start` | Start user MCP OAuth flow |
| GET | `/api/users/me/resources/mcp-servers/oauth/callback` | MCP OAuth callback (state-based, no auth required) |
| PUT | `/api/users/me/resources/mcp-servers/:id` | Update personal MCP server |
| DELETE | `/api/users/me/resources/mcp-servers/:id` | Delete personal MCP server |

## Admin User Management (`/api/admin/users`)

Source: `src/routers/users.js` (admin section)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/users` | `admin.user.read` | List all users (paginated) |
| POST | `/api/admin/users` | `admin.user.write` | Create user |
| POST | `/api/admin/users/import` | `admin.user.write` | Bulk import users from CSV |
| GET | `/api/admin/users/:id` | `admin.user.read` | Get specific user |
| PUT | `/api/admin/users/:id` | `admin.user.write` | Update user fields |
| DELETE | `/api/admin/users/:id` | `admin.user.write` | Delete user |
| GET | `/api/admin/users/:id/access` | `admin.user.read` | Inspect user's effective ACL access |
