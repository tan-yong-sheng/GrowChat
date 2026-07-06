# Router Dispatcher Pattern

## Purpose

Keep HTTP routers thin, testable, and below the complexity thresholds enforced by Fallow and ESLint. A router should only decide which request matches which handler; business logic, authorization, and input parsing live elsewhere.

## Pattern

Every monolithic route handler is split into three layers:

```
src/routers/<domain>/<router>.js          # dispatcher
src/routers/<domain>/<router>.handlers.js # per-route handlers
src/routers/<domain>/<router>.helpers.js  # shared helpers (optional)
```

For simple routers the helpers file can be omitted; for routers with many shared concerns it keeps handlers focused.

## Dispatcher Responsibilities

- Match the request method and path.
- Return a handler result (usually a `Response`).
- Return `null` when the path does not match so the caller can fall through to the next router.
- Perform early, request-level guards (e.g., account pending checks) once a route is matched.
- **Do not** inline role checks, permission decisions, or validation logic; delegate to `authorize.js`, `role-policy`, and `validation/request.js`.

Example shape:

```js
const ROUTES = [
  { method: 'GET', match: isListPath, handler: listItems },
  { method: 'POST', match: isListPath, handler: createItem },
  { method: 'GET', match: isDetailPath, handler: getItem },
  { method: 'PUT', match: isDetailPath, handler: updateItem },
  { method: 'DELETE', match: isDetailPath, handler: deleteItem },
];

export async function handleItems(req, env, ctx, user, path, deps) {
  const matched = findRoute(req.method, path);
  if (!matched) return null;
  if (isAccountPending(user)) return accountPendingResponse(req);
  return matched.route.handler(req, env, user, matched.params, deps);
}
```

## Handler Responsibilities

- Receive `(req, env, user, params, deps)`.
- Parse the body, call services, and return a response.
- Use helpers for repeated tasks such as:
  - reading and validating JSON bodies,
  - formatting audit events,
  - building error responses.

## Helper Responsibilities

- Pure, reusable functions with no side effects.
- Avoid capturing router state; accept inputs explicitly.
- Typical helpers:
  - `readJsonBody(req)` — safe JSON parsing with a typed error.
  - `auditEvent(env, user, action, resourceId)` — emit audit logs.
  - `isAccountPending(user)` — reusable guard check.
  - `buildTestConnection(...)` — shape connection-test payloads.

## Conventions

- Keep every dispatcher and handler below **30 cyclomatic** and **30 cognitive** complexity.
- Keep handlers below **220 lines**; extract earlier rather than later.
- Preserve exact response shapes, status codes, and audit metadata when refactoring an existing router.
- Use the same public function name and signature as the original monolithic handler so existing tests continue to pass.
- Add tests for the dispatcher route-matching edge cases (unknown methods, malformed IDs, fall-through).

## Examples in the Codebase

- `src/routers/users/users-connections.js` — dispatcher with list/create/update/delete/test handlers.
- `src/routers/models/models-public-crud.js` — dispatcher for public model CRUD.
- `src/routers/models/models-admin-access.js` — dispatcher with bulk and per-model access handlers.
- `src/routers/files.js` — dispatcher for file upload/management.

## When to Apply

Apply this pattern whenever a router function:

- exceeds 30 cyclomatic or cognitive complexity,
- has more than three route branches,
- mixes routing with business logic, or
- appears in `fallow health --complexity` output.

## Anti-Patterns

- Adding new route branches to an already large `if/else` chain.
- Inlining role/permission checks in the dispatcher.
- Returning generic 404 from the dispatcher when the path matches but the method does not; return `405 Method Not Allowed` instead when the resource path is known.
- Sharing mutable state between handlers via closures.
