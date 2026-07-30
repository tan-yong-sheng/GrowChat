# Refactor Plan: `src/routers/users/users-connections.js`

## Current State

| Metric                | Value                                    |
| --------------------- | ---------------------------------------- |
| File                  | `src/routers/users/users-connections.js` |
| Function              | `handleUsersConnections`                 |
| Lines                 | 256                                      |
| Cyclomatic complexity | **89**                                   |
| Cognitive complexity  | **100**                                  |
| Goal                  | Both **< 30**                            |

The function is the sole export and currently acts as router + 5 independent route handlers + test-connection orchestrator.

## Root Causes of High Complexity

1. **Single function does everything** — routing, guards, body parsing, CRUD, audit logging, and a full connection-test pipeline.
2. **Repeated guard clauses** — the `account_status` pending check appears 5 times (copy-paste).
3. **Repeated body parsing** — the `req.json()` + 400-on-failure pattern appears 3 times.
4. **Monolithic test route** — `POST /connections/test` is ~95 lines with nested validation, header parsing, discovery, and model formatting.
5. **Sequential `if` dispatch** — route matching is a long chain of `if` statements instead of a lookup table.
6. **Inline callback complexity** — the discovered-models `.map()` callback contains nested ternaries and multiple fallback chains.

## Recommended Architecture

Split into three modules inside `src/routers/users/`:

| File                            | Responsibility                                                             |
| ------------------------------- | -------------------------------------------------------------------------- |
| `users-connections.js`          | Public entry point and route dispatcher only.                              |
| `users-connections.handlers.js` | The five route handlers (`list`, `create`, `update`, `delete`, `test`).    |
| `users-connections.helpers.js`  | Shared guards, body parsing, audit wrapping, and test-connection builders. |

## 1. Functions/Methods to Extract Into Separate Modules

### Into `users-connections.handlers.js`

| Function                                                   | Responsibility                                   |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `listUserConnections(req, env, user, deps)`                | `GET /api/users/me/resources/connections`        |
| `createUserConnection(req, env, user, deps)`               | `POST /api/users/me/resources/connections`       |
| `updateUserConnection(req, env, user, connectionId, deps)` | `PUT /api/users/me/resources/connections/:id`    |
| `deleteUserConnection(req, env, user, connectionId, deps)` | `DELETE /api/users/me/resources/connections/:id` |
| `testUserConnection(req, env, user, deps)`                 | `POST /api/users/me/resources/connections/test`  |

### Into `users-connections.helpers.js`

| Function                                                                        | Responsibility                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `isAccountPending(user)`                                                        | Single guard check replacing 5 copy-pasted clauses. |
| `readJsonBody(req)`                                                             | Parse JSON body or throw `ValidationError`.         |
| `auditConnectionEvent(env, user, action, connectionId)`                         | Wrap `logAuditEvent` for connection actions.        |
| `resolveTestProviderType(body, existingConnection)`                             | Pick provider type from body or existing config.    |
| `resolveTestBaseUrl(body, existingConnection, providerType)`                    | Resolve, default, and validate base URL.            |
| `parseConnectionHeaders(body, existingConnection)`                              | Parse string/object headers with validation.        |
| `buildTestConnection(body, existingConnection, providerType, baseUrl, headers)` | Assemble connection object for discovery.           |
| `formatDiscoveredModels(items)`                                                 | Map/filter discovery items to `{ id, name }`.       |
| `buildDiscoverySuccessResponse(req, discovery)`                                 | Return 200 with models.                             |
| `buildDiscoveryFailureResponse(req, discovery, logger)`                         | Return 502 with safe upstream reason.               |

## 2. Switch/If-Else Chains → Early Returns + Map Dispatcher

### Before

A flat chain of `if (method === 'X' && path === 'Y')` blocks with nested inner `if` statements.

### After

A route table with matcher functions and a dispatcher that exits early.

