import { describe, expect, it } from 'vitest';
import { isAdmin, requireAdmin, requireRole } from './role-policy.js';

describe('role-policy', () => {
  describe('isAdmin', () => {
    it('returns true for admin user', () => {
      expect(isAdmin({ primary_role: 'admin' })).toBe(true);
    });

    it('returns falsy for non-admin user', () => {
      expect(isAdmin({ primary_role: 'member' })).toBeFalsy();
    });

    it('returns falsy for null user', () => {
      expect(isAdmin(null)).toBeFalsy();
    });

    it('returns falsy for undefined user', () => {
      expect(isAdmin(undefined)).toBeFalsy();
    });
  });

  describe('requireAdmin', () => {
    it('delegates to isAdmin', () => {
      expect(requireAdmin({ primary_role: 'admin' })).toBe(true);
      expect(requireAdmin({ primary_role: 'member' })).toBeFalsy();
      expect(requireAdmin(null)).toBeFalsy();
    });
  });

  describe('requireRole', () => {
    it('returns true when user role is in allowed list', () => {
      expect(requireRole({ primary_role: 'admin' }, ['admin', 'member'])).toBe(true);
    });

    it('returns false when user role is not in allowed list', () => {
      expect(requireRole({ primary_role: 'viewer' }, ['admin', 'member'])).toBe(false);
    });

    it('defaults to admin-only when no allowed list given', () => {
      expect(requireRole({ primary_role: 'admin' })).toBe(true);
      expect(requireRole({ primary_role: 'member' })).toBe(false);
    });

    it('returns falsy for null user', () => {
      expect(requireRole(null, ['admin'])).toBeFalsy();
    });

    it('returns falsy when user has no primary_role', () => {
      expect(requireRole({}, ['admin'])).toBeFalsy();
    });
  });
});
