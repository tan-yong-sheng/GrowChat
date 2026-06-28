import { describe, expect, it } from 'vitest';
import { isAdmin, requireAdmin, requireRole, isValidEmail } from './rbac.js';

describe('rbac (re-export)', () => {
  it('re-exports isAdmin from role-policy', () => {
    expect(isAdmin).toBeInstanceOf(Function);
    expect(isAdmin({ primary_role: 'admin' })).toBe(true);
    expect(isAdmin({ primary_role: 'member' })).toBe(false);
  });

  it('re-exports requireAdmin from role-policy', () => {
    expect(requireAdmin).toBeInstanceOf(Function);
    expect(requireAdmin({ primary_role: 'admin' })).toBe(true);
    expect(requireAdmin({ primary_role: 'member' })).toBe(false);
  });

  it('re-exports requireRole from role-policy', () => {
    expect(requireRole).toBeInstanceOf(Function);
    expect(requireRole({ primary_role: 'member' }, ['member'])).toBe(true);
    expect(requireRole({ primary_role: 'member' }, ['admin'])).toBe(false);
  });

  it('re-exports isValidEmail from validation/request', () => {
    expect(isValidEmail).toBeInstanceOf(Function);
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });
});
