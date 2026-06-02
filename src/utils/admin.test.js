import { describe, expect, it } from 'vitest';
import { isAdmin, requireAdmin } from './admin.js';

describe('admin (re-export)', () => {
  it('re-exports isAdmin from role-policy', () => {
    expect(isAdmin).toBeInstanceOf(Function);
    expect(isAdmin({ primary_role: 'admin' })).toBe(true);
    expect(isAdmin({ primary_role: 'member' })).toBeFalsy();
  });

  it('re-exports requireAdmin from role-policy', () => {
    expect(requireAdmin).toBeInstanceOf(Function);
    expect(requireAdmin({ primary_role: 'admin' })).toBe(true);
    expect(requireAdmin({ primary_role: 'member' })).toBeFalsy();
  });
});
