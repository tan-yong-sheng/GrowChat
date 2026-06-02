import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  createRootLogger: vi.fn(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() })),
  loadUserToolServers: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/logger.js', () => ({
  createRootLogger: (...args) => mocks.createRootLogger(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  loadUserToolServers: (...args) => mocks.loadUserToolServers(...args),
}));

import {
  normalizeAccountStatus,
  normalizeRole,
  resolveRequestedRole,
  syncGlobalRoleBinding,
  loadModelEnabledMap,
  parseSettings,
  parseJsonObject,
} from './users-helpers.js';

describe('users-helpers', () => {
  const db = {
    all: vi.fn(),
    run: vi.fn(),
    first: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('normalizeAccountStatus', () => {
    it('returns active for truthy values', () => {
      expect(normalizeAccountStatus('active')).toBe('active');
      expect(normalizeAccountStatus('ACTIVE')).toBe('active');
    });

    it('returns pending for pending value', () => {
      expect(normalizeAccountStatus('pending')).toBe('pending');
      expect(normalizeAccountStatus('PENDING')).toBe('pending');
    });

    it('defaults to active for other values', () => {
      expect(normalizeAccountStatus('unknown')).toBe('active');
      expect(normalizeAccountStatus('')).toBe('active');
    });

    it('uses fallback', () => {
      expect(normalizeAccountStatus(null, 'pending')).toBe('pending');
      expect(normalizeAccountStatus(undefined)).toBe('active');
    });
  });

  describe('normalizeRole', () => {
    it('returns trimmed string', () => {
      expect(normalizeRole('  admin  ')).toBe('admin');
    });

    it('returns empty string for null/undefined', () => {
      expect(normalizeRole(null)).toBe('');
      expect(normalizeRole(undefined)).toBe('');
    });
  });

  describe('resolveRequestedRole', () => {
    it('returns role from DB when found', async () => {
      db.first.mockResolvedValue({ name: 'Admin' });
      const result = await resolveRequestedRole(db, 'admin');
      expect(result).toBe('Admin');
    });

    it('returns null for empty input', async () => {
      const result = await resolveRequestedRole(db, '');
      expect(result).toBeNull();
    });

    it('falls back when roles table missing', async () => {
      db.first.mockRejectedValue(new Error('no such table: roles'));
      const result = await resolveRequestedRole(db, 'member');
      expect(result).toBe('member');
    });

    it('returns null for unknown role with missing table', async () => {
      db.first.mockRejectedValue(new Error('no such table: roles'));
      const result = await resolveRequestedRole(db, 'unknown');
      expect(result).toBeNull();
    });
  });

  describe('syncGlobalRoleBinding', () => {
    it('syncs role binding for active user', async () => {
      db.run.mockResolvedValue(undefined);
      await syncGlobalRoleBinding(db, 'u1', 'member', 'active');
      expect(db.run).toHaveBeenCalledTimes(2);
    });

    it('skips binding for non-active user', async () => {
      db.run.mockResolvedValue(undefined);
      await syncGlobalRoleBinding(db, 'u1', 'member', 'pending');
      expect(db.run).toHaveBeenCalledTimes(1); // Only DELETE
    });

    it('handles missing table gracefully', async () => {
      db.run.mockRejectedValueOnce(new Error('no such table: user_roles'));
      await expect(syncGlobalRoleBinding(db, 'u1', 'member', 'active')).resolves.not.toThrow();
    });
  });

  describe('loadModelEnabledMap', () => {
    it('returns map from DB rows', async () => {
      db.run.mockResolvedValue(undefined);
      db.all.mockResolvedValue([
        { model_id: 'gpt-4', is_enabled: 1 },
        { model_id: 'gpt-3', is_enabled: 0 },
      ]);
      const result = await loadModelEnabledMap(db);
      expect(result.get('gpt-4')).toBe(true);
      expect(result.get('gpt-3')).toBe(false);
    });

    it('returns empty map on error', async () => {
      db.run.mockRejectedValue(new Error('fail'));
      const result = await loadModelEnabledMap(db);
      expect(result.size).toBe(0);
    });
  });

  describe('parseSettings', () => {
    it('parses valid JSON', () => {
      expect(parseSettings('{"key":"val"}')).toEqual({ key: 'val' });
    });

    it('returns empty object for null', () => {
      expect(parseSettings(null)).toEqual({});
    });

    it('returns empty object for invalid JSON', () => {
      expect(parseSettings('not-json')).toEqual({});
    });

    it('returns empty object for array', () => {
      expect(parseSettings('[1,2]')).toEqual({});
    });
  });

  describe('parseJsonObject', () => {
    it('returns object directly', () => {
      expect(parseJsonObject({ key: 'val' })).toEqual({ key: 'val' });
    });

    it('parses JSON string', () => {
      expect(parseJsonObject('{"key":"val"}')).toEqual({ key: 'val' });
    });

    it('returns null for invalid JSON', () => {
      expect(parseJsonObject('bad')).toBeNull();
    });

    it('returns null for array', () => {
      expect(parseJsonObject('[1]')).toBeNull();
    });
  });
});
