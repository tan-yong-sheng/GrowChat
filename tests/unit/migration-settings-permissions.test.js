import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('migration 002 settings permissions', () => {
  it('seeds the account and resource permission catalog', async () => {
    const sql = await readFile(path.resolve('migrations/002_settings_permissions.sql'), 'utf8');

    const expectedPermissionKeys = [
      'user.settings.profile.write',
      'user.settings.preferences.write',
      'user.settings.connections.write',
      'user.settings.integrations.write',
      'user.settings.tool-servers.write',
      'admin.settings.read',
      'admin.settings.write',
      'admin.settings.general.write',
      'admin.settings.connections.write',
      'admin.settings.integrations.write',
      'admin.settings.policies.write',
      'admin.settings.models.write',
      'connection.use',
      'connection.manage',
      'connection.admin',
      'model.use',
      'model.manage',
      'model.admin',
      'tool-server.use',
      'tool-server.manage',
      'tool-server.admin',
      'integration.use',
      'integration.manage',
      'integration.admin',
    ];

    for (const key of expectedPermissionKeys) {
      expect(sql).toContain(key);
    }

    expect(sql).toContain("('member', 'user.settings.profile.write'");
    expect(sql).toContain("('member', 'connection.use'");
    expect(sql).toContain("('admin', 'admin.settings.models.write'");
    expect(sql).toContain("('admin', 'integration.admin'");
    expect(sql).toContain('INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at)');
  });
});
