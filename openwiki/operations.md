# Operations & Testing

## Deployment

### Prerequisites

- Node.js 18+, pnpm, Cloudflare account
- Wrangler CLI configured

### Automated Setup

```bash
git clone <repo>
cd GrowChat
pnpm install
pnpm run setup          # Creates resources, applies migrations, sets secrets, deploys
```

The setup wizard (`scripts/setup-wizard.js`) walks through:

1. Create/verify D1 database, R2 bucket, KV namespaces
2. Apply D1 migrations
3. Set secrets (`JWT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`)
4. Deploy to Cloudflare Workers

After deployment, promote yourself to admin:

```bash
pnpm exec wrangler d1 execute growchat --remote \
  --command="UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'"
```

### Regular Deploy

```bash
pnpm run deploy         # Builds CSS, runs pre-deploy gate, then deploys
```

The pre-deploy gate (`scripts/pre-deploy.js`) runs: lint → tests → coverage → migration validation.

### Environment Variables

Set via `pnpm run setup` or directly with `wrangler secret put`:

| Variable                 | Required | Description                                         |
| ------------------------ | -------- | --------------------------------------------------- |
| `JWT_SECRET`             | Yes      | JWT signing secret (auto-generated if not provided) |
| `RESEND_API_KEY`         | No       | Resend API key for email                            |
| `RESEND_FROM_EMAIL`      | No       | Sender email address                                |
| `ALLOWED_ORIGINS`        | No       | CORS allowed origins (default: `*`)                 |
| `LOG_LEVEL`              | No       | Logging level (default: `debug` in dev)             |
| `LLM_CONNECT_TIMEOUT_MS` | No       | LLM API connect timeout (default: 120000)           |

### Wrangler Configuration

See `wrangler.jsonc` for the full configuration including:

- D1 database bindings
- R2 bucket bindings
- KV namespace bindings
- Durable Object migrations
- Environment-specific configs

## Testing

### Unit Tests (Vitest)

```bash
pnpm test               # Run all tests
pnpm test:watch         # Watch mode
pnpm test:scoped        # Run tests for changed files only
pnpm test:coverage      # With coverage report
```

**Configuration** (`vitest.config.js`):

- Default environment: `node` (faster)
- `@vitest-environment jsdom` docblock for DOM tests
- Retry: 1 (for Windows flakiness)
- Pool: threads, 4-6 workers
- Timeout: 10s
- Coverage threshold: 30% (lines, branches, functions, statements)

**Test locations:**

- `/src/**/*.test.js` — Backend module tests (colocated with source)
- `/tests/unit/` — Frontend and integration tests
- Source: ~130 test files across both locations

### E2E Tests (Playwright)

```bash
pnpm test:e2e           # Run E2E tests
pnpm test:e2e:ui        # Open Playwright UI
pnpm test:e2e:update-snapshots  # Update visual snapshots
```

**E2E test categories** (`/tests/e2e/frontend/`):

- `auth-workflows.spec.ts` — Registration, login, logout
- `auth.spec.ts` — Auth edge cases
- `chat.spec.ts` — Message sending, streaming, branching
- `connections.spec.ts` — LLM connections management
- `admin-settings.spec.ts` — Admin panel operations
- `account-security.spec.ts` — Password change, security
- `accessibility-*.spec.ts` — aXe accessibility audits
- `visual-regression.spec.ts` — Playwright `toHaveScreenshot()` checks
- `bootstrap.spec.ts` — App initialization

### Mutation Testing (Stryker)

```bash
pnpm check:mutation     # Run Stryker mutation testing
```

Configured in `stryker.config.json` with Vitest runner.

### Visual Regression

Uses Playwright's native `toHaveScreenshot()` with per-platform snapshots. Snapshots stored in `tests/e2e/frontend/visual-regression.spec.ts-snapshots/`.

## CI/CD Pipeline

GitHub Actions workflows (`.github/workflows/`):

| Workflow                                | Trigger         | Purpose                                            |
| --------------------------------------- | --------------- | -------------------------------------------------- |
| `deploy.yml`                            | Push to main    | Build, test, deploy to Cloudflare Workers          |
| `codeql.yml`                            | Push/PR         | CodeQL security analysis                           |
| `semgrep.yml`                           | Push/PR         | Semgrep static analysis                            |
| `guardrails.yml`                        | Push/PR         | Quality gates (eslint, dupes, dep-cruiser, health) |
| `design-guardrails.yml`                 | PR              | Design.md linting                                  |
| `mutation-testing.yml`                  | Push/PR         | Stryker mutation score                             |
| `visual-regression.yml`                 | Push/PR         | Playwright visual regression                       |
| `pr-agent.yml`                          | PR              | AI PR review                                       |
| `pi-pr-assist.yml` / `pi-pr-review.yml` | PR              | AI-assisted PR workflows                           |
| `openwiki-update.yml`                   | Manual/schedule | OpenWiki documentation refresh                     |

## Quality Gates

A comprehensive quality system with multiple gates:

| Gate             | Command               | Tool                     |
| ---------------- | --------------------- | ------------------------ |
| ESLint           | `pnpm lint`           | ESLint with custom rules |
| Prettier         | `pnpm format:check`   | Prettier                 |
| TypeScript check | `pnpm typecheck`      | tsc for JSDoc types      |
| Architecture     | `pnpm arch:check`     | dependency-cruiser       |
| Duplication      | `pnpm lint:dupes`     | jscpd/fallow             |
| Logic lint       | `pnpm lint:logic`     | Semgrep                  |
| Health           | `pnpm lint:health`    | fallow                   |
| Security         | `pnpm lint:security`  | fallow                   |
| Dead code        | `pnpm lint:hygiene`   | fallow                   |
| Feature flags    | `pnpm lint:flags`     | fallow                   |
| Design lint      | `pnpm lint:design`    | @google/design.md        |
| Workflows        | `pnpm lint:workflows` | actionlint               |

The pre-push hook (`pnpm prepush`) runs the full suite. There is also a scoped variant (`pnpm prepush:scoped`) that runs only on changed files.

## Logging

- Structured JSON logging via `src/utils/logger.js`
- Request ID per request (crypto.randomUUID())
- Configurable log level via `LOG_LEVEL` env var
- All requests logged with path, method, request ID
- Errors logged with stack traces

## Memory Monitoring

`src/utils/memory-monitor.js` wraps the fetch handler:

```
withMemoryCheck('fetch-handler', () => handleRequest(req, env, ctx))
```

Logs warnings when memory usage exceeds configurable thresholds.
