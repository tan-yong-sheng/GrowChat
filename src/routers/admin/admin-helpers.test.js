import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  DENIAL_REASONS: {
    INVALID_REQUEST: 'invalid_request',
    MISSING_PERMISSION: 'missing_permission',
    ACCOUNT_NOT_ACTIVE: 'account_not_active',
  },
}));

import {
  isValidModelAccessId,
  ensureAdminAclAccess,
  ensureAdminMutationAccess,
} from './admin-helpers.js';

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
  beforeEach(() => {
    mocks.authorize.mockReset();
  });

  it('returns authorize result with options-object signature', async () => {
    mocks.authorize.mockResolvedValue({ allow: true });
    const result = await ensureAdminAclAccess({
      env: { env: true },
      user: { sub: 'admin-1' },
      resource: 'connection',
    });
    expect(result).toEqual({ allow: true });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      { env: true },
      { sub: 'admin-1' },
      { action: 'admin.rbac.admin', resource: 'connection' }
    );
  });

  it('returns authorize result with legacy positional signature', async () => {
    mocks.authorize.mockResolvedValue({ allow: true });
    const result = await ensureAdminAclAccess({ env: true }, { sub: 'admin-1' }, 'connection');
    expect(result).toEqual({ allow: true });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      { env: true },
      { sub: 'admin-1' },
      { action: 'admin.rbac.admin', resource: 'connection' }
    );
  });

  it('defaults resource to admin with options-object signature', async () => {
    mocks.authorize.mockResolvedValue({ allow: false });
    const result = await ensureAdminAclAccess({ env: {}, user: { sub: 'u1' } });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { sub: 'u1' },
      { action: 'admin.rbac.admin', resource: 'admin' }
    );
    expect(result.allow).toBe(false);
  });

  it('defaults resource to admin with legacy positional signature', async () => {
    mocks.authorize.mockResolvedValue({ allow: false });
    const result = await ensureAdminAclAccess({}, { sub: 'u1' });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { sub: 'u1' },
      { action: 'admin.rbac.admin', resource: 'admin' }
    );
    expect(result.allow).toBe(false);
  });

  it('delegates missing env to authorize so it can return server_error', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'admin.rbac.admin',
    });
    const result = await ensureAdminAclAccess({ user: { sub: 'u1' }, resource: 'admin' });
    expect(result).toEqual({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'admin.rbac.admin',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      undefined,
      { sub: 'u1' },
      { action: 'admin.rbac.admin', resource: 'admin' }
    );
  });

  it('delegates missing user to authorize so it can return unauthorized', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'unauthorized',
      reason: 'account_not_active',
      action: 'admin.rbac.admin',
    });
    const result = await ensureAdminAclAccess({ env: {}, resource: 'admin' });
    expect(result).toEqual({
      allow: false,
      code: 'unauthorized',
      reason: 'account_not_active',
      action: 'admin.rbac.admin',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith({}, undefined, {
      action: 'admin.rbac.admin',
      resource: 'admin',
    });
  });

  it('normalizes null options to {} and delegates to authorize', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'admin.rbac.admin',
    });
    const result = await ensureAdminAclAccess(null);
    expect(result).toEqual({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'admin.rbac.admin',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(undefined, undefined, {
      action: 'admin.rbac.admin',
      resource: 'admin',
    });
  });

  it('delegates non-object env to authorize', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'admin.rbac.admin',
    });
    const result = await ensureAdminAclAccess({
      env: 'string',
      user: { sub: 'u1' },
      resource: 'admin',
    });
    expect(result).toEqual({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'admin.rbac.admin',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      'string',
      { sub: 'u1' },
      { action: 'admin.rbac.admin', resource: 'admin' }
    );
  });

  it('normalizes null env in legacy positional signature and delegates to authorize', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'admin.rbac.admin',
    });
    const result = await ensureAdminAclAccess(null, { sub: 'u1' }, 'connection');
    expect(result).toEqual({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'admin.rbac.admin',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { sub: 'u1' },
      { action: 'admin.rbac.admin', resource: 'connection' }
    );
  });
});

