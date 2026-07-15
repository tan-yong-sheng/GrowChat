# Integrations

## LLM Providers

GrowChat supports three LLM provider families via user-configured or admin-configured connections.

### Provider Families

| Family      | Aliases                                    | Default Base URL                                   | Adapter                       |
| ----------- | ------------------------------------------ | -------------------------------------------------- | ----------------------------- |
| `openai`    | `openai`, `openai-compatible`              | `https://api.openai.com/v1`                        | `provider-adapters.js`        |
| `anthropic` | `anthropic`, `claude`, `claude-compatible` | `https://api.anthropic.com/v1`                     | `provider-adapters.js`        |
| `google`    | `google`, `gemini`, `gemini-compatible`    | `https://generativelanguage.googleapis.com/v1beta` | `provider-adapters-google.js` |

### Connection Types

- **Admin-managed connections** — Configured via admin panel, can be shared or forced for users
- **User self-managed connections** — Personal API connections configured in account settings
- **Built-in provider URLs** — Fallback when no connection is configured

### Per-Provider Stream Parsing

Each provider returns SSE events in a different format. Stream parsers extract text deltas:

| Provider  | Parser                               | Key format                          |
| --------- | ------------------------------------ | ----------------------------------- |
| OpenAI    | `stream-parser-handler-openai.js`    | `choices[].delta.content`           |
| Anthropic | `stream-parser-handler-anthropic.js` | `content_block_delta.delta.text`    |
| Google    | `stream-parser-handler-google.js`    | `candidates[].content.parts[].text` |

### Turn Policies

Per-provider policies for handling turn continuation (e.g., when to stop vs. continue generating):

- `turn-policies/openai.js` — OpenAI-specific logic
- `turn-policies/anthropic.js` — Anthropic-specific logic
- `turn-policies/google.js` — Google-specific logic
- `turn-policies/shared.js` — Shared utility functions

## MCP (Model Context Protocol)

GrowChat integrates MCP tool servers to give LLMs access to external tools.

### MCP Client (`src/mcp/client.js`)

- Protocol version: `2025-11-25`
- Retry: up to 3 retries on 429/500/503/504
- Supports SSE response parsing
- Custom header building with session ID support

### Tool Server Management

- **Admin-managed:** Configured in admin panel with ACL rules
- **User-managed:** Personal MCP server connections via user settings
- **OAuth support:** MCP OAuth registration flow (`admin-tool-servers-oauth.js`)
- **Tool naming:** `mcp__{serverId}__{toolName}` (prefixed to avoid collisions)

### Key Files

| File                                          | Purpose                                           |
| --------------------------------------------- | ------------------------------------------------- |
| `src/mcp/client.js`                           | Low-level MCP protocol client                     |
| `src/chat/mcp.js`                             | Tool server loading, normalization, tool building |
| `src/chat/assistant-tool-executor.js`         | Executes tool calls with retry logic              |
| `src/chat/tools.js`                           | Tool call delta application                       |
| `src/routers/admin/admin-tool-servers-*.js`   | Admin CRUD and OAuth                              |
| `public/js/shared/components/server-modal.js` | Tool server configuration UI                      |

## Email (Resend)

Optional email service for transactional emails.

### Features

- Email verification for new accounts
- Password reset via email links
- Configurable sender address

### Configuration

- `RESEND_API_KEY` — Resend API key (optional, set via wrangler secret)
- `RESEND_FROM_EMAIL` — Sender email (default: `noreply@resend.dev`)
- `EMAIL_PROVIDER` — Currently only `resend` is supported

### Key Files

- `src/services/email/` — Email service module
- `src/routers/email-verification.js` — Email verification endpoint
- `src/routers/auth-password-reset.js` — Password reset flow
- `src/routers/admin/admin-email-security.js` — Email security config

## File Storage (R2)

Files are stored in Cloudflare R2 bucket (`growchat-files`).

### Supported Operations

- Upload (validated by type and size — 50MB max)
- Download (content serving)
- Delete
- Search (metadata search)
- Text extraction (OCR for images)
- Processing status tracking

### Key Files

- `src/services/uploads.js` — Upload validation and processing
- `src/services/extraction.js` — Text/OCR extraction
- `src/routers/files-*.js` — File API endpoints
- `public/js/shared/components/files-modal-*.js` — File management UI

## External Testing & Analysis Tools

| Tool               | Purpose                  | Configuration             |
| ------------------ | ------------------------ | ------------------------- |
| Playwright         | E2E + visual regression  | `playwright.config.ts`    |
| Lighthouse CI      | Performance audits       | `.lighthouserc.json`      |
| Stryker            | Mutation testing         | `stryker.config.json`     |
| dependency-cruiser | Architecture enforcement | `.dependency-cruiser.cjs` |
| ESLint             | Code quality             | `eslint.config.cjs`       |
| Semgrep            | Logic linting            | `.semgrep/rules.yml`      |
| Gitleaks           | Secret scanning          | `.gitleaks.toml`          |

## Cloudflare Bindings Summary

| Binding         | Type           | Environment Variable | Purpose             |
| --------------- | -------------- | -------------------- | ------------------- |
| `DB`            | D1 Database    | `d1_databases`       | Primary data store  |
| `FILES`         | R2 Bucket      | `r2_buckets`         | File upload storage |
| `SESSIONS`      | KV Namespace   | `kv_namespaces`      | JWT refresh tokens  |
| `CHAT_SESSIONS` | KV Namespace   | `kv_namespaces`      | Chat session state  |
| `CACHE`         | KV Namespace   | `kv_namespaces`      | General cache       |
| `MESSAGE_QUEUE` | Durable Object | `durable_objects`    | Real-time SSE       |
| `ASSETS`        | Static Assets  | `assets`             | Frontend serving    |
