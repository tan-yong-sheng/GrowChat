import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  loadUserOpenAIConnectionConfigs,
  getUserOpenAIConnectionConfig,
  createUserOpenAIConnection,
  updateUserOpenAIConnection,
  deleteUserOpenAIConnection,
} from './connections-user.js';

// --- Mocks ---

// Mock crypto.randomUUID
const { mockUuid } = vi.hoisted(() => ({
  mockUuid: vi.fn(() => 'test-uuid-0001'),
}));
vi.mock('node:crypto', () => ({
  default: { randomUUID: mockUuid },
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createRootLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

// Mock provider-registry
vi.mock('./provider-registry.js', () => ({
  normalizeProviderFamily: (v) => {
    const map = {
      openai: 'openai',
      google: 'google',
      anthropic: 'anthropic',
      gemini: 'google',
      claude: 'anthropic',
    };
    return (
      map[
        String(v || '')
          .trim()
          .toLowerCase()
      ] || null
    );
  },
  buildProviderId: ({ id }) => id || 'conn-test',
}));

// Mock connection-model-selection
vi.mock('../../public/js/shared/utils/connection-model-selection.js', () => ({
  normalizeConnectionModelSelectionMode: (v) => {
    const raw = String(v || '')
      .trim()
      .toLowerCase();
    if (raw === 'all' || raw === 'some' || raw === 'none') return raw;
    return '';
  },
}));

function extractManualModelId(item) {
  return String(item?.modelId || item?.id || item?.name || item || '').trim();
}

function stripModelsPrefix(rawId) {
  return rawId.startsWith('models/') ? rawId.slice('models/'.length) : rawId;
}

function buildManualModelEntry(item, safeId) {
  const name = String(item?.name || safeId).trim() || safeId;
  return { modelId: safeId, name };
}

function normalizeManualModel(item) {
  const rawId = extractManualModelId(item);
  if (!rawId) return null;
  return buildManualModelEntry(item, stripModelsPrefix(rawId));
}

// Mock connections-utils — spread the real module so the test exercises the
// actual normalizeUserConnectionRow/Input implementations (the bug being
// verified: these helpers are required for connections-user.js to work).
// Test-specific overrides only need to be added where the test relies on a
// different behavior than the real module.
vi.mock('./connections-utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    normalizeBaseUrl: (url) => (url ? String(url).trim().replace(/\/$/, '') : ''),
    ensureConnectionId: (conn, idx) => conn.id || `conn-${idx}`,
  };
});

// --- Test Helpers ---

function createMockDb(rows = []) {
  const allRows = [...rows];
  return {
    run: vi.fn(async () => {}),
    all: vi.fn(async () => allRows),
    first: vi.fn(async () => allRows[0] || null),
  };
}

function makeRow(overrides = {}) {
  return {
    id: 'conn-test-001',
    user_id: 'user-1',
    name: 'My Connection',
    provider_type: 'openai-compatible',
    base_url: 'https://api.openai.com/v1',
    key: 'sk-test',
    headers: '{}',
    auth_type: '',
    enabled: 1,
    manual_models: '[]',
    manual_models_mode: 'all',
    created_at: 1000000,
    updated_at: 1000000,
    ...overrides,
  };
}

// --- Tests ---

describe('connections-user', () => {
  describe('loadUserOpenAIConnectionConfigs', () => {
    it('returns empty array when db is null', async () => {
      const result = await loadUserOpenAIConnectionConfigs(null, 'user-1');
      expect(result).toEqual([]);
    });

    it('returns empty array when userId is null', async () => {
      const db = createMockDb();
      const result = await loadUserOpenAIConnectionConfigs(db, null);
      expect(result).toEqual([]);
    });

    it('returns empty array when userId is empty', async () => {
      const db = createMockDb();
      const result = await loadUserOpenAIConnectionConfigs(db, '');
      expect(result).toEqual([]);
    });

    it('loads and normalizes user connections', async () => {
      const db = createMockDb([makeRow()]);
      const result = await loadUserOpenAIConnectionConfigs(db, 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].baseUrl).toBe('https://api.openai.com/v1');
      expect(result[0].source).toBe('user');
      expect(result[0].personal).toBe(true);
    });

    it('filters out disabled connections by default', async () => {
      const db = createMockDb([
        makeRow({ id: 'conn-1', name: 'Active', enabled: 1 }),
        makeRow({ id: 'conn-2', name: 'Disabled', enabled: 0 }),
      ]);
      const result = await loadUserOpenAIConnectionConfigs(db, 'user-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active');
    });

    it('includes disabled connections when includeDisabled is true', async () => {
      const db = createMockDb([
        makeRow({ id: 'conn-1', name: 'Active', enabled: 1 }),
        makeRow({ id: 'conn-2', name: 'Disabled', enabled: 0 }),
      ]);
      const result = await loadUserOpenAIConnectionConfigs(db, 'user-1', { includeDisabled: true });
      expect(result).toHaveLength(2);
    });

    it('filters out rows with empty base_url', async () => {
      const db = createMockDb([
        makeRow({ id: 'conn-1', base_url: '' }),
        makeRow({ id: 'conn-2', base_url: 'https://api.openai.com/v1' }),
      ]);
      const result = await loadUserOpenAIConnectionConfigs(db, 'user-1');
      expect(result).toHaveLength(1);
    });

    it('returns empty array on db error', async () => {
      const db = createMockDb();
      db.all.mockRejectedValueOnce(new Error('DB error'));
      const result = await loadUserOpenAIConnectionConfigs(db, 'user-1');
      expect(result).toEqual([]);
    });

    it('handles null rows from db', async () => {
      // normalizeUserConnectionRow(null) returns null which gets filtered out
      const db = createMockDb([null, makeRow()]);
      const result = await loadUserOpenAIConnectionConfigs(db, 'user-1');
      // null row is filtered, valid row should remain
      expect(result).toHaveLength(1);
      expect(result[0].baseUrl).toBe('https://api.openai.com/v1');
      expect(db.all).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = ?'), ['user-1']);
    });

    it('handles empty rows array', async () => {
      const db = createMockDb([]);
      const result = await loadUserOpenAIConnectionConfigs(db, 'user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getUserOpenAIConnectionConfig', () => {
    it('returns null when db is null', async () => {
      const result = await getUserOpenAIConnectionConfig(null, 'user-1', 'conn-1');
      expect(result).toBeNull();
    });

    it('returns null when userId is null', async () => {
      const result = await getUserOpenAIConnectionConfig(createMockDb(), null, 'conn-1');
      expect(result).toBeNull();
    });

    it('returns null when connectionId is null', async () => {
      const result = await getUserOpenAIConnectionConfig(createMockDb(), 'user-1', null);
      expect(result).toBeNull();
    });

    it('returns normalized connection when found', async () => {
      const db = createMockDb([makeRow()]);
      const result = await getUserOpenAIConnectionConfig(db, 'user-1', 'conn-test-001');
      expect(result).not.toBeNull();
      expect(result.baseUrl).toBe('https://api.openai.com/v1');
      expect(db.first).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = ? AND id = ?'),
        ['user-1', 'conn-test-001']
      );
    });

    it('returns null when not found', async () => {
      const db = createMockDb([]);
      const result = await getUserOpenAIConnectionConfig(db, 'user-1', 'nonexistent');
      expect(result).toBeNull();
      expect(db.first).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = ? AND id = ?'),
        ['user-1', 'nonexistent']
      );
    });

    it('returns null on db error', async () => {
      const db = createMockDb();
      db.first.mockRejectedValueOnce(new Error('DB error'));
      const result = await getUserOpenAIConnectionConfig(db, 'user-1', 'conn-1');
      expect(result).toBeNull();
    });
  });

  describe('createUserOpenAIConnection', () => {
    it('throws when db is null', async () => {
      await expect(
        createUserOpenAIConnection({ db: null, userId: 'user-1', input: {} })
      ).rejects.toThrow('User id is required');
    });

    it('handles null input gracefully', async () => {
      const db = createMockDb([makeRow({ id: 'test-uuid-0001' })]);
      // Passing null explicitly should be treated as empty input
      await expect(
        createUserOpenAIConnection({ db: createMockDb(), userId: 'user-1', input: null })
      ).rejects.toThrow('name is required');
    });

    it('throws when userId is null', async () => {
      await expect(
        createUserOpenAIConnection({ db: createMockDb(), userId: null, input: {} })
      ).rejects.toThrow('User id is required');
    });

    it('throws when name is missing', async () => {
      await expect(
        createUserOpenAIConnection({
          db: createMockDb(),
          userId: 'user-1',
          input: {
            base_url: 'https://api.openai.com/v1',
          },
        })
      ).rejects.toThrow('name is required');
    });

    it('uses default base_url when input.base_url is empty', async () => {
      // When base_url is empty/falsy, the code falls back to getConnectionDefaultBaseUrl
      // which returns a non-empty URL, so no error is thrown
      const db = createMockDb([makeRow({ id: 'test-uuid-0001' })]);
      const result = await createUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        input: {
          name: 'Test',
          base_url: '',
        },
      });
      // Falls back to default base URL, no error
      expect(db.run).toHaveBeenCalled();
      const insertCall = db.run.mock.calls.find((c) => c[0]?.includes('INSERT'));
      expect(insertCall).toBeDefined();
      // base_url is the 5th parameter (index 4)
      expect(insertCall[1][4]).toBe('https://api.openai.com/v1');
      expect(result).not.toBeNull();
      expect(result.baseUrl).toBe('https://api.openai.com/v1');
    });

    it('creates a connection and returns it', async () => {
      const db = createMockDb([makeRow({ id: 'test-uuid-0001' })]);
      const result = await createUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        input: {
          name: 'My Connection',
          base_url: 'https://api.openai.com/v1',
          key: 'sk-test',
        },
      });
      expect(db.run).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('generates a UUID for the connection id', async () => {
      const db = createMockDb([makeRow({ id: 'test-uuid-0001' })]);
      await createUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        input: {
          name: 'Test',
          base_url: 'https://api.openai.com/v1',
        },
      });
      expect(mockUuid).toHaveBeenCalled();
    });

    it('sets enabled to 1 by default', async () => {
      const db = createMockDb([makeRow({ id: 'test-uuid-0001' })]);
      await createUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        input: {
          name: 'Test',
          base_url: 'https://api.openai.com/v1',
        },
      });
      const insertCall = db.run.mock.calls.find((c) => c[0]?.includes('INSERT'));
      expect(insertCall).toBeDefined();
      // enabled is the 9th parameter (index 8)
      expect(insertCall[1][8]).toBe(1);
    });

    it('sets enabled to 0 when input.enabled is false', async () => {
      const db = createMockDb([makeRow({ id: 'test-uuid-0001' })]);
      await createUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        input: {
          name: 'Test',
          base_url: 'https://api.openai.com/v1',
          enabled: false,
        },
      });
      const insertCall = db.run.mock.calls.find((c) => c[0]?.includes('INSERT'));
      expect(insertCall[1][8]).toBe(0);
    });
  });

  describe('updateUserOpenAIConnection', () => {
    it('throws when connectionId is null', async () => {
      await expect(
        updateUserOpenAIConnection({
          db: createMockDb(),
          userId: 'user-1',
          connectionId: null,
          input: {},
        })
      ).rejects.toThrow('Connection id is required');
    });

    it('handles null input gracefully', async () => {
      const db = createMockDb([makeRow()]);
      // Passing null explicitly should be treated as empty input - preserves existing name
      const result = await updateUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        connectionId: 'conn-test-001',
        input: null,
      });
      expect(result).not.toBeNull();
      expect(result.name).toBe('My Connection');
    });

    it('returns null when connection does not exist', async () => {
      const db = createMockDb([]);
      const result = await updateUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        connectionId: 'nonexistent',
        input: {
          name: 'Updated',
        },
      });
      expect(result).toBeNull();
    });

    it('updates and returns the connection', async () => {
      const db = createMockDb([makeRow()]);
      const result = await updateUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        connectionId: 'conn-test-001',
        input: {
          name: 'Updated Name',
        },
      });
      expect(db.run).toHaveBeenCalled();
      const updateCall = db.run.mock.calls.find((c) => c[0]?.includes('UPDATE'));
      expect(updateCall).toBeDefined();
    });

    it('preserves existing values when not provided in input', async () => {
      const db = createMockDb([makeRow()]);
      await updateUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        connectionId: 'conn-test-001',
        input: {
          name: 'New Name',
        },
      });
      const updateCall = db.run.mock.calls.find((c) => c[0]?.includes('UPDATE'));
      expect(updateCall).toBeDefined();
      expect(updateCall[1][0]).toBe('New Name');
    });

    it('throws when name is empty after normalization', async () => {
      const db = createMockDb([makeRow()]);
      await expect(
        updateUserOpenAIConnection({
          db: db,
          userId: 'user-1',
          connectionId: 'conn-test-001',
          input: { name: '   ' },
        })
      ).rejects.toThrow('name is required');
    });
  });

  describe('deleteUserOpenAIConnection', () => {
    it('throws when connectionId is null', async () => {
      await expect(
        deleteUserOpenAIConnection({ db: createMockDb(), userId: 'user-1', connectionId: null })
      ).rejects.toThrow('Connection id is required');
    });

    it('returns false when connection does not exist', async () => {
      const db = createMockDb([]);
      const result = await deleteUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        connectionId: 'nonexistent',
      });
      expect(result).toBe(false);
    });

    it('deletes and returns true when connection exists', async () => {
      const db = createMockDb([makeRow()]);
      const result = await deleteUserOpenAIConnection({
        db: db,
        userId: 'user-1',
        connectionId: 'conn-test-001',
      });
      expect(result).toBe(true);
      const deleteCall = db.run.mock.calls.find((c) => c[0]?.startsWith('DELETE FROM'));
      expect(deleteCall).toBeDefined();
      expect(deleteCall[1]).toEqual(['user-1', 'conn-test-001']);
    });

    it('throws when db is null', async () => {
      await expect(
        deleteUserOpenAIConnection({ db: null, userId: 'user-1', connectionId: 'conn-1' })
      ).rejects.toThrow('Connection id is required');
    });
  });
});
