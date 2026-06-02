import { describe, expect, it, vi } from 'vitest';
import { getConfigValue, getConfigBool, setConfigValue } from './app-config.js';

describe('app-config', () => {
  describe('getConfigValue', () => {
    it('returns the value from db when key exists', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: 'hello' }) };
      const result = await getConfigValue(db, 'test_key');
      expect(result).toBe('hello');
      expect(db.first).toHaveBeenCalledWith(
        'SELECT value FROM app_config WHERE key = ?',
        ['test_key']
      );
    });

    it('returns fallback when row not found', async () => {
      const db = { first: vi.fn().mockResolvedValue(null) };
      const result = await getConfigValue(db, 'missing_key', 'default');
      expect(result).toBe('default');
    });

    it('returns fallback when row.value is null', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: null }) };
      const result = await getConfigValue(db, 'key', 'fallback');
      expect(result).toBe('fallback');
    });

    it('returns fallback when row.value is undefined', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: undefined }) };
      const result = await getConfigValue(db, 'key', 'fallback');
      expect(result).toBe('fallback');
    });

    it('returns null fallback by default when no row', async () => {
      const db = { first: vi.fn().mockResolvedValue(null) };
      const result = await getConfigValue(db, 'key');
      expect(result).toBeNull();
    });

    it('returns fallback when key is falsy (empty string)', async () => {
      const db = { first: vi.fn() };
      const result = await getConfigValue(db, '', 'fb');
      expect(result).toBe('fb');
      expect(db.first).not.toHaveBeenCalled();
    });

    it('returns fallback when key is null', async () => {
      const db = { first: vi.fn() };
      const result = await getConfigValue(db, null, 'fb');
      expect(result).toBe('fb');
    });

    it('returns fallback when key is undefined', async () => {
      const db = { first: vi.fn() };
      const result = await getConfigValue(db, undefined, 'fb');
      expect(result).toBe('fb');
    });

    it('returns fallback on "no such table: app_config" error', async () => {
      const db = {
        first: vi.fn().mockRejectedValue(new Error('no such table: app_config')),
      };
      const result = await getConfigValue(db, 'key', 'fb');
      expect(result).toBe('fb');
    });

    it('re-throws non-missing-table errors', async () => {
      const err = new Error('database is locked');
      const db = { first: vi.fn().mockRejectedValue(err) };
      await expect(getConfigValue(db, 'key', 'fb')).rejects.toThrow('database is locked');
    });

    it('handles case-insensitive "no such table" match', async () => {
      const db = {
        first: vi.fn().mockRejectedValue(new Error('no such table: APP_CONFIG')),
      };
      const result = await getConfigValue(db, 'key', 'fb');
      expect(result).toBe('fb');
    });
  });

  describe('getConfigBool', () => {
    it('returns true for string "true"', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: 'true' }) };
      expect(await getConfigBool(db, 'key')).toBe(true);
    });

    it('returns true for string "1"', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: '1' }) };
      expect(await getConfigBool(db, 'key')).toBe(true);
    });

    it('returns true for string "yes"', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: 'yes' }) };
      expect(await getConfigBool(db, 'key')).toBe(true);
    });

    it('returns true for string "on"', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: 'on' }) };
      expect(await getConfigBool(db, 'key')).toBe(true);
    });

    it('returns false for string "false"', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: 'false' }) };
      expect(await getConfigBool(db, 'key')).toBe(false);
    });

    it('returns false for string "0"', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: '0' }) };
      expect(await getConfigBool(db, 'key')).toBe(false);
    });

    it('returns false for string "no"', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: 'no' }) };
      expect(await getConfigBool(db, 'key')).toBe(false);
    });

    it('returns false for string "off"', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: 'off' }) };
      expect(await getConfigBool(db, 'key')).toBe(false);
    });

    it('returns true for boolean true value', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: true }) };
      expect(await getConfigBool(db, 'key')).toBe(true);
    });

    it('returns false for boolean false value', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: false }) };
      expect(await getConfigBool(db, 'key')).toBe(false);
    });

    it('returns fallback for unrecognised string', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: 'maybe' }) };
      expect(await getConfigBool(db, 'key', true)).toBe(true);
    });

    it('returns fallback (default false) when value is null', async () => {
      const db = { first: vi.fn().mockResolvedValue(null) };
      expect(await getConfigBool(db, 'key')).toBe(false);
    });

    it('returns fallback when value is undefined', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: undefined }) };
      expect(await getConfigBool(db, 'key', true)).toBe(true);
    });

    it('handles uppercase and whitespace in truthy values', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: '  TRUE  ' }) };
      expect(await getConfigBool(db, 'key')).toBe(true);
    });

    it('handles uppercase and whitespace in falsy values', async () => {
      const db = { first: vi.fn().mockResolvedValue({ value: '  FALSE  ' }) };
      expect(await getConfigBool(db, 'key')).toBe(false);
    });
  });

  describe('setConfigValue', () => {
    it('calls db.run with upsert SQL', async () => {
      const db = { run: vi.fn().mockResolvedValue() };
      await setConfigValue(db, 'key1', 'val1');
      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO app_config'),
        ['key1', 'val1']
      );
    });

    it('does nothing when key is falsy (empty string)', async () => {
      const db = { run: vi.fn() };
      await setConfigValue(db, '', 'val');
      expect(db.run).not.toHaveBeenCalled();
    });

    it('does nothing when key is null', async () => {
      const db = { run: vi.fn() };
      await setConfigValue(db, null, 'val');
      expect(db.run).not.toHaveBeenCalled();
    });

    it('does nothing when key is undefined', async () => {
      const db = { run: vi.fn() };
      await setConfigValue(db, undefined, 'val');
      expect(db.run).not.toHaveBeenCalled();
    });

    it('swallows "no such table: app_config" error', async () => {
      const db = {
        run: vi.fn().mockRejectedValue(new Error('no such table: app_config')),
      };
      // Should not throw
      await setConfigValue(db, 'key', 'val');
    });

    it('re-throws non-missing-table errors', async () => {
      const err = new Error('disk full');
      const db = { run: vi.fn().mockRejectedValue(err) };
      await expect(setConfigValue(db, 'key', 'val')).rejects.toThrow('disk full');
    });

    it('handles case-insensitive "no such table" error', async () => {
      const db = {
        run: vi.fn().mockRejectedValue(new Error('no such table: APP_CONFIG')),
      };
      await setConfigValue(db, 'key', 'val');
    });
  });
});
