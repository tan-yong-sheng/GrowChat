# Structured Logging Architecture

> **Added:** `feature/structured-logging` (Issue #37)  
> **Module:** `src/utils/logger.js`

## Overview

All `console.log/error/warn/info/debug` calls in `src/` have been replaced with a structured JSON logger that emits one JSON object per log line. Every HTTP request receives a unique `requestId` (via `crypto.randomUUID()`) that is propagated through all log entries and included in error response bodies for support correlation.

## Log Entry Format

Each log entry is a single JSON object written via the matching `console.*` method:

```json
{
  "level": "info",
  "message": "Request processed",
  "timestamp": "2026-05-19T12:00:00.000Z",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "userId": "user-42",
  "path": "/api/chats",
  "duration_ms": 12
}
```

| Field       | Required    | Description                                                 |
| ----------- | ----------- | ----------------------------------------------------------- |
| `level`     | Always      | `debug`, `info`, `warn`, or `error`                         |
| `message`   | Always      | Human-readable log message (never overwritten by data keys) |
| `timestamp` | Always      | ISO 8601 UTC string                                         |
| `requestId` | Per-request | UUID correlating all logs for a single request              |
| `userId`    | After auth  | Authenticated user ID, added via `logger.child()`           |

Additional structured data is merged into the entry as top-level keys.

## Usage

### In request handlers (routers)

```js
import { createLogger } from '../utils/logger.js';

export async function myRouter(req, env, ctx, user, path) {
  const logger = createLogger(env); // respects LOG_LEVEL from env

  logger.info('Request started', { path, method: req.method });

  // After authentication:
  const authLogger = logger.child({ userId: user.sub });
  authLogger.info('Authenticated');
}
```

### Outside request lifecycle (utilities, services)

```js
import { createRootLogger } from '../utils/logger.js';
const logger = createRootLogger({});

export async function myUtility(db, id) {
  logger.warn('Table missing', { table: 'some_table' });
}
```

## LOG_LEVEL Environment Variable

| Value   | Output            |
| ------- | ----------------- |
| `debug` | All levels        |
| `info`  | info, warn, error |
| `warn`  | warn, error       |
| `error` | error only        |

- **Default in production:** `info` (set in `wrangler.jsonc`)
- **Default in local dev:** `debug` (set in `wrangler.jsonc`)
- Explicit `LOG_LEVEL` in env overrides environment-based defaults

## requestId Propagation

1. `src/index.js` generates a fresh `requestId` per request via `crypto.randomUUID()`
2. `createRequestContext(env)` returns `{ requestId, logger }`
3. After auth resolution, `logger.child({ userId })` enriches the logger
4. All `error()` response calls accept `requestId` in the `details` object
5. `src/utils/response.js` `error()` promotes `requestId` to top-level in JSON body:

```json
{
  "error": "An error occurred. Please try again later.",
  "requestId": "a1b2c3d4-..."
}
```

## API Reference

### `createLogger(env, context?)`

Creates a logger with optional request context.

- `env.LOG_LEVEL` — controls minimum severity
- `context.requestId` — per-request UUID
- `context.userId` — authenticated user

Returns: `{ debug, info, warn, error, child, level }`

### `createRootLogger(env)`

Creates a logger without request context. Equivalent to `createLogger(env, {})`.

### `resolveLogLevel(env)`

Resolves effective log level from env. Priority: `LOG_LEVEL` > `ENVIRONMENT` > default (`info`).

### `logger.child(extraContext)`

Creates a child logger merging additional context (e.g., `userId` after auth).

## Compatibility with Audit Logging

The structured logger coexists with `src/services/audit-logging.js`. Audit events are security-specific records stored in KV and logged via the structured logger when KV writes fail. The audit logging service is NOT replaced by the structured logger.

## Cloudflare Workers Compatibility

- No npm dependencies — uses built-in `crypto.randomUUID()` for requestId
- No Node.js APIs (`fs`, `path`, etc.)
- Logger is small (<100 lines) to respect Workers memory/CPU limits
- Uses `console.debug/info/warn/error` so Cloudflare's structured log viewer preserves severity
