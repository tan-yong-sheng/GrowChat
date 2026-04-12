# Model Routes

Source: `src/routers/models/index.js` → `src/routers/models.js`

## Overview

Model routes handle listing, CRUD for custom models, and admin model management (enabled state, attachment caps, ACL access).

## Public Model Routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/models` | No | List available models (paginated, searchable, `scope=effective` for filtered view) |
| GET | `/api/models/:id` | No | Get model config by ID |

## Model Management (Authenticated)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| POST | `/api/models` | `model.admin` | Add custom model config |
| PUT | `/api/models/:id` | `model.admin` | Update custom model |
| DELETE | `/api/models/:id` | `model.admin` | Remove custom model |

## Admin Model Management

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/models` | `model.admin` | List models with enabled state |
| PUT | `/api/admin/models` | `model.admin` | Update model enabled state / attachment / access |
| GET | `/api/admin/models/access` | `model.admin` | Bulk model access rules |
| PUT | `/api/admin/models/access` | `model.admin` | Bulk model access update |
| GET | `/api/admin/models/:id/access` | `model.admin` | Single model access rules |
| PUT | `/api/admin/models/:id/access` | `model.admin` | Single model access update |

## Model ID Format

Model IDs in the frontend follow the format: `{connectionId}__{modelId}` (e.g., `conn_123__gpt-4`). If the user has only one enabled connection, the connection prefix may be omitted.