describe('ensureAdminMutationAccess', () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
  });

  it('passes custom permission and resource with options-object signature', async () => {
    mocks.authorize.mockResolvedValue({ allow: true });
    const result = await ensureAdminMutationAccess({
      env: { env: true },
      user: { sub: 'admin-1' },
      permission: 'admin.user.write',
      resource: 'email-config',
    });
    expect(result).toEqual({ allow: true });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      { env: true },
      { sub: 'admin-1' },
      { action: 'admin.user.write', resource: 'email-config' }
    );
  });

  it('passes custom permission and resource with legacy positional signature', async () => {
    mocks.authorize.mockResolvedValue({ allow: true });
    const result = await ensureAdminMutationAccess(
      { env: true },
      { sub: 'admin-1' },
      'admin.user.write',
      'email-config'
    );
    expect(result).toEqual({ allow: true });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      { env: true },
      { sub: 'admin-1' },
      { action: 'admin.user.write', resource: 'email-config' }
    );
  });

  it('defaults resource to admin with options-object signature', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'denied' });
    const result = await ensureAdminMutationAccess({
      env: {},
      user: { sub: 'u1' },
      permission: 'some.perm',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { sub: 'u1' },
      { action: 'some.perm', resource: 'admin' }
    );
    expect(result.allow).toBe(false);
  });

  it('defaults resource to admin with legacy positional signature', async () => {
    mocks.authorize.mockResolvedValue({ allow: false, reason: 'denied' });
    const result = await ensureAdminMutationAccess({}, { sub: 'u1' }, 'some.perm');
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { sub: 'u1' },
      { action: 'some.perm', resource: 'admin' }
    );
    expect(result.allow).toBe(false);
  });

  it('delegates missing env to authorize so it can return server_error', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'some.perm',
    });
    const result = await ensureAdminMutationAccess({
      user: { sub: 'u1' },
      permission: 'some.perm',
      resource: 'admin',
    });
    expect(result).toEqual({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'some.perm',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      undefined,
      { sub: 'u1' },
      { action: 'some.perm', resource: 'admin' }
    );
  });

  it('delegates missing user to authorize so it can return unauthorized', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'unauthorized',
      reason: 'account_not_active',
      action: 'some.perm',
    });
    const result = await ensureAdminMutationAccess({
      env: {},
      permission: 'some.perm',
      resource: 'admin',
    });
    expect(result).toEqual({
      allow: false,
      code: 'unauthorized',
      reason: 'account_not_active',
      action: 'some.perm',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith({}, undefined, {
      action: 'some.perm',
      resource: 'admin',
    });
  });

  it('normalizes null options to {} and delegates to authorize', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'unknown',
    });
    const result = await ensureAdminMutationAccess(null);
    expect(result).toEqual({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'unknown',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(undefined, undefined, {
      action: undefined,
      resource: 'admin',
    });
  });

  it('delegates non-object env to authorize', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'some.perm',
    });
    const result = await ensureAdminMutationAccess({
      env: 'string',
      user: { sub: 'u1' },
      permission: 'some.perm',
    });
    expect(result).toEqual({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'some.perm',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      'string',
      { sub: 'u1' },
      { action: 'some.perm', resource: 'admin' }
    );
  });

  it('normalizes null env in legacy positional signature and delegates to authorize', async () => {
    mocks.authorize.mockResolvedValue({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'some.perm',
    });
    const result = await ensureAdminMutationAccess(null, { sub: 'u1' }, 'some.perm', 'admin');
    expect(result).toEqual({
      allow: false,
      code: 'server_error',
      reason: 'invalid_request',
      action: 'some.perm',
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(
      {},
      { sub: 'u1' },
      { action: 'some.perm', resource: 'admin' }
    );
  });
});
