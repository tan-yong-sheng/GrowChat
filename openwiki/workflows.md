# Key Workflows & Domain Concepts

## 1. Chat Streaming Flow

The most important workflow in GrowChat — sending a message and receiving an LLM response with tool support.

```
User sends message
  → POST /api/chat/:id/messages (chat-message-send.js)
    → Creates user message in DB
    → Calls streamLLM() in llm.js
      → resolvePrimaryConnection() — parses model ID, finds user/admin connection
      → normalizeProviderFamily() — maps "openai-compatible" → "openai"
      → buildStreamRequestHeaders() — builds auth headers, payload
      → executeStreamRequest() — fetch to LLM provider API

streamLLM() returns ReadableStream (SSE)
  → Wrapped by streamAssistantWithTools() in assistant-runner.js
    → Loads enabled MCP tool servers
    → Normalizes tools via buildMcpTools() — creates tool function definitions
    → Streams chunks through provider-specific stream parsers

Stream lifecycle (stream-lifecycle.js):
  1. Start — initialize message, send SSE events to client
  2. Content — stream text deltas through chat-message-stream-*.js
  3. Tool calls — if LLM requests tools, executeToolCalls() runs them via MCP
     → Tool results fed back as additional messages (MAX_TOOL_STEPS loop)
  4. Follow-ups — automatic follow-up generation (MAX_FOLLOW_UPS loop)
  5. Finalize (stream-finalize.js) — save messages, update chat state, handle turn management

Client-side:
  → chat-stream-controller.js receives SSE events
  → chat-message-stream-send.js handles streaming UI updates
  → chat-message-utils.js / chat-message-rendering.js for display
```

**Key files:**

- `src/llm.js` — `streamLLM()` entry point
- `src/chat/assistant-runner.js` — Full streaming assistant with tools
- `src/chat/assistant-tool-executor.js` — Tool execution
- `src/chat/stream-lifecycle.js` — Stream lifecycle management
- `src/routers/chat-message-send.js` — Message send endpoint
- `public/js/features/chat/chat-message-stream-send.js` — Client-side streaming

## 2. LLM Provider Resolution

```
Model ID format: "{providerId}:{modelId}" (e.g., "openai:gpt-4o")

Resolution chain:
  parseModelId() → { providerId, modelId }

  → If user has a personal connection matching providerId:
      → Use user's connection (baseUrl, apiKey, model)
  → If admin has a shared/forced connection:
      → Use admin's connection
  → Fallback: built-in provider URLs
      https://api.openai.com/v1 (openai)
      https://api.anthropic.com/v1 (anthropic)
      https://generativelanguage.googleapis.com/v1beta (google)

  → Provider adapters build the correct request format:
      openai → /chat/completions
      anthropic → /messages
      google → /models/{model}:streamGenerateContent

Provider families:
  - "openai" (aliases: openai-compatible)
  - "google" (aliases: gemini, gemini-compatible)
  - "anthropic" (aliases: claude, claude-compatible)
```

**Key files:**

- `src/llm/provider-registry.js` — Model ID parsing, provider aliases
- `src/llm/provider-adapters.js` — Request builder dispatch
- `src/llm/provider-adapters-google.js` — Google-specific adapter
- `src/llm/connections.js` — Connection loading and discovery

## 3. Tool Execution (MCP)

