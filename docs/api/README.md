# API Documentation Index

## Route Categories

| Document | Coverage | Route Count |
| --- | --- | --- |
| [public-routes.md](./public-routes.md) | Public, no auth required | 9 |
| [auth-routes.md](./auth-routes.md) | Registration, login, refresh, logout, password reset | 6 (+ password reset) |
| [user-routes.md](./user-routes.md) | Profile, settings, connections, MCP servers, admin user management | 25 |
| [chat-routes.md](./chat-routes.md) | Chat CRUD, sharing, messages, streaming, realtime | 22 |
| [files-routes.md](./files-routes.md) | Upload, R2, document management | 9 |
| [models-routes.md](./models-routes.md) | Public models, admin model management | 8 |
| [admin-routes.md](./admin-routes.md) | Config, connections, tool servers, email | 11 |
| [rbac-routes.md](./rbac-routes.md) | Roles, permissions, bindings, groups, audit log | 14 |
| **Total** | | **68+** (all routes from all 11 routers, realtime included in [chat-routes.md](./chat-routes.md)) |

> **Source of Truth:** All routes are registered in `src/bootstrap/router-registry.js`. Public routes listed in `PUBLIC_ROUTES` constant.
