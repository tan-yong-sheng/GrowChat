# Data Model: Admin Settings & LLM Configs

## `app_config` (Key-Value conceptual representation)
- `public_registration` (boolean)
- `public_registration_status` ('active' | 'pending')
- `default_model_id` (string)
- `resend_api_key` (string)
- `openai_connections` (JSON array of connection objects)

## `Connection` Object Schema
- `id` (uuid)
- `name` (string)
- `baseUrl` (string)
- `key` (string, encrypted/masked in transit)
- `providerType` (enum: `openai-compatible`, `anthropic`, `google-vertex`)
- `enabled` (boolean)
- `manualModels` (array of explicitly added models)

## `ACL_Rules` (Role-Based Access Control)
- `principal_type` ('user' | 'group' | 'role')
- `principal_id` (uuid)
- `resource_family` ('model' | 'connection' | 'mcp_server')
- `resource_id` (string/uuid)
- `effect` ('allow' | 'deny')
- `action` ('use' | 'manage')
