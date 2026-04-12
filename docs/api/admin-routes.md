# Admin Routes

Source: `src/routers/admin/index.js` → `src/routers/admin.js`

## Admin Configuration

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/config` | `admin.user.read` | Fetch admin configuration |
| PUT | `/api/admin/config` | `admin.user.write` | Update admin config (registration, default model) |
| GET | `/api/admin/model-attachment-caps` | `admin.rbac.admin` | Fetch per-model attachment capabilities |
| PUT | `/api/admin/model-attachment-caps` | `admin.rbac.admin` | Update per-model attachment capabilities |

## Admin OpenAI Connections

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/openai/connections` | `admin.rbac.admin` | List workspace OpenAI connections |
| PUT | `/api/admin/openai/connections` | `admin.rbac.admin` | Batch update connections, models, access |
| POST | `/api/admin/openai/connections/test` | `admin.rbac.admin` | Test workspace OpenAI connection |
| GET | `/api/admin/openai/connections/access` | `admin.rbac.admin` | Bulk connection access rules |
| PUT | `/api/admin/openai/connections/access` | `admin.rbac.admin` | Bulk connection access update |
| GET | `/api/admin/openai/connections/:id/access` | `admin.rbac.admin` | Single connection access rules |
| PUT | `/api/admin/openai/connections/:id/access` | `admin.rbac.admin` | Single connection access update |

## Admin Tool Servers (MCP)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/tool-servers` | `admin.user.read` | List workspace tool servers |
| PUT | `/api/admin/tool-servers` | `admin.rbac.admin` | Update tool servers |
| POST | `/api/admin/tool-servers/test` | `admin.rbac.admin` | Test MCP tool server |
| POST | `/api/admin/tool-servers/oauth/start` | `admin.rbac.admin` | Start admin OAuth flow |
| GET | `/api/admin/tool-servers/oauth/callback` | (skipped) | OAuth redirect handler |
| GET | `/api/admin/tool-servers/access` | `admin.rbac.admin` | Bulk tool server access rules |
| PUT | `/api/admin/tool-servers/access` | `admin.rbac.admin` | Bulk tool server access update |
| GET | `/api/admin/tool-servers/:id/access` | `admin.rbac.admin` | Single tool server access rules |
| PUT | `/api/admin/tool-servers/:id/access` | `admin.rbac.admin` | Single tool server access update |

## Admin Email Configuration

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/api/admin/email-config` | `admin.rbac.admin` | Fetch email configuration |
| PUT | `/api/admin/email-config` | `admin.rbac.admin` | Update email configuration |
| POST | `/api/admin/email-config/test` | `admin.rbac.admin` | Send test email |
