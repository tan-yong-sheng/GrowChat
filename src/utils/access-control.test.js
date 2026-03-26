import { describe, expect, it } from 'vitest';
import { evaluateConnectionAclAccess } from './connection-acl.js';
import { evaluateModelAclAccess } from './model-acl.js';
import { evaluateToolServerAclAccess } from './tool-server-acl.js';

describe('ACL evaluators', () => {
  it('denies non-admin model access when no ACL rules match', () => {
    const result = evaluateModelAclAccess(
      { id: 'model-1', connection_source: 'config' },
      { user: { sub: 'user-1', role: 'user' }, rules: [] }
    );

    expect(result).toEqual({
      allowed: false,
      access_label: 'No access',
      access_variant: 'none',
    });
  });

  it('denies non-admin connection access when no ACL rules match', () => {
    const result = evaluateConnectionAclAccess(
      { id: 'conn-1', source: 'config' },
      { user: { sub: 'user-1', role: 'user' }, rules: [] }
    );

    expect(result).toEqual({
      allowed: false,
      access_label: 'No access',
      access_variant: 'none',
    });
  });

  it('denies non-admin tool server access when no ACL rules match', () => {
    const result = evaluateToolServerAclAccess(
      { id: 'mcp-1', source: 'config' },
      { user: { sub: 'user-1', role: 'user' }, rules: [] }
    );

    expect(result).toEqual({
      allowed: false,
      access_label: 'No access',
      access_variant: 'none',
    });
  });
});
