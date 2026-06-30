import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createUserOpenAIConnection,
  getUserOpenAIConnectionConfig,
  updateUserOpenAIConnection,
  deleteUserOpenAIConnection,
  loadUserOpenAIConnectionConfigs,
} from '../../src/llm/connections-user.js';
import { normalizeBaseUrl } from '../../src/llm/connections-utils.js';

// Mock crypto.randomUUID for predictable IDs in tests
const originalRandomUUID = globalThis.crypto?.randomUUID;
beforeEach(() => {
  globalThis.crypto.randomUUID = () => 'test-uuid-1234';
});
afterEach(() => {
  if (originalRandomUUID) {
    globalThis.crypto.randomUUID = originalRandomUUID;
  }
});

function makeMockDb(overrides = {}) {
  let rows = [];
  const db = {
    run: vi.fn().mockResolvedValue({ success: true, changes: 1 }),
    first: vi.fn().mockImplementation(async (sql, params) => {
      const match = rows.find((r) => {
        if (params?.length >= 2 && r.user_id === params[0] && r.id === params[1]) return true;
        return false;
      });
      return match || null;
    }),
    all: vi.fn().mockResolvedValue([]),
    _rows: rows,
    _setRows(newRows) {
      rows = newRows;
    },
    _insertRow(row) {
      rows.push(row);
    },
    ...overrides,
  };
  return db;
}

