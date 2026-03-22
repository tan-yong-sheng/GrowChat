-- Canonical baseline for a fresh GrowChat D1 database.
-- No backward-compatibility migrations are kept.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'inactive')),
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
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

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
  extraction_status INTEGER NOT NULL DEFAULT 0 CHECK (extraction_status IN (-1, 0, 1)),
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

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  command TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_global INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, command)
);

CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_command ON prompts(command);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_active ON prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_prompts_user_active ON prompts(user_id, is_active) WHERE is_active = 1;

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
  scope_type TEXT,
  scope_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, role_id, scope_type, scope_id)
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
CREATE INDEX IF NOT EXISTS idx_user_roles_scope ON user_roles(scope_type, scope_id);
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
  ('role-owner', 'owner', 1, unixepoch()),
  ('role-admin', 'admin', 1, unixepoch()),
  ('role-manager', 'manager', 1, unixepoch()),
  ('role-member', 'member', 1, unixepoch()),
  ('role-viewer', 'viewer', 1, unixepoch()),
  ('role-service', 'service', 1, unixepoch());

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
  ('rp-owner-chat-read', 'role-owner', 'perm-chat-read', unixepoch()),
  ('rp-owner-chat-write', 'role-owner', 'perm-chat-write', unixepoch()),
  ('rp-owner-chat-delete', 'role-owner', 'perm-chat-delete', unixepoch()),
  ('rp-owner-chat-share', 'role-owner', 'perm-chat-share', unixepoch()),
  ('rp-owner-model-use', 'role-owner', 'perm-model-use', unixepoch()),
  ('rp-owner-model-admin', 'role-owner', 'perm-model-admin', unixepoch()),
  ('rp-owner-file-upload', 'role-owner', 'perm-file-upload', unixepoch()),
  ('rp-owner-file-delete', 'role-owner', 'perm-file-delete', unixepoch()),
  ('rp-owner-admin-user-read', 'role-owner', 'perm-admin-user-read', unixepoch()),
  ('rp-owner-admin-user-write', 'role-owner', 'perm-admin-user-write', unixepoch()),
  ('rp-owner-admin-audit-read', 'role-owner', 'perm-admin-audit-read', unixepoch()),
  ('rp-owner-admin-rbac-admin', 'role-owner', 'perm-admin-rbac-admin', unixepoch()),
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
  ('rp-manager-chat-read', 'role-manager', 'perm-chat-read', unixepoch()),
  ('rp-manager-chat-write', 'role-manager', 'perm-chat-write', unixepoch()),
  ('rp-manager-chat-delete', 'role-manager', 'perm-chat-delete', unixepoch()),
  ('rp-manager-chat-share', 'role-manager', 'perm-chat-share', unixepoch()),
  ('rp-manager-model-use', 'role-manager', 'perm-model-use', unixepoch()),
  ('rp-manager-file-upload', 'role-manager', 'perm-file-upload', unixepoch()),
  ('rp-member-chat-read', 'role-member', 'perm-chat-read', unixepoch()),
  ('rp-member-chat-write', 'role-member', 'perm-chat-write', unixepoch()),
  ('rp-member-chat-delete', 'role-member', 'perm-chat-delete', unixepoch()),
  ('rp-member-chat-share', 'role-member', 'perm-chat-share', unixepoch()),
  ('rp-member-model-use', 'role-member', 'perm-model-use', unixepoch()),
  ('rp-member-file-upload', 'role-member', 'perm-file-upload', unixepoch()),
  ('rp-member-file-delete', 'role-member', 'perm-file-delete', unixepoch()),
  ('rp-viewer-chat-read', 'role-viewer', 'perm-chat-read', unixepoch()),
  ('rp-service-chat-write', 'role-service', 'perm-chat-write', unixepoch());

INSERT OR IGNORE INTO user_roles (id, user_id, role_id, scope_type, scope_id, created_at)
SELECT
  'ur-' || u.id || '-' || r.id,
  u.id,
  r.id,
  NULL,
  NULL,
  unixepoch()
FROM users u
INNER JOIN roles r ON r.name = CASE WHEN u.role = 'admin' THEN 'admin' ELSE 'member' END
WHERE u.role IN ('admin', 'user')
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = u.id
      AND ur.scope_type IS NULL
      AND ur.scope_id IS NULL
  );
