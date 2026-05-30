import { describe, expect, it } from 'vitest';
import { normalizePublicRole } from './user-role.js';

describe('user-role', () => {
  describe('normalizePublicRole', () => {
    it('returns admin for admin input', () => {
      expect(normalizePublicRole('admin')).toBe('admin');
    });

    it('returns member for member input', () => {
      expect(normalizePublicRole('member')).toBe('member');
    });

    it('returns member for unknown roles', () => {
      expect(normalizePublicRole('viewer')).toBe('member');
      expect(normalizePublicRole('superadmin')).toBe('member');
    });

    it('is case-insensitive', () => {
      expect(normalizePublicRole('Admin')).toBe('admin');
      expect(normalizePublicRole('ADMIN')).toBe('admin');
      expect(normalizePublicRole('Member')).toBe('member');
    });

    it('trims whitespace', () => {
      expect(normalizePublicRole('  admin  ')).toBe('admin');
    });

    it('returns member for empty string', () => {
      expect(normalizePublicRole('')).toBe('member');
    });

    it('returns member for null/undefined', () => {
      expect(normalizePublicRole(null)).toBe('member');
      expect(normalizePublicRole(undefined)).toBe('member');
    });
  });
});