```js
const PERSONAL_CONNECTION_RE = /^\/api\/users\/me\/resources\/connections\/(?!test$)([^/]+)$/;

const ROUTES = [
  {
    method: 'GET',
    match: (p) => (p === '/api/users/me/resources/connections' ? {} : null),
    handler: listUserConnections,
  },
  {
    method: 'POST',
    match: (p) => (p === '/api/users/me/resources/connections' ? {} : null),
    handler: createUserConnection,
  },
  {
    method: 'POST',
    match: (p) => (p === '/api/users/me/resources/connections/test' ? {} : null),
    handler: testUserConnection,
  },
  { method: 'PUT', match: matchPersonalConnection, handler: updateUserConnection },
  { method: 'DELETE', match: matchPersonalConnection, handler: deleteUserConnection },
];

function matchPersonalConnection(path) {
  const m = path.match(PERSONAL_CONNECTION_RE);
  return m ? { connectionId: m[1] } : null;
}

export async function handleUsersConnections(req, env, ctx, user, path, deps) {
  const route = ROUTES.find((r) => r.method === req.method && r.match(path));
  if (!route) return null;
  if (isAccountPending(user)) {
    return error(req, 'Account pending approval.', 403);
  }
  const params = route.match(path);
  return route.handler(req, env, user, params, deps);
}
```

### Per-Route Early Returns

Each handler becomes a flat sequence of guards:

```js
export async function updateUserConnection(req, env, user, { connectionId }, deps) {
  const body = await readJsonBody(req);
  const db = createDB(env.DB);
  const updated = await updateUserOpenAIConnection({
    db,
    userId: user.sub,
    connectionId,
    input: body,
  });
  if (!updated) return error(req, 'Connection not found', 404);
  await auditConnectionEvent(env, user, 'user_connection_updated', connectionId);
  return json(req, { connection: toPersonalConnectionSummary(updated) });
}
```

Errors are normalized by a shared wrapper (e.g. `withConnectionErrorHandling(handler)`) or by keeping one `try/catch` per handler that maps `ValidationError` → 400 and unexpected errors → 400/500.

## 3. Async Callback Chains → Async/Await

The current file already uses `async/await`, but the connection-test pipeline mixes inline `.map()` callbacks and dependent awaits. Refactor:

- Extract the model-formatting `.map()` callback into the synchronous helper `formatDiscoveredModels(items)`.
- Keep discovery as a single `await discoverConnectionModels(...)` call.
- Avoid chaining `.then()`/`.catch()` on the `req.json()` promise; keep the explicit `try { body = await req.json(); }` or move it into `readJsonBody(req)`.

Example:

```js
export async function testUserConnection(req, env, user, _params, deps) {
  const body = await readJsonBody(req);
  const db = createDB(env.DB);
  const existing = await loadExistingConnectionForTest(db, user.sub, body);

  const providerType = resolveTestProviderType(body, existing);
  const baseUrl = resolveTestBaseUrl(body, existing, providerType);
  if (baseUrl.error) return error(req, baseUrl.error, 400);

  const headers = parseConnectionHeaders(body, existing);
  if (headers.error) return error(req, headers.error, 400);

  const connection = buildTestConnection(
    body,
    existing,
    providerType,
    baseUrl.value,
    headers.value
  );
  const discovery = await discoverConnectionModels(connection, {
    headers: buildConnectionHeaders(connection),
  });

  if (!discovery.items.length) {
    return buildDiscoveryFailureResponse(req, discovery, deps.logger);
  }
  return buildDiscoverySuccessResponse(req, discovery);
}
```

## 4. Guard Clauses Replacing Nested Ifs

### Account-status guard

Replace each occurrence of:

```js
if (user.account_status && user.account_status !== 'active') {
  return error(req, 'Account pending approval.', 403);
}
```

with a single helper:

```js
export function isAccountPending(user) {
  return Boolean(user?.account_status && user.account_status !== 'active');
}
```

The dispatcher checks it once before invoking any handler.

