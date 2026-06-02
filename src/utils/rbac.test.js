import { describe, expect, it } from 'vitest';
import { isAdmin, requireAdmin, requireRole, isValidEmail } from './rbac.js';

describe('rbac (re-export)', () => {
  it('re-exports isAdmin from role-policy', () => {
    expect(isAdmin).toBeInstanceOf(Function);
    expect(isAdmin({ primary_role: 'admin' })).toBe(true);
  });

  it('re-exports requireAdmin from role-policy', () => {
    expect(requireAdmin).toBeInstanceOf(Function);
  });

  it('re-exports requireRole from role-policy', () => {
    expect(requireRole).toBeInstanceOf(Function);
  });

  it('re-exports isValidEmail from validation/request', () => {
    expect(isValidEmail).toBeInstanceOf(Function);
  });
});
