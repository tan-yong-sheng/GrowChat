import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
}));

import { isValidModelAccessId, ensureAdminAclAccess, ensureAdminMutationAccess } from './admin-helpers.js';

describe('isValidModelAccessId', () => {
  it('returns true for valid IDs', () => {
    expect(isValidModelAccessId('gpt-4')).toBe(true);
    expect(isValidModelAccessId('conn_123__gpt-4o-mini')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidModelAccessId('')).toBe(false);
  });

  it('returns false for whitespace-only', () => {
    expect(isValidModelAccessId('   ')).toBe(false);
  });

  it('returns false for IDs with spaces', () => {
    expect(isValidModelAccessId('gpt 4')).toBe(false);
  });

  it('returns false for IDs longer than 200 characters', () => {
    expect(isValidModelAccessId('a'.repeat(201))).toBe(false);
  });

  it('returns true for IDs at exactly 200 characters', () => {
    expect(isValidModelAccessId('a'.repeat(200))).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(isValidModelAccessId(null)).toBe(false);
    expect(isValidModelAccessId(undefined)).toBe(false);
  });
});

describe('ensureAdminAclAccess', () => {
  it('returns authorize result', async () => {
    mocks.authorize.mockResolvedValue({ allow: true });
    const result = await ensureAdminAclAccess({ env: true }, { sub: 'admin-1' }, 'connection');
    expect(result).toEqual({ allow: true });
    expect(mocks.authorize).toHaveBeenCalledWith(
      { env: true },
      { sub: 'admin-1' },
      { action: 'admin.rbac.admin', resource: 'connection' },
    );
  });

  it('defaults resource to admin', async () => {
    mocks.authorize.mockResolvedValue({ allow: false });
    const result = await ensureAdminAclAccess({}, { sub: 'u1' });
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { sub: 'u1' },
      { action: 'admin.rbac.admin', resource: 'admin' },
    );
    expect(result.allow).toBe(false);
  });
});

describe('ensureAdminMutationAccess', () => {
  it('passes custom permission and resource', async () => {
    mocks.authorize.mockResolvedValue({ allow: true });
    const result = await ensureAdminMutationAccess({ env: true }, { sub: 'admin-1' }, 'admin.user.write', 'email-config');
    expect(result).toEqual({ allow: true });
    expect(mocks.authorize).toHaveBeenCalledWith(
      { env: true },
      { sub: 'admin-1' },
      { action: 'admin.user.write', resource: 'email-config' },
    );
  });

  it('defaults resource to admin when not specified', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'denied' });
    const result = await ensureAdminMutationAccess({}, { sub: 'u1' }, 'some.perm');
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { sub: 'u1' },
      { action: 'some.perm', resource: 'admin' },
    );
    expect(result.allow).toBe(false);
  });
});
