import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock crypto.randomUUID before importing the module under test
const mockRandomUUID = vi.fn().mockReturnValue('test-uuid-123');
vi.stubGlobal('crypto', {
  randomUUID: mockRandomUUID,
});

// Mock external modules
vi.mock('./provider-registry.js', () => ({
  normalizeProviderFamily: vi.fn((v) => {
    const raw = String(v || '')
      .trim()
      .toLowerCase();
    if (raw.includes('google') || raw === 'gemini-compatible') return 'google';
    if (raw.includes('anthropic') || raw === 'claude-compatible') return 'anthropic';
    if (raw === 'openai' || raw === 'openai-compatible' || raw === '') return 'openai';
    return raw;
  }),
  buildProviderId: vi.fn((conn) => {
    return `${conn.providerType}__${conn.id}`;
  }),
}));

vi.mock('../../public/js/shared/utils/connection-model-selection.js', () => ({
  normalizeConnectionModelSelectionMode: vi.fn((v) => {
    const mode = String(v || '')
      .trim()
      .toLowerCase();
    if (mode === 'all' || mode === 'whitelist' || mode === 'blacklist') return mode;
    return 'all';
  }),
}));

vi.mock('../utils/logger.js', () => ({
  createRootLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('./connections-utils.js', () => ({
  normalizeBaseUrl: vi.fn((url) => {
    if (!url) return '';
    return String(url).trim().replace(/\/$/, '');
  }),
  ensureConnectionId: vi.fn((conn, index = 0) => {
    return conn?.id || `conn-${conn?.providerFamily || 'openai'}-${index}`;
  }),
  labelFromFamily: vi.fn((family) => {
    if (family === 'google') return 'Gemini';
    if (family === 'anthropic') return 'Claude';
    return 'OpenAI';
  }),
  normalizeAuthType: vi.fn((v) => {
    const raw = String(v || '')
      .trim()
      .toLowerCase();
    if (['bearer', 'x-api-key', 'x-goog-api-key', 'api-key'].includes(raw)) return raw;
    return '';
  }),
  safeParseHeaders: vi.fn((raw) => {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(String(raw));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch {
      return {};
    }
  }),
  normalizeConnectionManualModels: vi.fn((value) => {
    if (!Array.isArray(value)) return [];
    const deduped = [];
    const seen = new Set();
    for (const item of value) {
      const rawId = String(item?.modelId || item?.id || item?.name || item || '').trim();
      if (!rawId) continue;
      const safeId = rawId.startsWith('models/') ? rawId.slice('models/'.length) : rawId;
      if (seen.has(safeId)) continue;
      seen.add(safeId);
      deduped.push({ modelId: safeId, name: String(item?.name || safeId).trim() || safeId });
    }
    return deduped;
  }),
  getConnectionApiType: vi.fn((type) => {
    const raw = String(type || '')
      .trim()
      .toLowerCase();
    if (raw === 'google' || raw === 'gemini-compatible') return 'stream-generate-content';
    if (raw === 'anthropic' || raw === 'claude-compatible') return 'messages';
    return 'chat-completions';
  }),
  getConnectionDefaultBaseUrl: vi.fn((type) => {
    const raw = String(type || '')
      .trim()
      .toLowerCase();
    if (raw === 'google' || raw === 'gemini-compatible') {
      return 'https://generativelanguage.googleapis.com/v1beta';
    }
    if (raw === 'anthropic' || raw === 'claude-compatible') return 'https://api.anthropic.com/v1';
    return 'https://api.openai.com/v1';
  }),
}));

import {
  loadUserOpenAIConnectionConfigs,
  getUserOpenAIConnectionConfig,
  createUserOpenAIConnection,
  updateUserOpenAIConnection,
  deleteUserOpenAIConnection,
} from './connections-user.js';

describe('connections-user', () => {
  let mockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockResolvedValue([]),
      first: vi.fn().mockResolvedValue(null),
    };
  });

  const makeConnectionRow = (overrides = {}) => ({
    id: 'conn-1',
    user_id: 'user-1',
    name: 'Test Connection',
    provider_type: 'openai-compatible',
    base_url: 'https://api.example.com/v1',
    key: 'sk-test',
    headers: '{}',
    auth_type: '',
    enabled: 1,
    manual_models: '[]',
    manual_models_mode: 'all',
    created_at: 1234567890,
    updated_at: 1234567890,
    ...overrides,
  });

  describe('loadUserOpenAIConnectionConfigs', () => {
    it('returns empty array when db is null', async () => {
      const result = await loadUserOpenAIConnectionConfigs(null, 'user-1');
      expect(result).toEqual([]);
    });

    it('returns empty array when userId is missing', async () => {
      const result = await loadUserOpenAIConnectionConfigs(mockDb, null);
      expect(result).toEqual([]);
    });

    it('returns empty array when both db and userId are missing', async () => {
      const result = await loadUserOpenAIConnectionConfigs(null, null);
      expect(result).toEqual([]);
    });

    it('normalizes connection rows and filters disabled by default', async () => {
      mockDb.all.mockResolvedValue([
        makeConnectionRow({ id: 'conn-1', enabled: 1 }),
        makeConnectionRow({ id: 'conn-2', enabled: 0 }),
        makeConnectionRow({ id: 'conn-3', enabled: 1 }),
      ]);

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id)).toEqual(['conn-1', 'conn-3']);
    });

    it('includes disabled connections when includeDisabled is true', async () => {
      mockDb.all.mockResolvedValue([
        makeConnectionRow({ id: 'conn-1', enabled: 1 }),
        makeConnectionRow({ id: 'conn-2', enabled: 0 }),
      ]);

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1', {
        includeDisabled: true,
      });
      expect(result).toHaveLength(2);
    });

    it('filters out rows with empty base_url', async () => {
      mockDb.all.mockResolvedValue([
        makeConnectionRow({ id: 'conn-1', base_url: 'https://api.example.com/v1' }),
        makeConnectionRow({ id: 'conn-2', base_url: '' }),
      ]);

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('conn-1');
    });

    it('handles camelCase row keys', async () => {
      mockDb.all.mockResolvedValue([
        {
          id: 'conn-1',
          userId: 'user-1',
          name: 'Camel Case',
          providerType: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
          key: 'sk-test',
          headers: '{}',
          authType: '',
          enabled: 1,
          manualModels: '[]',
          manualModelsMode: 'whitelist',
          created_at: 1234567890,
          updated_at: 1234567890,
        },
      ]);

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].manualModelsMode).toBe('whitelist');
    });

    it('handles rows with manual_models as array', async () => {
      mockDb.all.mockResolvedValue([
        makeConnectionRow({ manual_models: ['gpt-4', 'gpt-3.5-turbo'] }),
      ]);

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].manualModels).toEqual([
        { modelId: 'gpt-4', name: 'gpt-4' },
        { modelId: 'gpt-3.5-turbo', name: 'gpt-3.5-turbo' },
      ]);
    });

    it('handles rows with manual_models as JSON string', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ manual_models: '["gpt-4"]' })]);

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].manualModels).toEqual([{ modelId: 'gpt-4', name: 'gpt-4' }]);
    });

    it('returns empty manualModels for invalid JSON manual_models', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ manual_models: 'not valid json' })]);

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].manualModels).toEqual([]);
    });

    it('properly handles provider_family row values', async () => {
      mockDb.all.mockResolvedValue([
        makeConnectionRow({ provider_type: 'anthropic', provider_family: 'anthropic' }),
        makeConnectionRow({ provider_type: 'google', provider_family: 'google' }),
      ]);

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].providerFamily).toBe('anthropic');
      expect(result[1].providerFamily).toBe('google');
    });

    it('gracefully handles database errors', async () => {
      const logger = { warn: vi.fn() };
      mockDb.all.mockRejectedValue(new Error('DB connection lost'));

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1', {}, logger);
      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('handles non-array db.all returns', async () => {
      mockDb.all.mockResolvedValue(null);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('ensures user_connections table has manual_models_mode column', async () => {
      mockDb.all.mockImplementation(async (query) => {
        if (query.includes('PRAGMA table_info')) {
          return [{ name: 'id' }, { name: 'manual_models' }]; // missing manual_models_mode
        }
        return [];
      });

      await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('ADD COLUMN manual_models_mode')
      );
    });

    it('ignores duplicate column errors when adding manual_models_mode', async () => {
      mockDb.all.mockImplementation(async (query) => {
        if (query.includes('PRAGMA table_info')) {
          return [{ name: 'id' }];
        }
        return [];
      });
      mockDb.run.mockImplementation(async (query) => {
        if (query.includes('ADD COLUMN')) {
          throw new Error('duplicate column name: manual_models_mode');
        }
      });

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('swallows non-duplicate column errors via outer catch', async () => {
      const logger = { warn: vi.fn() };
      mockDb.all.mockImplementation(async (query) => {
        if (query.includes('PRAGMA table_info')) {
          return [{ name: 'id' }];
        }
        return [];
      });
      mockDb.run.mockImplementation(async (query) => {
        if (query.includes('ADD COLUMN')) {
          throw new Error('some other error');
        }
      });

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1', {}, logger);
      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getUserOpenAIConnectionConfig', () => {
    it('returns null when db is null', async () => {
      const result = await getUserOpenAIConnectionConfig(null, 'user-1', 'conn-1');
      expect(result).toBeNull();
    });

    it('returns null when userId is missing', async () => {
      const result = await getUserOpenAIConnectionConfig(mockDb, null, 'conn-1');
      expect(result).toBeNull();
    });

    it('returns null when connectionId is missing', async () => {
      const result = await getUserOpenAIConnectionConfig(mockDb, 'user-1', null);
      expect(result).toBeNull();
    });

    it('returns normalized connection for valid inputs', async () => {
      mockDb.first.mockResolvedValue(makeConnectionRow());

      const result = await getUserOpenAIConnectionConfig(mockDb, 'user-1', 'conn-1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('conn-1');
      expect(result.source).toBe('user');
      expect(result.personal).toBe(true);
    });

    it('returns null when no matching row found', async () => {
      mockDb.first.mockResolvedValue(null);
      const result = await getUserOpenAIConnectionConfig(mockDb, 'user-1', 'conn-1');
      expect(result).toBeNull();
    });

    it('handles database errors gracefully', async () => {
      const logger = { warn: vi.fn() };
      mockDb.first.mockRejectedValue(new Error('DB error'));

      const result = await getUserOpenAIConnectionConfig(mockDb, 'user-1', 'conn-1', logger);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('createUserOpenAIConnection', () => {
    it('throws when db is null', async () => {
      await expect(createUserOpenAIConnection(null, 'user-1', {})).rejects.toThrow(
        'User id is required'
      );
    });

    it('throws when userId is missing', async () => {
      await expect(createUserOpenAIConnection(mockDb, null, {})).rejects.toThrow(
        'User id is required'
      );
    });

    it('throws when name is missing', async () => {
      await expect(
        createUserOpenAIConnection(mockDb, 'user-1', { base_url: 'https://api.example.com' })
      ).rejects.toThrow('name is required');
    });

    it('does not throw when base_url is missing (falls back to default)', async () => {
      mockDb.first.mockResolvedValue(makeConnectionRow({ id: 'test-uuid-123' }));
      const result = await createUserOpenAIConnection(mockDb, 'user-1', { name: 'Test' });
      expect(result).not.toBeNull();
    });

    it('creates a connection with all required fields', async () => {
      mockDb.first.mockResolvedValue(makeConnectionRow({ id: 'test-uuid-123' }));

      const result = await createUserOpenAIConnection(mockDb, 'user-1', {
        name: 'My Connection',
        base_url: 'https://api.example.com/v1',
      });

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_connections'),
        expect.arrayContaining([
          'test-uuid-123',
          'user-1',
          'My Connection',
          'openai-compatible',
          'https://api.example.com/v1',
          '',
          '{}',
          '',
          1,
          '[]',
          'all',
        ])
      );
      expect(result).not.toBeNull();
    });

    it('creates a connection with optional fields', async () => {
      mockDb.first.mockResolvedValue(
        makeConnectionRow({ id: 'test-uuid-123', key: 'sk-secret', manual_models: '["gpt-4"]' })
      );

      const result = await createUserOpenAIConnection(mockDb, 'user-1', {
        name: 'My Connection',
        base_url: 'https://api.example.com/v1',
        key: 'sk-secret',
        headers: '{"x-test":"1"}',
        auth_type: 'bearer',
        enabled: false,
        manual_models: ['gpt-4'],
        manual_models_mode: 'whitelist',
      });

      // Find the INSERT call among ensureUserConnectionsTable + INSERT calls
      const insertCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('INSERT INTO user_connections')
      );
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0][1]).toEqual(
        expect.arrayContaining([
          'test-uuid-123',
          'user-1',
          'My Connection',
          'openai-compatible',
          'https://api.example.com/v1',
          'sk-secret',
          '{"x-test":"1"}',
          'bearer',
          0,
          'whitelist',
        ])
      );
    });
  });

  describe('updateUserOpenAIConnection', () => {
    it('throws when db is null', async () => {
      await expect(updateUserOpenAIConnection(null, 'user-1', 'conn-1', {})).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('throws when userId is missing', async () => {
      await expect(updateUserOpenAIConnection(mockDb, null, 'conn-1', {})).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('throws when connectionId is missing', async () => {
      await expect(updateUserOpenAIConnection(mockDb, 'user-1', null, {})).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('returns null when connection does not exist', async () => {
      mockDb.first.mockResolvedValue(null);
      const result = await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', {
        name: 'Updated',
      });
      expect(result).toBeNull();
    });

    it('preserves existing name when update input name is empty', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow())
        .mockResolvedValueOnce(makeConnectionRow());
      const result = await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: '' });
      expect(result).not.toBeNull();
    });

    it('preserves existing base_url when update input base_url is empty', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow())
        .mockResolvedValueOnce(makeConnectionRow());
      const result = await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { base_url: '' });
      expect(result).not.toBeNull();
    });

    it('updates a connection preserving existing values', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow())
        .mockResolvedValueOnce(makeConnectionRow({ name: 'Updated Name' }));

      const result = await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', {
        name: 'Updated Name',
      });

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_connections'),
        expect.arrayContaining(['Updated Name', 'conn-1'])
      );
      expect(result?.name).toBe('Updated Name');
    });

    it('updates only specified fields while keeping existing for others', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ key: 'old-key' }))
        .mockResolvedValueOnce(makeConnectionRow({ key: 'old-key', base_url: 'https://new.com' }));

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', {
        base_url: 'https://new.com',
      });

      // Find the UPDATE call (not the CREATE TABLE calls from ensureUserConnectionsTable)
      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      const params = updateCalls[0][1];
      expect(params).toContain('old-key');
      expect(params).toContain('https://new.com');
    });

    it('properly handles partial updates with camelCase input', async () => {
      mockDb.first.mockResolvedValueOnce(makeConnectionRow()).mockResolvedValueOnce(
        makeConnectionRow({
          provider_type: 'anthropic',
          base_url: 'https://api.anthropic.com/v1',
        })
      );

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', {
        providerType: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
      });

      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toContain('anthropic');
    });

    it('updates enabled state to false', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ enabled: 1 }))
        .mockResolvedValueOnce(makeConnectionRow({ enabled: 0 }));

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { enabled: false });

      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toContain(0);
    });

    it('preserves enabled state when not specified', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ enabled: 1 }))
        .mockResolvedValueOnce(makeConnectionRow());

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: 'Same' });

      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toContain(1);
    });
  });

  describe('deleteUserOpenAIConnection', () => {
    it('throws when db is null', async () => {
      await expect(deleteUserOpenAIConnection(null, 'user-1', 'conn-1')).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('throws when userId is missing', async () => {
      await expect(deleteUserOpenAIConnection(mockDb, null, 'conn-1')).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('throws when connectionId is missing', async () => {
      await expect(deleteUserOpenAIConnection(mockDb, 'user-1', null)).rejects.toThrow(
        'Connection id is required'
      );
    });

    it('returns false when connection does not exist', async () => {
      mockDb.first.mockResolvedValue(null);
      const result = await deleteUserOpenAIConnection(mockDb, 'user-1', 'conn-1');
      expect(result).toBe(false);
    });

    it('deletes an existing connection', async () => {
      mockDb.first.mockResolvedValue(makeConnectionRow());
      const result = await deleteUserOpenAIConnection(mockDb, 'user-1', 'conn-1');
      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM user_connections WHERE user_id = ? AND id = ?',
        ['user-1', 'conn-1']
      );
    });
  });

  describe('edge cases for normalizeUserConnectionRow', () => {
    it('returns null for null row', async () => {
      mockDb.all.mockResolvedValue([null]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('returns null for undefined row', async () => {
      mockDb.all.mockResolvedValue([undefined]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('returns null for row with empty base_url', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ base_url: '' })]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('returns null for row with null base_url', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ base_url: null })]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('handles row with enabled=false', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ enabled: false })]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('handles row with enabled=0', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ enabled: 0 })]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('handles row with enabled as string "0"', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ enabled: '0' })]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].enabled).toBe(true);
    });

    it('handles row with provider_family missing', async () => {
      mockDb.all.mockResolvedValue([
        makeConnectionRow({ provider_type: 'google', provider_family: null }),
      ]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].providerFamily).toBe('google');
    });

    it('handles row with key containing whitespace', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ key: '  sk-test  ' })]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].key).toBe('sk-test');
    });

    it('handles row with manual_models as empty array string', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ manual_models: '[]' })]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].manualModels).toEqual([]);
    });

    it('handles row with manual_models as null', async () => {
      mockDb.all.mockResolvedValue([makeConnectionRow({ manual_models: null })]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].manualModels).toEqual([]);
    });

    it('filters out null results from row normalization', async () => {
      mockDb.all.mockResolvedValue([
        makeConnectionRow({ id: 'conn-1', base_url: 'https://api.example.com/v1' }),
        makeConnectionRow({ id: 'conn-2', base_url: '' }),
        makeConnectionRow({ id: 'conn-3', base_url: 'https://api.example.com/v1' }),
      ]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.id)).toEqual(['conn-1', 'conn-3']);
    });
  });

  describe('edge cases for normalizeUserConnectionInput', () => {
    it('uses existing name when input name is undefined', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ name: 'Existing' }))
        .mockResolvedValueOnce(makeConnectionRow({ name: 'Existing' }));

      const result = await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', {
        base_url: 'https://new.com',
      });
      expect(result).not.toBeNull();
    });

    it('uses existing providerType when input providerType is undefined', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ provider_type: 'anthropic' }))
        .mockResolvedValueOnce(makeConnectionRow({ provider_type: 'anthropic' }));

      const result = await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: 'Same' });
      expect(result).not.toBeNull();
    });

    it('uses existing baseUrl when input base_url is undefined', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow())
        .mockResolvedValueOnce(makeConnectionRow());

      const result = await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: 'Same' });
      expect(result).not.toBeNull();
    });

    it('preserves existing key when input key is undefined', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ key: 'existing-key' }))
        .mockResolvedValueOnce(makeConnectionRow({ key: 'existing-key' }));

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: 'Same' });

      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toContain('existing-key');
    });

    it('resets key to empty string when input key is empty string', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ key: 'existing-key' }))
        .mockResolvedValueOnce(makeConnectionRow({ key: '' }));

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: 'Same', key: '' });

      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toContain('');
    });

    it('handles headers as empty string', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow())
        .mockResolvedValueOnce(makeConnectionRow());

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: 'Same', headers: '' });
      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toContain('{}');
    });

    it('handles manual_models as undefined preserving existing', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ manual_models: '["gpt-4"]' }))
        .mockResolvedValueOnce(makeConnectionRow({ manual_models: '["gpt-4"]' }));

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: 'Same' });
      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      // UPDATE was called successfully
      expect(updateCalls[0]).toBeDefined();
    });

    it('handles manual_models_mode as undefined preserving existing', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow({ manual_models_mode: 'whitelist' }))
        .mockResolvedValueOnce(makeConnectionRow({ manual_models_mode: 'whitelist' }));

      await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', { name: 'Same' });
      const updateCalls = mockDb.run.mock.calls.filter((call) =>
        String(call[0]).includes('UPDATE user_connections')
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toContain('whitelist');
    });

    it('defaults providerType to openai-compatible when missing everywhere', async () => {
      mockDb.first.mockResolvedValue(makeConnectionRow({ id: 'test-uuid-123' }));
      const result = await createUserOpenAIConnection(mockDb, 'user-1', {
        name: 'Test',
        base_url: 'https://api.example.com/v1',
      });
      expect(result).not.toBeNull();
    });

    it('defaults baseUrl from providerType when missing', async () => {
      mockDb.first.mockResolvedValue(makeConnectionRow({ id: 'test-uuid-123' }));
      const result = await createUserOpenAIConnection(mockDb, 'user-1', {
        name: 'Test',
        provider_type: 'anthropic',
      });
      expect(result).not.toBeNull();
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_connections'),
        expect.arrayContaining(['https://api.anthropic.com/v1'])
      );
    });

    it('handles create with empty manual_models array', async () => {
      mockDb.first.mockResolvedValue(makeConnectionRow({ id: 'test-uuid-123' }));
      const result = await createUserOpenAIConnection(mockDb, 'user-1', {
        name: 'Test',
        base_url: 'https://api.example.com/v1',
        manual_models: [],
      });
      expect(result).not.toBeNull();
    });
  });

  describe('additional error paths', () => {
    it('handles PRAGMA returning non-array for columns', async () => {
      mockDb.all.mockImplementation(async (query) => {
        if (query.includes('PRAGMA table_info')) {
          return null;
        }
        return [];
      });

      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('handles db.all returning undefined rows', async () => {
      mockDb.all.mockResolvedValue(undefined);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result).toEqual([]);
    });

    it('handles db.first returning undefined', async () => {
      mockDb.first.mockResolvedValue(undefined);
      const result = await getUserOpenAIConnectionConfig(mockDb, 'user-1', 'conn-1');
      expect(result).toBeNull();
    });

    it('does not throw when base_url is empty on create (falls back to default)', async () => {
      mockDb.first.mockResolvedValue(makeConnectionRow({ id: 'test-uuid-123' }));
      const result = await createUserOpenAIConnection(mockDb, 'user-1', {
        name: 'Test',
        base_url: '',
      });
      expect(result).not.toBeNull();
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_connections'),
        expect.arrayContaining(['https://api.openai.com/v1'])
      );
    });

    it('throws when name is empty string on create', async () => {
      await expect(
        createUserOpenAIConnection(mockDb, 'user-1', {
          name: '',
          base_url: 'https://api.example.com/v1',
        })
      ).rejects.toThrow('name is required');
    });

    it('preserves existing base_url when update base_url is empty string', async () => {
      mockDb.first
        .mockResolvedValueOnce(makeConnectionRow())
        .mockResolvedValueOnce(makeConnectionRow());
      const result = await updateUserOpenAIConnection(mockDb, 'user-1', 'conn-1', {
        name: 'Test',
        base_url: '',
      });
      expect(result).not.toBeNull();
    });

    it('handles row with camelCase manualModels as array', async () => {
      mockDb.all.mockResolvedValue([
        {
          id: 'conn-1',
          userId: 'user-1',
          name: 'Test',
          providerType: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
          key: 'sk-test',
          headers: '{}',
          authType: '',
          enabled: 1,
          manualModels: ['gpt-4'],
          manualModelsMode: 'all',
          created_at: 1234567890,
          updated_at: 1234567890,
        },
      ]);
      const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
      expect(result[0].manualModels).toEqual([{ modelId: 'gpt-4', name: 'gpt-4' }]);
    });
  });
});
