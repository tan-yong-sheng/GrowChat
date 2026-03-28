import { describe, expect, it } from 'vitest';
import { getAdminAclAccessPath, getAdminAclFamilyBasePath, getAdminUserAccessPath } from '../../public/js/shared/admin-acl.js';

describe('admin acl family paths', () => {
  it('maps family keys to the expected base paths', () => {
    expect(getAdminAclFamilyBasePath('models')).toBe('/api/admin/models');
    expect(getAdminAclFamilyBasePath('connections')).toBe('/api/admin/openai/connections');
    expect(getAdminAclFamilyBasePath('tool-servers')).toBe('/api/admin/tool-servers');
    expect(getAdminAclFamilyBasePath('mcp-servers')).toBe('/api/admin/tool-servers');
  });

  it('builds resource and bulk access endpoints consistently', () => {
    expect(getAdminAclAccessPath('models', { resourceId: 'm-1' })).toBe('/api/admin/models/m-1/access');
    expect(getAdminAclAccessPath('models', { bulk: true })).toBe('/api/admin/models/access');
    expect(getAdminAclAccessPath('connections', { resourceId: 'c-1' })).toBe('/api/admin/openai/connections/c-1/access');
    expect(getAdminAclAccessPath('connections', { bulk: true, query: '?ids=c-1,c-2' })).toBe('/api/admin/openai/connections/access?ids=c-1,c-2');
    expect(getAdminAclAccessPath('mcp-servers', { resourceId: 's-1' })).toBe('/api/admin/tool-servers/s-1/access');
    expect(getAdminAclAccessPath('mcp-servers', { bulk: true, query: '?ids=s-1' })).toBe('/api/admin/tool-servers/access?ids=s-1');
  });

  it('builds the user access endpoint consistently', () => {
    expect(getAdminUserAccessPath('user-1')).toBe('/api/admin/users/user-1/access');
  });
});
