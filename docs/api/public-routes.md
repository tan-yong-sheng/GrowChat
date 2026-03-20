# Public API Routes

Generated from `src/bootstrap/router-registry.js`.

| Method | Path | Description |
| --- | --- | --- |
| GET | /api/models | List available models |
| GET | /^\/api\/models\/[^/]+$/ | Get model by ID |
| GET | /api/health | Health check |
| POST | /api/auth/register | User registration |
| POST | /api/auth/login | User login |
| POST | /api/auth/refresh | Token refresh |
| POST | /api/auth/logout | Logout |
| GET | /^\/s\/[^/]+$/ | View shared chat |
