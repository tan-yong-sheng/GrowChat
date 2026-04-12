# Public API Routes

Routes accessible without authentication. Generated from `src/bootstrap/router-registry.js`.

> **Note:** `/api/users/me/resources/mcp-servers/oauth/callback` is listed in `PUBLIC_ROUTES` in the registry but requires the OAuth state parameter for validation, not user auth.

## Route Table

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/models` | List available models (paginated, searchable) |
| GET | `/api/models/:id` | Get model by ID |
| GET | `/api/health` | Health check (DB, KV, DO bindings) |
| POST | `/api/auth/register` | User registration (first user becomes admin) |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh` | Token refresh |
| POST | `/api/auth/logout` | Logout (refresh_token in body or Bearer) |
| GET | `/s/:shareId` | View shared chat (SPA or JSON) |
| GET | `/api/users/me/resources/mcp-servers/oauth/callback` | User MCP server OAuth callback |

See [auth-routes.md](./auth-routes.md) for full auth flow including password reset.
