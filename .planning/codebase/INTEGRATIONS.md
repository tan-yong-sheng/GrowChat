# External Integrations

**Analysis Date:** [YYYY-MM-DD]

## APIs & External Services

**Communications:**
- Resend - Sending transactional emails (verification, notifications)
  - SDK/Client: Custom HTTP fetch to `https://api.resend.com/emails` (in `src/services/email/plugins/resend-plugin.js`)
  - Auth: `RESEND_API_KEY` (can be configured in DB or env)

**AI / LLM:**
- OpenAI-compatible APIs (OpenAI, Anthropic, etc.) - Implied by codebase context, Cloudflare AI bindings were removed in favor of standard API integration.
  - Auth: Per-user/workspace API keys in DB

## Data Storage

**Databases:**
- Cloudflare D1 (SQLite)
  - Connection: `env.DB` binding
  - Client: Native D1 Client (`env.DB.prepare().bind().run()`)

**File Storage:**
- Cloudflare R2
  - Connection: `env.FILES` binding

**Caching / Sessions:**
- Cloudflare KV
  - Bindings: `env.SESSIONS`, `env.CACHE`, `env.CHAT_SESSIONS`

**Message Queues:**
- Cloudflare Durable Objects
  - Binding: `env.MESSAGE_QUEUE` (Class `MessageQueueDO`)

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based Authentication
  - Implementation: Custom JWT verification (`src/shared/auth.js`) via `Authorization: Bearer <token>` header
  - Secret: Managed via `getJwtSecret(env, req)`

## Monitoring & Observability

**Error Tracking:**
- Cloudflare native observability
  - Configuration: `observability: { enabled: true }` in `wrangler.jsonc`

**Logs:**
- Console logging (`console.log`, `console.error`) captured by Cloudflare Worker logs

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers
  - Management: Wrangler CLI (`npm run deploy`)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/guardrails.yml`)

## Environment Configuration

**Required env vars:**
- `RESEND_API_KEY` (If email provider is resend)
- Cloudflare API tokens (For deployment)

**Secrets location:**
- Worker Secrets (`wrangler secret`)
- Local `.env` files (`.env`, `.env.local`)

## Webhooks & Callbacks

**Incoming:**
- None explicitly detected

**Outgoing:**
- None explicitly detected

---

*Integration audit: [YYYY-MM-DD]*