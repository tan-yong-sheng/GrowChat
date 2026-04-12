# Routers

Routers are HTTP adapters. Feature routers may have subfolders for their canonical entry points (`admin/`, `chat/`, `models/`), but route handlers should stay thin and delegate business logic outward.

## Route Registration

All routers are registered in `src/bootstrap/router-registry.js`. See [`docs/api/`](../../docs/api/README.md) for complete API documentation.

## Router Files

| Router | Routes | Source |
|---|---|---|
| `public` | 9 | `src/routers/public.js` |
| `auth` | 6 | `src/routers/auth.js` |
| `chat` | 21 | `src/routers/chat/index.js` |
| `userSettings` | 18 | `src/routers/user-settings.js` |
| `users` | 6 | `src/routers/users.js` |
| `files` | 9 | `src/routers/files.js` |
| `admin` | 11 | `src/routers/admin/index.js` |
| `models` | 8 | `src/routers/models/index.js` |
| `groups` | 7 | `src/routers/groups.js` |
| `rbac` | 14 | `src/routers/rbac.js` |
| `realtime` | 1 | `src/routers/realtime.js` |