### Header parsing guard

Replace the nested `try/catch` + `if/else-if` header block with early returns:

```js
export function parseConnectionHeaders(body, existingConnection) {
  if (!body.headers) {
    return { value: existingConnection?.headers || {} };
  }
  if (typeof body.headers === 'object' && !Array.isArray(body.headers)) {
    return { value: body.headers };
  }
  if (typeof body.headers === 'string' && body.headers.trim()) {
    const parsed = JSON.parse(body.headers);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError('Headers must be a JSON object');
    }
    return { value: parsed };
  }
  return { value: existingConnection?.headers || {} };
}
```

### URL validation guard

Replace sequential checks with a helper that returns `{ ok, error }`:

```js
export function resolveTestBaseUrl(body, existingConnection, providerType) {
  const raw = String(body.base_url || body.baseUrl || existingConnection?.baseUrl || '').trim();
  const baseUrl = raw || getConnectionDefaultBaseUrl(providerType);

  if (isConnectionUrlRequired(providerType) && !raw) {
    return { error: 'Connection URL is required for compatible providers' };
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    return { error: 'Connection URL must start with http:// or https://' };
  }
  const safety = isSafeOutboundUrl(baseUrl);
  if (!safety.safe) {
    return { error: safety.reason };
  }
  return { value: baseUrl };
}
```

## Target Complexities & Estimated Savings

| Function / Module                     | Before (cyc / cog)      | After (cyc / cog) | Estimated Savings    |
| ------------------------------------- | ----------------------- | ----------------- | -------------------- |
| `handleUsersConnections` (dispatcher) | **89 / 100**            | **~8 / ~8**       | **-81 cyc, -92 cog** |
| `listUserConnections`                 | inline                  | ~3 / ~3           | —                    |
| `createUserConnection`                | inline                  | ~6 / ~6           | —                    |
| `updateUserConnection`                | inline                  | ~7 / ~7           | —                    |
| `deleteUserConnection`                | inline                  | ~5 / ~5           | —                    |
| `testUserConnection`                  | inline ~45 / ~50        | ~12 / ~14         | ~-33 cyc, ~-36 cog   |
| `formatDiscoveredModels`              | inline callback ~6 / ~8 | ~4 / ~5           | extracted            |
| All helpers                           | —                       | <8 / <8           | —                    |
| **File total (sum)**                  | **89 / 100**            | **~45 / ~50**     | ~-44 cyc, ~-50 cog   |

All proposed functions fall **well below the 30 threshold**.

## Implementation Steps

1. **Add shared guard** — create `src/routers/users/users-connections.helpers.js` with `isAccountPending`, `readJsonBody`, `auditConnectionEvent`, and all test-connection helpers.
2. **Create handlers module** — create `src/routers/users/users-connections.handlers.js` with the five route handlers; import helpers from step 1.
3. **Rewrite dispatcher** — reduce `src/routers/users/users-connections.js` to imports + `ROUTES` table + `handleUsersConnections`.
4. **Preserve behavior** — keep exact response status codes, error messages, audit metadata, and route matching order.
5. **Run tests**:
   - `pnpm test src/routers/users/users-connections.test.js`
   - `pnpm test src/routers/connections-user.test.js`
6. **Verify complexity**:
   - `pnpm exec fallow health --complexity --max-cyclomatic 30 --max-cognitive 30`
7. **Run lint**:
   - `pnpm run lint`

## Testing & Risk Notes

- The existing unit tests mock the same external imports; the public `handleUsersConnections` export and call signatures must stay unchanged so tests pass without modification.
- The `test` path must continue to be excluded by the personal-connection regex.
- Error handling order matters: route matching happens first, then account-status guard, then body parsing. Do not swap the order.
- `logAuditEvent` calls must preserve `actor_id`, `action`, `resource_type`, `resource_id`, and `metadata` shape.
- E2E connection tests should be re-run because the test route has the most behavioral surface area.
