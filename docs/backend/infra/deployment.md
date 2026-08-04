# Deployment Guide

This document covers deploying GrowChat to Cloudflare Workers.

## One-Command Deploy (recommended)

The setup wizard handles the full deployment flow:

```bash
git clone https://github.com/tan-yong-sheng/GrowChat.git
cd GrowChat
pnpm install
pnpm run setup
```

The wizard will:

1. Create all Cloudflare resources (D1, R2, KV namespaces)
2. Apply D1 migrations automatically
3. Prompt for secrets (JWT_SECRET, optional RESEND_API_KEY)
4. Deploy to Cloudflare Workers

### What the Wizard Creates

| Resource       | Binding         | Command                                      |
| -------------- | --------------- | -------------------------------------------- |
| D1 Database    | `DB`            | `wrangler d1 create growchat`                |
| R2 Bucket      | `FILES`         | `wrangler r2 bucket create growchat-files`   |
| KV Namespace   | `CHAT_SESSIONS` | `wrangler kv:namespace create CHAT_SESSIONS` |
| KV Namespace   | `SESSIONS`      | `wrangler kv:namespace create SESSIONS`      |
| KV Namespace   | `CACHE`         | `wrangler kv:namespace create CACHE`         |
| Durable Object | `MESSAGE_QUEUE` | Auto-created on deploy                       |

### Secrets Set by the Wizard

| Secret              | Required | Purpose                                                    |
| ------------------- | -------- | ---------------------------------------------------------- |
| `JWT_SECRET`        | ✅       | Signs JWT access tokens (auto-generated if not provided)   |
| `RESEND_API_KEY`    | ❌       | Transactional emails (password reset)                      |
| `RESEND_FROM_EMAIL` | ❌       | Sender email for Resend (default: `onboarding@resend.dev`) |

## Post-Deploy: Create Admin

1. Open your Workers URL (shown in the wizard output)
2. Register your account
3. Promote to admin via the D1 console:

```bash
pnpm exec wrangler d1 execute growchat --remote \
  --command="UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'"
```

## Manual Setup (advanced)

See [README.md](../../../README.md) for the manual step-by-step deployment instructions.

## Re-deploying After Changes

After making code changes, re-deploy with:

```bash
pnpm run deploy
```

This runs the full pre-deploy gate (lint → format check → test → coverage → CSS build → validate migrations → deploy).

## Local Development

```bash
pnpm run dev
```

Opens `http://localhost:8787`. Uses local D1 (`.wrangler/state/`) and local KV/R2.

For local env vars, copy the template:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your local values
```

## Troubleshooting

### JWT_SECRET not configured

```bash
pnpm exec wrangler secret put JWT_SECRET
pnpm run deploy
```

### D1 Database errors

Check that `wrangler.jsonc` has the correct database ID from `pnpm exec wrangler d1 list`.

### Migrations out of sync

```bash
pnpm exec wrangler d1 migrations apply growchat --remote
```

### KV namespace errors

Verify the KV namespace IDs in `wrangler.jsonc` match your account:

```bash
pnpm exec wrangler kv:namespace list
```

### R2 bucket not found

```bash
pnpm exec wrangler r2 bucket create growchat-files
```

## Architecture Reference

- **Worker entry point**: `src/index.js` → `router-registry.js` → API_ROUTES
- **Bindings**: See `wrangler.jsonc` for all Cloudflare bindings
- **Migrations**: `migrations/` directory (auto-applied by wizard, or via `wrangler d1 migrations apply`)
- **Pre-deploy gate**: `scripts/pre-deploy.js` (lint, test, coverage, CSS, migration validation)
