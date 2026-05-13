# Users & Profile APIs

## `GET /api/users/me`
**Responsibility**: Returns the authenticated user's profile, settings, and optionally their permissions and roles.

### Request
- `include`: Comma-separated list (`permissions`, `roles`, `all`)

### Response
- `user`: Sanitized user record.
- `permissions`: Array of flattened string permissions (if requested).
- `roles`: Array of role objects (if requested).

---

## `PUT /api/users/me`
**Responsibility**: Updates the user's profile and settings.

### Side Effects
- Writes to the `users` table (`name`, `avatar`, `settings`, `preferences`).

---

## `GET /api/users/me/resources/connections`
**Responsibility**: Lists all LLM connections available to the user. This is a complex endpoint that merges global workspace connections with the user's personal connections, resolving visibility based on the user's roles and personal overrides.

---

## `POST /api/users/me/resources/mcp-servers/oauth/start`
**Responsibility**: Initiates the OAuth flow for a user's personal Model Context Protocol (MCP) server.

### Side Effects
- Discovers OAuth metadata from the provided `authorization_server`.
- Dynamically registers an OAuth client (if needed/supported).
- Generates a PKCE code challenge and state.
- Stores the transient state in `user_tool_servers` table (`oauth_state`, `oauth_code_verifier`).
- Returns the full `authorization_url` to the client.
