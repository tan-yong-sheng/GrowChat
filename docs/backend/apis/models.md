# Models APIs

## `GET /api/models`
**Responsibility**: Lists all available LLM models merged from both global workspace connections and the user's personal connections, filtered by RBAC.

### Request
- `limit` (integer, optional)
- No auth required, but auth changes the response (applies personal overrides and ACLs).

### Response (200 OK)
- `models`: Array of model objects.
  - `id` (string)
  - `name` (string)
  - `provider` (string)
  - `context_length` (integer)
- `default_model` (string)

### Side Effects
- Hits upstream LLM APIs (e.g., `/v1/models`) to discover available models in parallel.

---

## `POST /api/models`
**Responsibility**: Adds custom model configuration manually (Admin only).

---

## `GET /api/models/:id`
**Responsibility**: Gets specific configuration details for a single model.

---

## `PUT /api/models/:id`
**Responsibility**: Updates model configuration (Admin only).

### Request
- `context_length`
- `vision_support`
- `enabled`

### Side Effects
- Writes to KV or DB settings to store model overrides.
