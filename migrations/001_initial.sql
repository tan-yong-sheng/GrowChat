-- Canonical baseline for a fresh GrowChat D1 database.
-- No backward-compatibility migrations are kept.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  primary_role TEXT NOT NULL DEFAULT 'member',
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'pending')),
  settings TEXT NOT NULL DEFAULT '{}',
  preferences TEXT NOT NULL DEFAULT '{}',
  avatar TEXT,
  avatar_emoji TEXT,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
  last_active_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  model TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  share_id TEXT UNIQUE,
  archived INTEGER NOT NULL DEFAULT 0,
  current_message_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_chats_user_updated_at ON chats(user_id, archived, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_user_share_id ON chats(user_id, share_id);
CREATE INDEX IF NOT EXISTS idx_chats_current_message_id ON chats(current_message_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  citations TEXT,
  parent_id TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('streaming', 'tool_running', 'cancelled', 'error')),
  error_code TEXT,
  error_message TEXT,
  tool_calls TEXT,
  message_blocks TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_parent_id ON messages(chat_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT REFERENCES chats(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  file_size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  r2_url TEXT,
  text_excerpt TEXT,
  extraction_status INTEGER NOT NULL DEFAULT 1 CHECK (extraction_status IN (-1, 0, 1)),
  extraction_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_updated_at ON documents(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_filename ON documents(user_id, filename);
CREATE INDEX IF NOT EXISTS idx_documents_chat_id ON documents(chat_id);
CREATE INDEX IF NOT EXISTS idx_documents_extraction_status ON documents(extraction_status);

CREATE TABLE IF NOT EXISTS message_documents (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  mention_type TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_message_documents_message_id ON message_documents(message_id);
CREATE INDEX IF NOT EXISTS idx_message_documents_document_id ON message_documents(document_id);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups(created_at DESC);

CREATE TABLE IF NOT EXISTS group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_permissions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(group_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_group_permissions_group_id ON group_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_permissions_permission_id ON group_permissions(permission_id);

CREATE TABLE IF NOT EXISTS model_acl_rules (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
  principal_id TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  action TEXT NOT NULL DEFAULT 'use',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(model_id, principal_type, principal_id, effect, action)
);

CREATE INDEX IF NOT EXISTS idx_model_acl_rules_model_id ON model_acl_rules(model_id);
CREATE INDEX IF NOT EXISTS idx_model_acl_rules_principal ON model_acl_rules(principal_type, principal_id);

CREATE TABLE IF NOT EXISTS connection_acl_rules (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
  principal_id TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  action TEXT NOT NULL DEFAULT 'use',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(connection_id, principal_type, principal_id, effect, action)
);

CREATE INDEX IF NOT EXISTS idx_connection_acl_rules_connection_id ON connection_acl_rules(connection_id);
CREATE INDEX IF NOT EXISTS idx_connection_acl_rules_principal ON connection_acl_rules(principal_type, principal_id);

CREATE TABLE IF NOT EXISTS user_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
  base_url TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  headers TEXT NOT NULL DEFAULT '{}',
  auth_type TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  manual_models TEXT NOT NULL DEFAULT '[]',
  manual_models_mode TEXT NOT NULL DEFAULT 'all',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_user_connections_user_id ON user_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_connections_enabled ON user_connections(enabled);

CREATE TABLE IF NOT EXISTS user_tool_servers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_user_tool_servers_user_id ON user_tool_servers(user_id);

CREATE TABLE IF NOT EXISTS tool_server_acl_rules (
  id TEXT PRIMARY KEY,
  tool_server_id TEXT NOT NULL,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
  principal_id TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  action TEXT NOT NULL DEFAULT 'use',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tool_server_id, principal_type, principal_id, effect, action)
);

CREATE INDEX IF NOT EXISTS idx_tool_server_acl_rules_tool_server_id ON tool_server_acl_rules(tool_server_id);
CREATE INDEX IF NOT EXISTS idx_tool_server_acl_rules_principal ON tool_server_acl_rules(principal_type, principal_id);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  system INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS custom_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  description TEXT,
  max_tokens INTEGER DEFAULT 4096,
  temperature REAL DEFAULT 0.7,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_custom_models_provider ON custom_models(provider);
CREATE INDEX IF NOT EXISTS idx_custom_models_created_at ON custom_models(created_at DESC);

CREATE TABLE IF NOT EXISTS model_access (
  model_id TEXT PRIMARY KEY,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_model_access_enabled ON model_access(is_enabled);

CREATE TABLE IF NOT EXISTS message_deltas (
  message_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (message_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_message_deltas_message_seq ON message_deltas(message_id, seq);

INSERT OR IGNORE INTO roles (id, name, system, created_at) VALUES
  ('role-admin', 'admin', 1, unixepoch()),
  ('role-member', 'member', 1, unixepoch());

INSERT OR IGNORE INTO permissions (id, key, description, created_at) VALUES
  ('perm-chat-read', 'chat.read', 'Read user chats', unixepoch()),
  ('perm-chat-write', 'chat.write', 'Create and update chats', unixepoch()),
  ('perm-chat-delete', 'chat.delete', 'Delete chats', unixepoch()),
  ('perm-chat-share', 'chat.share', 'Share chats with others', unixepoch()),
  ('perm-model-use', 'model.use', 'Use LLM models for chat', unixepoch()),
  ('perm-model-admin', 'model.admin', 'Configure models and endpoints', unixepoch()),
  ('perm-file-upload', 'file.upload', 'Upload files', unixepoch()),
  ('perm-file-delete', 'file.delete', 'Delete files', unixepoch()),
  ('perm-admin-user-read', 'admin.user.read', 'Read user profiles and statistics', unixepoch()),
  ('perm-admin-user-write', 'admin.user.write', 'Manage users (roles, activation)', unixepoch()),
  ('perm-admin-audit-read', 'admin.audit.read', 'Read audit logs', unixepoch()),
  ('perm-admin-rbac-admin', 'admin.rbac.admin', 'Manage RBAC system (roles, permissions)', unixepoch());

INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES
  ('rp-admin-chat-read', 'role-admin', 'perm-chat-read', unixepoch()),
  ('rp-admin-chat-write', 'role-admin', 'perm-chat-write', unixepoch()),
  ('rp-admin-chat-delete', 'role-admin', 'perm-chat-delete', unixepoch()),
  ('rp-admin-chat-share', 'role-admin', 'perm-chat-share', unixepoch()),
  ('rp-admin-model-use', 'role-admin', 'perm-model-use', unixepoch()),
  ('rp-admin-model-admin', 'role-admin', 'perm-model-admin', unixepoch()),
  ('rp-admin-file-upload', 'role-admin', 'perm-file-upload', unixepoch()),
  ('rp-admin-file-delete', 'role-admin', 'perm-file-delete', unixepoch()),
  ('rp-admin-user-read', 'role-admin', 'perm-admin-user-read', unixepoch()),
  ('rp-admin-user-write', 'role-admin', 'perm-admin-user-write', unixepoch()),
  ('rp-admin-audit-read', 'role-admin', 'perm-admin-audit-read', unixepoch()),
  ('rp-admin-rbac-admin', 'role-admin', 'perm-admin-rbac-admin', unixepoch()),
  ('rp-member-chat-read', 'role-member', 'perm-chat-read', unixepoch()),
  ('rp-member-chat-write', 'role-member', 'perm-chat-write', unixepoch()),
  ('rp-member-model-use', 'role-member', 'perm-model-use', unixepoch()),
  ('rp-member-file-upload', 'role-member', 'perm-file-upload', unixepoch());