describe('connections-user', () => {
  describe('loadUserOpenAIConnectionConfigs', () => {
    it('returns empty array when db is missing', async () => {
      const result = await loadUserOpenAIConnectionConfigs({ db: null, userId: 'u1' });
      expect(result).toEqual([]);
    });

    it('returns empty array when userId is missing', async () => {
      const db = makeMockDb();
      const result = await loadUserOpenAIConnectionConfigs({ db, userId: null });
      expect(result).toEqual([]);
    });

    it('filters out disabled connections by default', async () => {
      const db = makeMockDb();
      db.all.mockResolvedValue([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'Enabled',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: 'c2',
          user_id: 'u1',
          name: 'Disabled',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 0,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await loadUserOpenAIConnectionConfigs({ db, userId: 'u1' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('c1');
      expect(result[0].enabled).toBe(true);
    });

    it('includes disabled connections when requested', async () => {
      const db = makeMockDb();
      db.all.mockResolvedValue([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'Enabled',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: 'c2',
          user_id: 'u1',
          name: 'Disabled',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 0,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await loadUserOpenAIConnectionConfigs({ db, userId: 'u1', options: { includeDisabled: true } });
      expect(result).toHaveLength(2);
    });

    it('returns empty array when rawRows is not an array', async () => {
      const db = makeMockDb();
      db.all.mockResolvedValue(null);
      const result = await loadUserOpenAIConnectionConfigs({ db, userId: 'u1' });
      expect(result).toEqual([]);
    });

    it('returns empty array and logs warning on error', async () => {
      const db = makeMockDb();
      db.all.mockRejectedValue(new Error('db crash'));
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await loadUserOpenAIConnectionConfigs({ db, userId: 'u1' });
      expect(result).toEqual([]);
      consoleWarn.mockRestore();
    });
  });

  describe('getUserOpenAIConnectionConfig', () => {
    it('returns null when db is missing', async () => {
      const result = await getUserOpenAIConnectionConfig({ db: null, userId: 'u1', connectionId: 'c1' });
      expect(result).toBeNull();
    });

    it('returns null when userId is missing', async () => {
      const db = makeMockDb();
      const result = await getUserOpenAIConnectionConfig({ db, userId: null, connectionId: 'c1' });
      expect(result).toBeNull();
    });

    it('returns null when connectionId is missing', async () => {
      const db = makeMockDb();
      const result = await getUserOpenAIConnectionConfig({ db, userId: 'u1', connectionId: null });
      expect(result).toBeNull();
    });

    it('returns null when connection is not found', async () => {
      const db = makeMockDb();
      db._setRows([]);
      const result = await getUserOpenAIConnectionConfig({ db, userId: 'u1', connectionId: 'c1' });
      expect(result).toBeNull();
    });

    it('returns null for wrong user (access denied)', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u2',
          name: 'Other User Connection',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await getUserOpenAIConnectionConfig({ db, userId: 'u1', connectionId: 'c1' });
      expect(result).toBeNull();
    });

    it('returns normalized connection when found', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'My Connection',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: 'secret',
          headers: '{"X-Custom":"1"}',
          auth_type: 'bearer',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await getUserOpenAIConnectionConfig({ db, userId: 'u1', connectionId: 'c1' });
      expect(result).toMatchObject({
        id: 'c1',
        name: 'My Connection',
        baseUrl: 'https://api.openai.com/v1',
        key: 'secret',
        headers: { 'X-Custom': '1' },
        authType: 'bearer',
        enabled: true,
        source: 'user',
      });
    });

    it('returns null and logs warning on error', async () => {
      const db = makeMockDb();
      db.first.mockRejectedValue(new Error('db crash'));
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await getUserOpenAIConnectionConfig({ db, userId: 'u1', connectionId: 'c1' });
      expect(result).toBeNull();
      consoleWarn.mockRestore();
    });
  });

  describe('createUserOpenAIConnection', () => {
    it('throws when db is missing', async () => {
      await expect(
        createUserOpenAIConnection({ db: null, userId: 'u1', input: { name: 'Test', base_url: 'https://x.com' } })
      ).rejects.toThrow('User id is required');
    });

    it('throws when userId is missing', async () => {
      const db = makeMockDb();
      await expect(
        createUserOpenAIConnection({ db, userId: null, input: { name: 'Test', base_url: 'https://x.com' } })
      ).rejects.toThrow('User id is required');
    });

    it('throws when name is empty string', async () => {
      const db = makeMockDb();
      await expect(
        createUserOpenAIConnection({ db, userId: 'u1', input: { name: '', base_url: 'https://x.com' } })
      ).rejects.toThrow('name is required');
    });

    it('throws when name is whitespace only', async () => {
      const db = makeMockDb();
      await expect(
        createUserOpenAIConnection({ db, userId: 'u1', input: { name: '   ', base_url: 'https://x.com' } })
      ).rejects.toThrow('name is required');
    });

    it('throws when name is missing', async () => {
      const db = makeMockDb();
      await expect(
        createUserOpenAIConnection({ db, userId: 'u1', input: { base_url: 'https://x.com' } })
      ).rejects.toThrow('name is required');
    });

    it('throws when base_url is whitespace only (normalizes to empty)', async () => {
      const db = makeMockDb();
      await expect(
        createUserOpenAIConnection({ db, userId: 'u1', input: { name: 'Test', base_url: '   ' } })
      ).rejects.toThrow('base_url is required');
    });

    it('uses default base_url when base_url is empty string', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'test-uuid-1234',
          user_id: 'u1',
          name: 'Test',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await createUserOpenAIConnection({ db, userId: 'u1', input: { name: 'Test', base_url: '' } });
      expect(result).not.toBeNull();
      const [, params] =
        db.run.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO user_connections')) ||
        [];
      expect(params[4]).toBe('https://api.openai.com/v1'); // default
    });

    it('uses default base_url when base_url is missing', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'test-uuid-1234',
          user_id: 'u1',
          name: 'Test',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await createUserOpenAIConnection({ db, userId: 'u1', input: { name: 'Test' } });
      expect(result).not.toBeNull();
      const [, params] =
        db.run.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO user_connections')) ||
        [];
      expect(params[4]).toBe('https://api.openai.com/v1'); // default
    });

    it('creates connection with empty/whitespace apiKey (treated as empty string)', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'test-uuid-1234',
          user_id: 'u1',
          name: 'Test',
          provider_type: 'openai-compatible',
          base_url: 'https://x.com',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await createUserOpenAIConnection({ db, userId: 'u1', input: {
        name: 'Test',
        base_url: 'https://x.com',
        key: '   ',
      } });
      expect(result).not.toBeNull();
      expect(db.run).toHaveBeenCalled();
      const [, params] =
        db.run.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO user_connections')) ||
        [];
      expect(params[5]).toBe(''); // key is trimmed empty string
    });

    it('creates connection with missing key (defaults to empty string)', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'test-uuid-1234',
          user_id: 'u1',
          name: 'Test',
          provider_type: 'openai-compatible',
          base_url: 'https://x.com',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await createUserOpenAIConnection({ db, userId: 'u1', input: {
        name: 'Test',
        base_url: 'https://x.com',
      } });
      expect(result).not.toBeNull();
      const [, params] =
        db.run.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO user_connections')) ||
        [];
      expect(params[5]).toBe('');
    });

    it('creates connection and returns normalized config', async () => {
      const db = makeMockDb();
      globalThis.crypto.randomUUID = vi.fn().mockReturnValue('conn-test-uuid-1234');

      // Set up db.first to return the inserted row after create
      db._setRows([
        {
          id: 'conn-test-uuid-1234',
          user_id: 'u1',
          name: 'Test Conn',
          provider_type: 'openai-compatible',
          base_url: 'https://api.example.com/v1',
          key: 'sk-test',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);

      const result = await createUserOpenAIConnection({ db, userId: 'u1', input: {
        name: 'Test Conn',
        base_url: 'https://api.example.com/v1',
        key: 'sk-test',
        provider_type: 'openai-compatible',
      } });

      expect(result).toMatchObject({
        name: 'Test Conn',
        baseUrl: 'https://api.example.com/v1',
        key: 'sk-test',
        providerType: 'openai-compatible',
        enabled: true,
        source: 'user',
      });
    });

    it('inserts correct values including manual_models and manual_models_mode', async () => {
      const db = makeMockDb();
      await createUserOpenAIConnection({ db, userId: 'u1', input: {
        name: 'Test',
        base_url: 'https://x.com',
        key: 'k',
        provider_type: 'anthropic',
        enabled: false,
        manual_models: [{ modelId: 'm1', name: 'Model 1' }],
        manual_models_mode: 'some',
      } });
      const [, params] =
        db.run.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO user_connections')) ||
        [];
      expect(params[3]).toBe('anthropic'); // provider_type
      expect(params[5]).toBe('k'); // key
      expect(params[6]).toBe('{}'); // headers
      expect(params[7]).toBe(''); // auth_type
      expect(params[8]).toBe(0); // enabled
      expect(params[9]).toBe('[{"modelId":"m1","name":"Model 1"}]'); // manual_models
      expect(params[10]).toBe('some'); // manual_models_mode
    });
  });

  describe('updateUserOpenAIConnection', () => {
    it('throws when db is missing', async () => {
      await expect(updateUserOpenAIConnection({ db: null, userId: 'u1', connectionId: 'c1', input: { name: 'Test' } })).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('throws when userId is missing', async () => {
      const db = makeMockDb();
      await expect(updateUserOpenAIConnection({ db, userId: null, connectionId: 'c1', input: { name: 'Test' } })).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('throws when connectionId is missing', async () => {
      const db = makeMockDb();
      await expect(updateUserOpenAIConnection({ db, userId: 'u1', connectionId: null, input: { name: 'Test' } })).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('returns null when connection not found', async () => {
      const db = makeMockDb();
      db._setRows([]);
      const result = await updateUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1', input: { name: 'Updated' } });
      expect(result).toBeNull();
    });

    it('preserves existing name when updated name is empty string', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'Old',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await updateUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1', input: { name: '' } });
      expect(result).not.toBeNull();
      expect(result.name).toBe('Old');
    });

    it('throws when updated name is whitespace only', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'Old',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      await expect(updateUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1', input: { name: '   ' } })).rejects.toThrow(
        'name is required'
      );
    });

    it('preserves existing base_url when updated base_url is empty string', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'Old',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await updateUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1', input: { base_url: '' } });
      expect(result).not.toBeNull();
      expect(result.baseUrl).toBe('https://api.openai.com/v1');
    });

    it('throws when updated base_url is whitespace only', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'Old',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      await expect(updateUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1', input: { base_url: '   ' } })).rejects.toThrow(
        'base_url is required'
      );
    });

    it('applies partial update preserving existing fields', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'Old Name',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: 'old-key',
          headers: '{"X-Old":"1"}',
          auth_type: 'bearer',
          enabled: 1,
          manual_models: '[{"modelId":"m1","name":"Model 1"}]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);

      const result = await updateUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1', input: { name: 'New Name' } });

      expect(result).not.toBeNull();
      expect(db.run).toHaveBeenCalled();
      const [, params] =
        db.run.mock.calls.find(([sql]) => String(sql).includes('UPDATE user_connections')) || [];
      expect(params[0]).toBe('New Name'); // name
      expect(params[1]).toBe('openai-compatible'); // provider_type preserved
      expect(params[2]).toBe('https://api.openai.com/v1'); // base_url preserved
      expect(params[3]).toBe('old-key'); // key preserved
      expect(params[4]).toBe('{"X-Old":"1"}'); // headers preserved
      expect(params[5]).toBe('bearer'); // auth_type preserved
      expect(params[6]).toBe(1); // enabled preserved
      expect(params[7]).toBe('[{"modelId":"m1","name":"Model 1"}]'); // manual_models preserved
      expect(params[8]).toBe('all'); // manual_models_mode preserved
    });

    it('allows updating provider_type while preserving other fields', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'Old Name',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: 'old-key',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);

      const result = await updateUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1', input: {
        name: 'New Name',
        provider_type: 'anthropic',
      } });

      expect(result).not.toBeNull();
      const [, params] =
        db.run.mock.calls.find(([sql]) => String(sql).includes('UPDATE user_connections')) || [];
      expect(params[0]).toBe('New Name');
      expect(params[1]).toBe('anthropic');
      expect(params[2]).toBe('https://api.openai.com/v1'); // base_url preserved from existing
    });
  });

  describe('deleteUserOpenAIConnection', () => {
    it('throws when db is missing', async () => {
      await expect(deleteUserOpenAIConnection({ db: null, userId: 'u1', connectionId: 'c1' })).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('throws when userId is missing', async () => {
      const db = makeMockDb();
      await expect(deleteUserOpenAIConnection({ db, userId: null, connectionId: 'c1' })).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('throws when connectionId is missing', async () => {
      const db = makeMockDb();
      await expect(deleteUserOpenAIConnection({ db, userId: 'u1', connectionId: null })).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('returns false when connection not found', async () => {
      const db = makeMockDb();
      db._setRows([]);
      const result = await deleteUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1' });
      expect(result).toBe(false);
    });

    it('returns true and runs DELETE when connection exists', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u1',
          name: 'To Delete',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await deleteUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1' });
      expect(result).toBe(true);
      expect(db.run).toHaveBeenCalledWith(
        'DELETE FROM user_connections WHERE user_id = ? AND id = ?',
        ['u1', 'c1']
      );
    });

    it('returns false for wrong user (cannot access connection to delete)', async () => {
      const db = makeMockDb();
      db._setRows([
        {
          id: 'c1',
          user_id: 'u2',
          name: 'Other User',
          provider_type: 'openai-compatible',
          base_url: 'https://api.openai.com/v1',
          key: '',
          headers: '{}',
          auth_type: '',
          enabled: 1,
          manual_models: '[]',
          manual_models_mode: 'all',
          created_at: 1,
          updated_at: 1,
        },
      ]);
      const result = await deleteUserOpenAIConnection({ db, userId: 'u1', connectionId: 'c1' });
      expect(result).toBe(false);
    });
  });
});

describe('normalizeBaseUrl', () => {
  it('returns empty string for undefined', () => {
    expect(normalizeBaseUrl(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(normalizeBaseUrl(null)).toBe('');
  });

  it('does not stringify undefined to "undefined"', () => {
    // This guards against mutations that remove the null-check before String(v)
    const result = normalizeBaseUrl(undefined);
    expect(result).not.toBe('undefined');
    expect(result).toBeFalsy();
  });

  it('does not stringify null to "null"', () => {
    const result = normalizeBaseUrl(null);
    expect(result).not.toBe('null');
    expect(result).toBeFalsy();
  });

  it('trims whitespace from URL', () => {
    expect(normalizeBaseUrl('  https://example.com/v1  ')).toBe('https://example.com/v1');
  });

  it('removes trailing slash', () => {
    expect(normalizeBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeBaseUrl('')).toBe('');
  });

  it('passes through valid URL unchanged except trimming slash', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
  });
});
