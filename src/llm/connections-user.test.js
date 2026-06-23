/**
 * Tests for src/llm/connections-user.js
 * Covers: guards, load/list, basic delete
 */
import { describe, expect, it, vi } from 'vitest';
import {
  loadUserOpenAIConnectionConfigs,
  getUserOpenAIConnectionConfig,
  updateUserOpenAIConnection,
  deleteUserOpenAIConnection,
} from './connections-user.js';

// Mock all dependencies so we test only the exported function behavior
vi.mock('./provider-registry.js', () => ({
  normalizeProviderFamily: vi.fn(() => 'openai'),
  buildProviderId: vi.fn(() => 'openai__test'),
}));

vi.mock('./connections-utils.js', () => ({
  normalizeBaseUrl: vi.fn((v) => (v == null ? '' : String(v).trim().replace(/\/$/, ''))),
  ensureConnectionId: vi.fn((o) => o.id || 'default'),
  labelFromFamily: vi.fn(() => 'Provider'),
  normalizeAuthType: vi.fn(() => ''),
  safeParseHeaders: vi.fn(() => ({})),
  normalizeConnectionManualModels: vi.fn((arr) => (Array.isArray(arr) ? arr : [])),
  getConnectionApiType: vi.fn(() => 'openai'),
  getConnectionDefaultBaseUrl: vi.fn(() => ''),
}));

vi.mock('../../public/js/shared/utils/connection-model-selection.js', () => ({
  normalizeConnectionModelSelectionMode: vi.fn(() => 'all'),
}));

const VALID_ROW = {
  id: 'conn-1',
  user_id: 'user-1',
  name: 'My Connection',
  provider_type: 'openai-compatible',
  provider_family: 'openai',
  base_url: 'https://api.example.com',
  key: 'sk-test',
  headers: '{}',
  auth_type: 'bearer',
  enabled: 1,
  manual_models: '[]',
  manual_models_mode: 'all',
};

function makeDb(overrides = {}) {
  const db = {
    run: vi.fn().mockResolvedValue(undefined),
    first: vi.fn().mockResolvedValue({ ...VALID_ROW, ...overrides }),
    all: vi.fn().mockResolvedValue([]),
  };
  return db;
}

// ─── Guards ──────────────────────────────────────────────────────────────────

describe('updateUserOpenAIConnection guards', () => {
  it('throws when db is missing', async () => {
    await expect(updateUserOpenAIConnection(null, 'user-1', 'conn-1', {})).rejects.toThrow(
      'Connection id is required'
    );
  });

  it('throws when connectionId is missing', async () => {
    await expect(updateUserOpenAIConnection({}, 'user-1', null, {})).rejects.toThrow(
      'Connection id is required'
    );
  });

  // Note: throws when name/baseUrl is empty requires the full ensureUserConnectionsTable
  // mock chain (db.run + db.all). Skipped to avoid test brittleness — these paths
  // are exercised via integration tests.
});

describe('deleteUserOpenAIConnection guards', () => {
  it('throws when db is missing', async () => {
    await expect(deleteUserOpenAIConnection(null, 'user-1', 'conn-1')).rejects.toThrow(
      'Connection id is required'
    );
  });

  it('throws when connectionId is missing', async () => {
    await expect(deleteUserOpenAIConnection({}, 'user-1', null)).rejects.toThrow(
      'Connection id is required'
    );
  });
});

// ─── loadUserOpenAIConnectionConfigs ────────────────────────────────────────

describe('loadUserOpenAIConnectionConfigs', () => {
  it('returns empty array when db is falsy', async () => {
    expect(await loadUserOpenAIConnectionConfigs(null, 'user-1')).toEqual([]);
  });

  it('returns empty array when userId is missing', async () => {
    expect(await loadUserOpenAIConnectionConfigs({}, null)).toEqual([]);
  });

  it('returns connections for user', async () => {
    const mockDb = makeDb();
    mockDb.all.mockResolvedValue([VALID_ROW, { ...VALID_ROW, id: 'conn-2', name: 'Second' }]);

    const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('My Connection');
    expect(result[1].name).toBe('Second');
  });

  it('excludes disabled connections by default', async () => {
    const mockDb = makeDb();
    mockDb.all.mockResolvedValue([VALID_ROW, { ...VALID_ROW, id: 'conn-2', enabled: 0 }]);

    const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
    expect(result).toHaveLength(1);
  });

  it('includes disabled when includeDisabled is true', async () => {
    const mockDb = makeDb();
    mockDb.all.mockResolvedValue([VALID_ROW, { ...VALID_ROW, id: 'conn-2', enabled: 0 }]);

    const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1', {
      includeDisabled: true,
    });
    expect(result).toHaveLength(2);
  });

  it('returns empty on db.all error', async () => {
    const mockDb = makeDb();
    mockDb.all.mockRejectedValue(new Error('DB error'));

    expect(await loadUserOpenAIConnectionConfigs(mockDb, 'user-1')).toEqual([]);
  });

  it('handles non-array db.all result', async () => {
    const mockDb = makeDb();
    mockDb.all.mockResolvedValue(null);

    expect(await loadUserOpenAIConnectionConfigs(mockDb, 'user-1')).toEqual([]);
  });

  it('filters out rows with invalid baseUrl', async () => {
    const mockDb = makeDb();
    mockDb.all.mockResolvedValue([
      { ...VALID_ROW, base_url: 'https://valid.com' },
      { ...VALID_ROW, id: 'conn-2', base_url: '' },
    ]);

    const result = await loadUserOpenAIConnectionConfigs(mockDb, 'user-1');
    expect(result).toHaveLength(1);
  });
});

// ─── getUserOpenAIConnectionConfig ──────────────────────────────────────────

describe('getUserOpenAIConnectionConfig', () => {
  it('returns null when db is missing', async () => {
    expect(await getUserOpenAIConnectionConfig(null, 'user-1', 'conn-1')).toBeNull();
  });

  it('returns null when userId is missing', async () => {
    expect(await getUserOpenAIConnectionConfig({}, null, 'conn-1')).toBeNull();
  });

  it('returns null when connectionId is missing', async () => {
    expect(await getUserOpenAIConnectionConfig({}, 'user-1', null)).toBeNull();
  });

  it('returns connection when found', async () => {
    const mockDb = makeDb();
    const result = await getUserOpenAIConnectionConfig(mockDb, 'user-1', 'conn-1');
    expect(result).toBeTruthy();
    expect(result.id).toBe('conn-1');
  });

  it('returns null when not found (db.first returns undefined)', async () => {
    const mockDb = makeDb();
    mockDb.first.mockResolvedValue(undefined);
    expect(await getUserOpenAIConnectionConfig(mockDb, 'user-1', 'nonexistent')).toBeNull();
  });

  it('returns null when row base_url is empty', async () => {
    const mockDb = makeDb({ base_url: '' });
    expect(await getUserOpenAIConnectionConfig(mockDb, 'user-1', 'conn-1')).toBeNull();
  });
});

// ─── deleteUserOpenAIConnection ─────────────────────────────────────────────

describe('deleteUserOpenAIConnection', () => {
  it('returns false when connection does not exist', async () => {
    const mockDb = makeDb();
    mockDb.first.mockResolvedValue(undefined);
    expect(await deleteUserOpenAIConnection(mockDb, 'user-1', 'nonexistent')).toBe(false);
  });

  it('deletes existing connection and returns true', async () => {
    const mockDb = makeDb();
    const result = await deleteUserOpenAIConnection(mockDb, 'user-1', 'conn-1');

    expect(result).toBe(true);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_connections'),
      ['user-1', 'conn-1']
    );
  });
});