GrowChat supports the [Model Context Protocol](https://modelcontextprotocol.io/) for tool server integration.

```
Tool server types:
  - Admin-managed: configured via admin panel with ACL rules
  - User self-managed: personal MCP server connections

Flow:
  1. assistant-runner.js loads tool servers from DB via loadToolServers()
  2. buildMcpTools() (src/chat/mcp.js):
     - Normalizes each server's tool list
     - Applies ACL filters (user role, group membership, scope labels)
     - Builds tool function definitions in provider-compatible format
  3. Tool names are prefixed: "mcp__{serverId}__{toolName}"
  4. LLM may request tool calls → executeToolCalls() executes via MCP client
  5. Results streamed back to LLM for continued generation

ACL scopes for tools:
  - "admin" — only admins
  - "role:{role}" — specific roles
  - "group:{groupId}" — group members
```

**Key files:**

- `src/chat/mcp.js` — MCP tool normalization and building
- `src/chat/assistant-tool-executor.js` — Tool execution
- `src/chat/tools.js` — Tool call delta application
- `src/mcp/client.js` — MCP protocol client
- `src/routers/admin/admin-tool-servers-*.js` — Tool server admin

## 4. File Upload & RAG

```
Upload flow:
  1. POST /api/files/upload (files-upload-handler.js)
  2. validateFile() — checks type, size (50MB max), content type
  3. Upload to R2 bucket (growchat-files)
  4. Store metadata in D1 files table
  5. Extract text via extraction.js (OCR for images, plain text extraction)
  6. Optional: semantic chunking for RAG (FAQ document search)

File operations:
  - List files (/api/files)
  - Get file content (/api/files/:id/content)
  - Search files (/api/files/search)
  - Delete files (/api/files/:id)
  - Check processing status (/api/files/:id/process-status)

Supported types:
  - Images (processed with OCR via extraction.js)
  - Plain text, markdown, CSV, JSON
  - Planned: PDF
```

**Key files:**

- `src/services/uploads.js` — Upload validation and processing
- `src/services/extraction.js` — Text/OCR extraction
- `src/routers/files*.js` — File API endpoints
- `public/js/shared/components/files-modal*.js` — File management UI

## 5. Authentication & Session Management

```
Authentication flow:
  1. Register → POST /api/auth/register
     - Creates user (account_status = 'pending' until email verified)
  2. Login → POST /api/auth/login
     - Returns access_token (JWT, short-lived) + refresh_token
  3. Every API request:
     - Authorization: Bearer {access_token}
     - resolveAuthUser() validates JWT, extracts user.sub
  4. Token refresh → POST /api/auth/refresh
     - Rotates refresh token in SESSIONS KV
  5. Logout → POST /api/auth/logout
     - Invalidates refresh token

Password security:
  - PBKDF2 with Web Crypto API
  - Password reset via email token (Resend)
  - Users can change their own password

Session management:
  - List active sessions
  - Revoke specific sessions (admin or self)
```

**Key files:**

- `src/routers/auth.js`, `auth-register.js`, `auth-password-reset.js`, `auth-change-password.js`
- `src/routers/session-management.js`
- `src/utils/authorize.js` — Permission checks
- `public/js/features/auth/` — Auth UI
- `public/js/shared/api/auth.js` — Client auth API

## 6. Admin Operations

GrowChat has a comprehensive admin panel at `/#/admin`:

| Section           | Backend Router                   | Frontend                     | Purpose                                        |
| ----------------- | -------------------------------- | ---------------------------- | ---------------------------------------------- |
| Users             | `admin.js` (admin route handler) | `admin/users/`               | List, create, manage users, assign roles       |
| Roles             | `rbac-roles-*.js`                | `admin/users/`               | Custom roles with permission sets              |
| Groups            | `groups-*.js`                    | `admin/users/`               | User groups for ACL targeting                  |
| Connections       | `admin-connections-*.js`         | `admin/settings/`            | LLM provider connections (shared/forced)       |
| Models            | `models.js`, `models/`           | `admin/settings/`            | Model visibility and ACL rules                 |
| Tool Servers      | `admin-tool-servers-*.js`        | `admin/settings/`            | MCP server management with OAuth               |
| Integrations      | `admin-config.js`                | `admin/settings/`            | System config, email security, attachment caps |
| Policies          | `admin-config-*.js`              | `admin/settings/policies.js` | Security policies configuration                |
| Audit Logs        | `admin-config-audit-logs.js`     | `audit-logs.js`              | Audit log viewer                               |
| Security Overview | `admin-email-security.js`        | `admin/settings/`            | Email delivery, security settings              |

**Key files:**

- `public/js/features/admin/admin.js` — Admin controller
- `public/js/features/admin/admin-layout.js` — Admin layout with tabs
- `public/js/features/admin/admin-route-state.js` — Admin routing state
- `src/routers/admin/admin.js` — Admin route entry point
- `src/routers/admin/admin-helpers.js` — Admin response utilities
