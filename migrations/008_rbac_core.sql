-- RBAC Core Schema Migration
-- Implements centralized role-based access control
-- Idempotent and safe for existing databases

-- System roles table
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  system INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Role-to-permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(role_id, permission_id)
);

-- User-to-role assignment with scope support
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  scope_type TEXT,
  scope_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, role_id, scope_type, scope_id)
);

-- Append-only audit log for all admin mutations
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_scope ON user_roles(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- ============================================================================
-- DEFAULT SYSTEM ROLES (6 core roles)
-- ============================================================================

INSERT OR IGNORE INTO roles (id, name, system, created_at) VALUES
  ('role-owner', 'owner', 1, unixepoch()),
  ('role-admin', 'admin', 1, unixepoch()),
  ('role-manager', 'manager', 1, unixepoch()),
  ('role-member', 'member', 1, unixepoch()),
  ('role-viewer', 'viewer', 1, unixepoch()),
  ('role-service', 'service', 1, unixepoch());

-- ============================================================================
-- DEFAULT PERMISSIONS (20+ core permissions)
-- ============================================================================

-- Chat permissions
INSERT OR IGNORE INTO permissions (id, key, description, created_at) VALUES
  ('perm-chat-read', 'chat.read', 'Read user chats', unixepoch()),
  ('perm-chat-write', 'chat.write', 'Create and update chats', unixepoch()),
  ('perm-chat-delete', 'chat.delete', 'Delete chats', unixepoch()),
  ('perm-chat-share', 'chat.share', 'Share chats with others', unixepoch());

-- Model permissions
INSERT OR IGNORE INTO permissions (id, key, description, created_at) VALUES
  ('perm-model-use', 'model.use', 'Use LLM models for chat', unixepoch()),
  ('perm-model-admin', 'model.admin', 'Configure models and endpoints', unixepoch());

-- Knowledge base permissions
INSERT OR IGNORE INTO permissions (id, key, description, created_at) VALUES
  ('perm-kb-read', 'kb.read', 'Read knowledge base entries', unixepoch()),
  ('perm-kb-write', 'kb.write', 'Create and update knowledge base', unixepoch()),
  ('perm-kb-reindex', 'kb.reindex', 'Reindex knowledge base embeddings', unixepoch());

-- File permissions
INSERT OR IGNORE INTO permissions (id, key, description, created_at) VALUES
  ('perm-file-upload', 'file.upload', 'Upload files', unixepoch()),
  ('perm-file-delete', 'file.delete', 'Delete files', unixepoch());

-- Admin permissions
INSERT OR IGNORE INTO permissions (id, key, description, created_at) VALUES
  ('perm-admin-user-read', 'admin.user.read', 'Read user profiles and statistics', unixepoch()),
  ('perm-admin-user-write', 'admin.user.write', 'Manage users (roles, activation)', unixepoch()),
  ('perm-admin-audit-read', 'admin.audit.read', 'Read audit logs', unixepoch()),
  ('perm-admin-rbac-admin', 'admin.rbac.admin', 'Manage RBAC system (roles, permissions)', unixepoch());

-- ============================================================================
-- DEFAULT ROLE-PERMISSION MAPPINGS
-- ============================================================================

-- OWNER: All permissions
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES
  ('rp-owner-chat-read', 'role-owner', 'perm-chat-read', unixepoch()),
  ('rp-owner-chat-write', 'role-owner', 'perm-chat-write', unixepoch()),
  ('rp-owner-chat-delete', 'role-owner', 'perm-chat-delete', unixepoch()),
  ('rp-owner-chat-share', 'role-owner', 'perm-chat-share', unixepoch()),
  ('rp-owner-model-use', 'role-owner', 'perm-model-use', unixepoch()),
  ('rp-owner-model-admin', 'role-owner', 'perm-model-admin', unixepoch()),
  ('rp-owner-kb-read', 'role-owner', 'perm-kb-read', unixepoch()),
  ('rp-owner-kb-write', 'role-owner', 'perm-kb-write', unixepoch()),
  ('rp-owner-kb-reindex', 'role-owner', 'perm-kb-reindex', unixepoch()),
  ('rp-owner-file-upload', 'role-owner', 'perm-file-upload', unixepoch()),
  ('rp-owner-file-delete', 'role-owner', 'perm-file-delete', unixepoch()),
  ('rp-owner-admin-user-read', 'role-owner', 'perm-admin-user-read', unixepoch()),
  ('rp-owner-admin-user-write', 'role-owner', 'perm-admin-user-write', unixepoch()),
  ('rp-owner-admin-audit-read', 'role-owner', 'perm-admin-audit-read', unixepoch()),
  ('rp-owner-admin-rbac-admin', 'role-owner', 'perm-admin-rbac-admin', unixepoch());

-- ADMIN: All permissions except owner-specific
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES
  ('rp-admin-chat-read', 'role-admin', 'perm-chat-read', unixepoch()),
  ('rp-admin-chat-write', 'role-admin', 'perm-chat-write', unixepoch()),
  ('rp-admin-chat-delete', 'role-admin', 'perm-chat-delete', unixepoch()),
  ('rp-admin-chat-share', 'role-admin', 'perm-chat-share', unixepoch()),
  ('rp-admin-model-use', 'role-admin', 'perm-model-use', unixepoch()),
  ('rp-admin-model-admin', 'role-admin', 'perm-model-admin', unixepoch()),
  ('rp-admin-kb-read', 'role-admin', 'perm-kb-read', unixepoch()),
  ('rp-admin-kb-write', 'role-admin', 'perm-kb-write', unixepoch()),
  ('rp-admin-kb-reindex', 'role-admin', 'perm-kb-reindex', unixepoch()),
  ('rp-admin-file-upload', 'role-admin', 'perm-file-upload', unixepoch()),
  ('rp-admin-file-delete', 'role-admin', 'perm-file-delete', unixepoch()),
  ('rp-admin-user-read', 'role-admin', 'perm-admin-user-read', unixepoch()),
  ('rp-admin-user-write', 'role-admin', 'perm-admin-user-write', unixepoch()),
  ('rp-admin-audit-read', 'role-admin', 'perm-admin-audit-read', unixepoch()),
  ('rp-admin-rbac-admin', 'role-admin', 'perm-admin-rbac-admin', unixepoch());

-- MANAGER: Content and knowledge management
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES
  ('rp-manager-chat-read', 'role-manager', 'perm-chat-read', unixepoch()),
  ('rp-manager-chat-write', 'role-manager', 'perm-chat-write', unixepoch()),
  ('rp-manager-chat-delete', 'role-manager', 'perm-chat-delete', unixepoch()),
  ('rp-manager-chat-share', 'role-manager', 'perm-chat-share', unixepoch()),
  ('rp-manager-model-use', 'role-manager', 'perm-model-use', unixepoch()),
  ('rp-manager-kb-read', 'role-manager', 'perm-kb-read', unixepoch()),
  ('rp-manager-kb-write', 'role-manager', 'perm-kb-write', unixepoch()),
  ('rp-manager-kb-reindex', 'role-manager', 'perm-kb-reindex', unixepoch()),
  ('rp-manager-file-upload', 'role-manager', 'perm-file-upload', unixepoch());

-- MEMBER: Regular user permissions
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES
  ('rp-member-chat-read', 'role-member', 'perm-chat-read', unixepoch()),
  ('rp-member-chat-write', 'role-member', 'perm-chat-write', unixepoch()),
  ('rp-member-chat-delete', 'role-member', 'perm-chat-delete', unixepoch()),
  ('rp-member-chat-share', 'role-member', 'perm-chat-share', unixepoch()),
  ('rp-member-model-use', 'role-member', 'perm-model-use', unixepoch()),
  ('rp-member-kb-read', 'role-member', 'perm-kb-read', unixepoch()),
  ('rp-member-kb-write', 'role-member', 'perm-kb-write', unixepoch()),
  ('rp-member-file-upload', 'role-member', 'perm-file-upload', unixepoch()),
  ('rp-member-file-delete', 'role-member', 'perm-file-delete', unixepoch());

-- VIEWER: Read-only access
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES
  ('rp-viewer-chat-read', 'role-viewer', 'perm-chat-read', unixepoch()),
  ('rp-viewer-kb-read', 'role-viewer', 'perm-kb-read', unixepoch());

-- SERVICE: AI service account (write-only for responses)
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES
  ('rp-service-chat-write', 'role-service', 'perm-chat-write', unixepoch());

-- ============================================================================
-- LEGACY USER BOOTSTRAP
-- ============================================================================

-- Backfill global role bindings for existing users.
-- admin -> admin role, user -> member role, inactive -> no binding
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
