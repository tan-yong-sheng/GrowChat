-- Add the settings/account permission foundation for Phase 1.
-- This migration is additive and safe for existing databases.

INSERT OR IGNORE INTO permissions (id, key, description, created_at) VALUES
  ('perm-user-settings-profile-write', 'user.settings.profile.write', 'Edit own profile details', unixepoch()),
  ('perm-user-settings-preferences-write', 'user.settings.preferences.write', 'Edit own preferences', unixepoch()),
  ('perm-user-settings-connections-write', 'user.settings.connections.write', 'Manage personal LLM connections', unixepoch()),
  ('perm-user-settings-integrations-write', 'user.settings.integrations.write', 'Manage personal integrations', unixepoch()),
  ('perm-user-settings-tool-servers-write', 'user.settings.tool-servers.write', 'Manage personal tool servers', unixepoch()),
  ('perm-admin-settings-read', 'admin.settings.read', 'View system settings', unixepoch()),
  ('perm-admin-settings-write', 'admin.settings.write', 'Modify system settings', unixepoch()),
  ('perm-admin-settings-general-write', 'admin.settings.general.write', 'Modify general system settings', unixepoch()),
  ('perm-admin-settings-connections-write', 'admin.settings.connections.write', 'Modify system connection settings', unixepoch()),
  ('perm-admin-settings-integrations-write', 'admin.settings.integrations.write', 'Modify system integration settings', unixepoch()),
  ('perm-admin-settings-policies-write', 'admin.settings.policies.write', 'Modify system policy settings', unixepoch()),
  ('perm-admin-settings-models-write', 'admin.settings.models.write', 'Modify system model settings', unixepoch()),
  ('perm-connection-use', 'connection.use', 'Use accessible connections', unixepoch()),
  ('perm-connection-manage', 'connection.manage', 'Manage own connections', unixepoch()),
  ('perm-connection-admin', 'connection.admin', 'Manage all connections', unixepoch()),
  ('perm-model-use', 'model.use', 'Use accessible models', unixepoch()),
  ('perm-model-manage', 'model.manage', 'Manage own model preferences', unixepoch()),
  ('perm-model-admin', 'model.admin', 'Manage all models', unixepoch()),
  ('perm-tool-server-use', 'tool-server.use', 'Use accessible tool servers', unixepoch()),
  ('perm-tool-server-manage', 'tool-server.manage', 'Manage own tool servers', unixepoch()),
  ('perm-tool-server-admin', 'tool-server.admin', 'Manage all tool servers', unixepoch()),
  ('perm-integration-use', 'integration.use', 'Use accessible integrations', unixepoch()),
  ('perm-integration-manage', 'integration.manage', 'Manage own integrations', unixepoch()),
  ('perm-integration-admin', 'integration.admin', 'Manage all integrations', unixepoch());

WITH target(role_name, perm_key, binding_id) AS (
  VALUES
    ('member', 'user.settings.profile.write', 'rp-member-user-settings-profile-write'),
    ('member', 'user.settings.preferences.write', 'rp-member-user-settings-preferences-write'),
    ('member', 'user.settings.connections.write', 'rp-member-user-settings-connections-write'),
    ('member', 'user.settings.integrations.write', 'rp-member-user-settings-integrations-write'),
    ('member', 'user.settings.tool-servers.write', 'rp-member-user-settings-tool-servers-write'),
    ('member', 'connection.use', 'rp-member-connection-use'),
    ('member', 'model.use', 'rp-member-model-use'),
    ('member', 'tool-server.use', 'rp-member-tool-server-use'),
    ('member', 'integration.use', 'rp-member-integration-use'),
    ('admin', 'user.settings.profile.write', 'rp-admin-user-settings-profile-write'),
    ('admin', 'user.settings.preferences.write', 'rp-admin-user-settings-preferences-write'),
    ('admin', 'user.settings.connections.write', 'rp-admin-user-settings-connections-write'),
    ('admin', 'user.settings.integrations.write', 'rp-admin-user-settings-integrations-write'),
    ('admin', 'user.settings.tool-servers.write', 'rp-admin-user-settings-tool-servers-write'),
    ('admin', 'admin.settings.read', 'rp-admin-admin-settings-read'),
    ('admin', 'admin.settings.write', 'rp-admin-admin-settings-write'),
    ('admin', 'admin.settings.general.write', 'rp-admin-admin-settings-general-write'),
    ('admin', 'admin.settings.connections.write', 'rp-admin-admin-settings-connections-write'),
    ('admin', 'admin.settings.integrations.write', 'rp-admin-admin-settings-integrations-write'),
    ('admin', 'admin.settings.policies.write', 'rp-admin-admin-settings-policies-write'),
    ('admin', 'admin.settings.models.write', 'rp-admin-admin-settings-models-write'),
    ('admin', 'connection.use', 'rp-admin-connection-use'),
    ('admin', 'connection.manage', 'rp-admin-connection-manage'),
    ('admin', 'connection.admin', 'rp-admin-connection-admin'),
    ('admin', 'model.use', 'rp-admin-model-use'),
    ('admin', 'model.manage', 'rp-admin-model-manage'),
    ('admin', 'model.admin', 'rp-admin-model-admin'),
    ('admin', 'tool-server.use', 'rp-admin-tool-server-use'),
    ('admin', 'tool-server.manage', 'rp-admin-tool-server-manage'),
    ('admin', 'tool-server.admin', 'rp-admin-tool-server-admin'),
    ('admin', 'integration.use', 'rp-admin-integration-use'),
    ('admin', 'integration.manage', 'rp-admin-integration-manage'),
    ('admin', 'integration.admin', 'rp-admin-integration-admin')
)
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at)
SELECT
  target.binding_id,
  roles.id,
  permissions.id,
  unixepoch()
FROM target
INNER JOIN roles ON roles.name = target.role_name
INNER JOIN permissions ON permissions.key = target.perm_key;
