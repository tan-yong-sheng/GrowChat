import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isValidModelId,
  loadModelAttachmentCaps,
  applyAttachmentDefaults,
  getModelAttachmentCapsEntry,
  ensureModelAccessTable,
  getDisabledModelSet,
  getModelAccessMap,
  loadAttachmentCapsFromRaw,
  applyAttachmentCapsPatch,
  buildModelAttachmentCapSaveStatement,
  splitModelList,
  hasConnectionAuthCredentials,
  shouldSuppressDiscoveryWarning,
  createConnectionDiscoveryCacheKey,
  getConnectionDiscoveryCache,
  pruneExpiredConnectionDiscoveryCache,
  MODEL_ATTACHMENT_CAPS_KEY,
  DEFAULT_ATTACHMENT_CAPS,
  CONNECTION_DISCOVERY_CACHE_TTL_MS,
  connectionDiscoveryCacheByEnv,
  fallbackConnectionDiscoveryCache,
} from '../../src/routers/models/models-helpers.js';

const mockGetConfigValue = vi.hoisted(() => vi.fn());
const mockNormalizeAttachmentCaps = vi.hoisted(() => vi.fn());
const mockNormalizeModelId = vi.hoisted(() => vi.fn());
const mockNormalizeConnectionManualModels = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/app-config.js', () => ({
  getConfigValue: mockGetConfigValue,
}));

vi.mock('../../src/admin/tool-servers.js', () => ({
  normalizeAttachmentCaps: mockNormalizeAttachmentCaps,
  normalizeModelId: mockNormalizeModelId,
}));

vi.mock('../../src/llm/connections.js', () => ({
  normalizeConnectionManualModels: mockNormalizeConnectionManualModels,
}));

vi.mock('../../src/utils/logger.js', () => ({
  createRootLogger: () => ({
    warn: mockLoggerWarn,
    error: mockLoggerError,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockNormalizeAttachmentCaps.mockImplementation((caps, opts) => {
    if (caps === null || caps === undefined) return {};
    return caps;
  });
  mockNormalizeModelId.mockImplementation((id) => id);
  mockNormalizeConnectionManualModels.mockImplementation((models) => models || []);
});

/* ─────────── isValidModelId ─────────── */

describe('isValidModelId', () => {
  it('returns true for valid model id', () => {
    expect(isValidModelId('gpt-4')).toBe(true);
    expect(isValidModelId('model_123')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidModelId('')).toBe(false);
    expect(isValidModelId('   ')).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isValidModelId(null)).toBe(false);
    expect(isValidModelId(undefined)).toBe(false);
  });

  it('returns false for id over 200 chars', () => {
    expect(isValidModelId('a'.repeat(201))).toBe(false);
    expect(isValidModelId('a'.repeat(200))).toBe(true);
  });

  it('returns false for id containing whitespace', () => {
    expect(isValidModelId('model id')).toBe(false);
    expect(isValidModelId('model\tid')).toBe(false);
    expect(isValidModelId('model\nid')).toBe(false);
  });

  it('returns false for number zero', () => {
    expect(isValidModelId(0)).toBe(false);
  });

  it('returns true for non-zero number (converted to string)', () => {
    expect(isValidModelId(123)).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(isValidModelId([])).toBe(false);
  });
});

/* ─────────── loadModelAttachmentCaps ─────────── */

describe('loadModelAttachmentCaps', () => {
  it('returns parsed caps from config', async () => {
    const db = {};
    mockGetConfigValue.mockResolvedValue('{"m1":{"attachments":{"image":true}}}');

    const result = await loadModelAttachmentCaps(db);

    expect(mockGetConfigValue).toHaveBeenCalledWith(db, 'model_attachment_caps_v1', '{}');
    expect(result).toEqual({ m1: { attachments: { image: true } } });
  });

  it('returns empty object when db is falsy', async () => {
    expect(await loadModelAttachmentCaps(null)).toEqual({});
    expect(await loadModelAttachmentCaps(undefined)).toEqual({});
    expect(mockGetConfigValue).not.toHaveBeenCalled();
  });

  it('returns empty object when getConfigValue throws', async () => {
    const db = {};
    mockGetConfigValue.mockRejectedValue(new Error('db error'));

    const result = await loadModelAttachmentCaps(db);

    expect(result).toEqual({});
  });

  it('returns empty object for invalid JSON', async () => {
    const db = {};
    mockGetConfigValue.mockResolvedValue('not-json');

    const result = await loadModelAttachmentCaps(db);

    expect(result).toEqual({});
  });

  it('returns empty object for JSON array', async () => {
    const db = {};
    mockGetConfigValue.mockResolvedValue('[1,2,3]');

    const result = await loadModelAttachmentCaps(db);

    expect(result).toEqual({});
  });
});

/* ─────────── applyAttachmentDefaults ─────────── */

describe('applyAttachmentDefaults', () => {
  it('returns defaults when attachments is null', () => {
    const result = applyAttachmentDefaults(null);
    expect(result).toEqual({ text: true });
  });

  it('returns defaults when attachments is undefined', () => {
    const result = applyAttachmentDefaults(undefined);
    expect(result).toEqual({ text: true });
  });

  it('merges text default into provided caps', () => {
    const result = applyAttachmentDefaults({ image: true, pdf: false });
    expect(result).toEqual({ image: true, pdf: false, text: true });
  });

  it('overwrites text false with true default', () => {
    const result = applyAttachmentDefaults({ text: false });
    expect(result).toHaveProperty('text', true);
  });

  it('does not mutate input', () => {
    const input = { image: true };
    const result = applyAttachmentDefaults(input);
    expect(input).toEqual({ image: true });
    expect(result).not.toBe(input);
  });

  it('returns defaults for primitive string', () => {
    const result = applyAttachmentDefaults('not-an-object');
    expect(result).toEqual({ text: true });
  });

  it('returns defaults for number', () => {
    const result = applyAttachmentDefaults(42);
    expect(result).toEqual({ text: true });
  });
});

/* ─────────── getModelAttachmentCapsEntry ─────────── */

describe('getModelAttachmentCapsEntry', () => {
  it('returns defaults when caps is null', () => {
    expect(getModelAttachmentCapsEntry(null, 'm1')).toEqual({ text: true });
  });

  it('returns defaults when modelId entry missing', () => {
    expect(getModelAttachmentCapsEntry({ other: {} }, 'm1')).toEqual({ text: true });
  });

  it('returns defaults when entry is not an object', () => {
    expect(getModelAttachmentCapsEntry({ m1: 'string' }, 'm1')).toEqual({ text: true });
    expect(getModelAttachmentCapsEntry({ m1: 42 }, 'm1')).toEqual({ text: true });
  });

  it('returns defaults when attachments missing', () => {
    expect(getModelAttachmentCapsEntry({ m1: {} }, 'm1')).toEqual({ text: true });
  });

  it('returns defaults when attachments is not an object', () => {
    expect(getModelAttachmentCapsEntry({ m1: { attachments: 'bad' } }, 'm1')).toEqual({
      text: true,
    });
  });

  it('returns merged caps for valid entry', () => {
    expect(getModelAttachmentCapsEntry({ m1: { attachments: { image: true } } }, 'm1')).toEqual({
      image: true,
      text: true,
    });
  });
});

/* ─────────── ensureModelAccessTable ─────────── */

describe('ensureModelAccessTable', () => {
  it('creates table and index successfully', async () => {
    const db = {
      run: vi.fn().mockResolvedValue(undefined),
    };

    await ensureModelAccessTable(db);

    expect(db.run).toHaveBeenCalledTimes(2);
    expect(db.run.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS model_access');
    expect(db.run.mock.calls[1][0]).toContain(
      'CREATE INDEX IF NOT EXISTS idx_model_access_enabled'
    );
  });

  it('logs warning on error but does not throw', async () => {
    const db = {
      run: vi.fn().mockRejectedValue(new Error('table locked')),
    };

    await ensureModelAccessTable(db);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Failed to ensure model_access table',
      expect.objectContaining({ error: 'table locked' })
    );
  });
});

/* ─────────── getDisabledModelSet ─────────── */

describe('getDisabledModelSet', () => {
  it('returns set of disabled model ids', async () => {
    const db = {
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockResolvedValue([{ model_id: 'm1' }, { model_id: 'm2' }]),
    };

    const result = await getDisabledModelSet(db);

    expect(result).toBeInstanceOf(Set);
    expect(Array.from(result)).toEqual(['m1', 'm2']);
    expect(db.all).toHaveBeenCalledWith('SELECT model_id FROM model_access WHERE is_enabled = 0');
  });

  it('returns empty set when no disabled models', async () => {
    const db = {
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockResolvedValue([]),
    };

    const result = await getDisabledModelSet(db);

    expect(result.size).toBe(0);
  });

  it('returns empty set on error and logs warning', async () => {
    const db = {
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockRejectedValue(new Error('disk full')),
    };

    const result = await getDisabledModelSet(db);

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Failed to read model_access disabled set',
      expect.objectContaining({ error: 'disk full' })
    );
  });
});

/* ─────────── getModelAccessMap ─────────── */

describe('getModelAccessMap', () => {
  it('returns map with enabled=true for is_enabled=1', async () => {
    const db = {
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockResolvedValue([
        { model_id: 'm1', is_enabled: 1 },
        { model_id: 'm2', is_enabled: 0 },
      ]),
    };

    const result = await getModelAccessMap(db);

    expect(result.get('m1')).toBe(true);
    expect(result.get('m2')).toBe(false);
    expect(result.size).toBe(2);
  });

  it('returns empty map on error', async () => {
    const db = {
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockRejectedValue(new Error('timeout')),
    };

    const result = await getModelAccessMap(db);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Failed to read model_access map',
      expect.objectContaining({ error: 'timeout' })
    );
  });

  it('handles rows with is_enabled as truthy non-1', async () => {
    const db = {
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockResolvedValue([{ model_id: 'm1', is_enabled: 2 }]),
    };

    const result = await getModelAccessMap(db);

    expect(result.get('m1')).toBe(false);
  });
});

/* ─────────── loadAttachmentCapsFromRaw ─────────── */

describe('loadAttachmentCapsFromRaw', () => {
  it('parses valid JSON object', () => {
    expect(loadAttachmentCapsFromRaw('{"m1":{"attachments":{}}}')).toEqual({
      m1: { attachments: {} },
    });
  });

  it('returns empty object for invalid JSON', () => {
    expect(loadAttachmentCapsFromRaw('bad')).toEqual({});
    expect(loadAttachmentCapsFromRaw('')).toEqual({});
  });

  it('returns empty object for JSON array', () => {
    expect(loadAttachmentCapsFromRaw('[1,2]')).toEqual({});
  });

  it('returns empty object for JSON null', () => {
    expect(loadAttachmentCapsFromRaw('null')).toEqual({});
  });

  it('returns empty object for JSON string', () => {
    expect(loadAttachmentCapsFromRaw('"hello"')).toEqual({});
  });

  it('uses default parameter', () => {
    expect(loadAttachmentCapsFromRaw()).toEqual({});
  });

  it('returns empty object for JSON number', () => {
    expect(loadAttachmentCapsFromRaw('42')).toEqual({});
  });
});

/* ─────────── applyAttachmentCapsPatch ─────────── */

describe('applyAttachmentCapsPatch', () => {
  it('adds new attachment cap', () => {
    const caps = {};
    mockNormalizeAttachmentCaps.mockReturnValue({ image: true });

    applyAttachmentCapsPatch(caps, { model_id: 'm1', attachments: { image: true } });

    expect(caps.m1).toEqual({ attachments: { image: true }, updated_at: expect.any(Number) });
  });

  it('updates existing attachment cap', () => {
    const caps = { m1: { attachments: { image: false }, updated_at: 1000 } };
    mockNormalizeAttachmentCaps.mockReturnValue({ image: true });

    applyAttachmentCapsPatch(caps, { model_id: 'm1', attachments: { image: true } });

    expect(caps.m1.attachments).toEqual({ image: true });
    expect(caps.m1.updated_at).toBeGreaterThan(1000);
  });

  it('removes attachment cap when value is null', () => {
    const caps = { m1: { attachments: { image: true, pdf: false } } };
    mockNormalizeAttachmentCaps.mockReturnValue({ image: null });

    applyAttachmentCapsPatch(caps, { model_id: 'm1', attachments: { image: null } });

    expect(caps.m1.attachments).not.toHaveProperty('image');
    expect(caps.m1.attachments).toHaveProperty('pdf', false);
  });

  it('throws when model_id is empty after normalization', () => {
    mockNormalizeModelId.mockReturnValue('');

    expect(() => applyAttachmentCapsPatch({}, { model_id: '' })).toThrow('model_id is required');
  });

  it('throws when update has no model_id field', () => {
    mockNormalizeModelId.mockReturnValue('');

    expect(() => applyAttachmentCapsPatch({}, {})).toThrow('model_id is required');
  });

  it('preserves existing non-attachment fields', () => {
    const caps = { m1: { label: 'GPT-4', attachments: {} } };
    mockNormalizeAttachmentCaps.mockReturnValue({ image: true });

    applyAttachmentCapsPatch(caps, { model_id: 'm1', attachments: { image: true } });

    expect(caps.m1.label).toBe('GPT-4');
    expect(caps.m1.attachments).toEqual({ image: true });
  });

  it('handles modelId camelCase key', () => {
    const caps = {};
    mockNormalizeModelId.mockImplementation((id) => id);
    mockNormalizeAttachmentCaps.mockReturnValue({});

    applyAttachmentCapsPatch(caps, { modelId: 'm1' });

    expect(caps.m1).toBeDefined();
  });

  it('handles attachments undefined', () => {
    const caps = {};
    mockNormalizeAttachmentCaps.mockReturnValue({});

    applyAttachmentCapsPatch(caps, { model_id: 'm1' });

    expect(caps.m1).toEqual({ attachments: {}, updated_at: expect.any(Number) });
  });

  it('creates entry when caps[modelId] is primitive', () => {
    const caps = { m1: 'bad' };
    mockNormalizeAttachmentCaps.mockReturnValue({ image: true });

    applyAttachmentCapsPatch(caps, { model_id: 'm1', attachments: { image: true } });

    expect(caps.m1).toEqual({ attachments: { image: true }, updated_at: expect.any(Number) });
  });
});

/* ─────────── buildModelAttachmentCapSaveStatement ─────────── */

describe('buildModelAttachmentCapSaveStatement', () => {
  it('prepares correct SQL statement with caps', () => {
    const prepare = vi.fn().mockReturnValue({ stmt: true });
    const db = { prepare };
    const caps = { m1: { attachments: { image: true } } };

    const result = buildModelAttachmentCapSaveStatement(db, caps);

    expect(prepare).toHaveBeenCalledOnce();
    const [sql, params] = prepare.mock.calls[0];
    expect(sql).toContain('INSERT INTO app_config');
    expect(sql).toContain('ON CONFLICT(key)');
    expect(params[0]).toBe(MODEL_ATTACHMENT_CAPS_KEY);
    expect(params[1]).toBe(JSON.stringify(caps));
    expect(result).toEqual({ stmt: true });
  });

  it('handles null caps', () => {
    const prepare = vi.fn().mockReturnValue({ stmt: true });
    const db = { prepare };

    buildModelAttachmentCapSaveStatement(db, null);

    const [, params] = prepare.mock.calls[0];
    expect(params[1]).toBe('{}');
  });
});

/* ─────────── splitModelList ─────────── */

describe('splitModelList', () => {
  it('splits comma-separated values', () => {
    expect(splitModelList('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('splits semicolon-separated values', () => {
    expect(splitModelList('a;b;c')).toEqual(['a', 'b', 'c']);
  });

  it('splits mixed separators', () => {
    expect(splitModelList('a,b;c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace', () => {
    expect(splitModelList('  a  ,  b  ')).toEqual(['a', 'b']);
  });

  it('filters empty strings', () => {
    expect(splitModelList('a,,b')).toEqual(['a', 'b']);
    expect(splitModelList(',a,b,')).toEqual(['a', 'b']);
  });

  it('returns empty array for empty string', () => {
    expect(splitModelList('')).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(splitModelList(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(splitModelList(undefined)).toEqual([]);
  });

  it('returns empty array for zero', () => {
    expect(splitModelList(0)).toEqual([]);
  });

  it('converts number to string', () => {
    expect(splitModelList(123)).toEqual(['123']);
  });

  it('handles whitespace-only values', () => {
    expect(splitModelList('a,   ,b')).toEqual(['a', 'b']);
  });
});

/* ─────────── hasConnectionAuthCredentials ─────────── */

describe('hasConnectionAuthCredentials', () => {
  it('returns true when key is present', () => {
    expect(hasConnectionAuthCredentials({ key: 'sk-abc123' })).toBe(true);
    expect(hasConnectionAuthCredentials({ key: '  key  ' })).toBe(true);
  });

  it('returns false for empty/whitespace key', () => {
    expect(hasConnectionAuthCredentials({ key: '' })).toBe(false);
    expect(hasConnectionAuthCredentials({ key: '   ' })).toBe(false);
  });

  it('returns true for authorization header', () => {
    expect(hasConnectionAuthCredentials({ headers: { Authorization: 'Bearer tok' } })).toBe(true);
  });

  it('returns true for x-api-key header', () => {
    expect(hasConnectionAuthCredentials({ headers: { 'X-API-Key': 'key' } })).toBe(true);
  });

  it('returns true for x-goog-api-key header', () => {
    expect(hasConnectionAuthCredentials({ headers: { 'X-Goog-Api-Key': 'key' } })).toBe(true);
  });

  it('returns true for api-key header (lowercase)', () => {
    expect(hasConnectionAuthCredentials({ headers: { 'api-key': 'key' } })).toBe(true);
  });

  it('returns false for non-auth headers', () => {
    expect(hasConnectionAuthCredentials({ headers: { 'Content-Type': 'json' } })).toBe(false);
  });

  it('returns false for empty header value', () => {
    expect(hasConnectionAuthCredentials({ headers: { Authorization: '' } })).toBe(false);
    expect(hasConnectionAuthCredentials({ headers: { Authorization: '   ' } })).toBe(false);
  });

  it('returns false when headers is not an object', () => {
    expect(hasConnectionAuthCredentials({ headers: null })).toBe(false);
    expect(hasConnectionAuthCredentials({ headers: 'string' })).toBe(false);
  });

  it('returns false for completely empty connection', () => {
    expect(hasConnectionAuthCredentials({})).toBe(false);
  });

  it('returns false for undefined connection', () => {
    expect(hasConnectionAuthCredentials()).toBe(false);
  });

  it('returns false for null connection', () => {
    expect(hasConnectionAuthCredentials(null)).toBe(false);
  });

  it('handles multiple headers and finds auth among them', () => {
    expect(
      hasConnectionAuthCredentials({
        headers: { 'Content-Type': 'json', 'X-API-Key': 'secret' },
      })
    ).toBe(true);
  });

  it('is case-insensitive for header names', () => {
    expect(hasConnectionAuthCredentials({ headers: { AUTHORIZATION: 'tok' } })).toBe(true);
    expect(hasConnectionAuthCredentials({ headers: { 'x-api-key': 'tok' } })).toBe(true);
  });

  it('rejects numeric header name/value', () => {
    expect(hasConnectionAuthCredentials({ headers: { 123: 456 } })).toBe(false);
  });
});

/* ─────────── shouldSuppressDiscoveryWarning ─────────── */

describe('shouldSuppressDiscoveryWarning', () => {
  it('returns true for 401 without auth', () => {
    expect(shouldSuppressDiscoveryWarning({}, { error: { status: 401 } })).toBe(true);
  });

  it('returns false for 401 with auth', () => {
    expect(shouldSuppressDiscoveryWarning({ key: 'secret' }, { error: { status: 401 } })).toBe(
      false
    );
  });

  it('returns false for non-401 status', () => {
    expect(shouldSuppressDiscoveryWarning({}, { error: { status: 403 } })).toBe(false);
    expect(shouldSuppressDiscoveryWarning({}, { error: { status: 500 } })).toBe(false);
  });

  it('returns false for status 0', () => {
    expect(shouldSuppressDiscoveryWarning({}, { error: { status: 0 } })).toBe(false);
  });

  it('handles missing discovery.error', () => {
    expect(shouldSuppressDiscoveryWarning({}, {})).toBe(false);
  });

  it('handles string status that parses to 401', () => {
    expect(shouldSuppressDiscoveryWarning({}, { error: { status: '401' } })).toBe(true);
  });

  it('handles numeric 401.0', () => {
    expect(shouldSuppressDiscoveryWarning({}, { error: { status: 401.0 } })).toBe(true);
  });
});

/* ─────────── createConnectionDiscoveryCacheKey ─────────── */

describe('createConnectionDiscoveryCacheKey', () => {
  it('creates key with empty connections', () => {
    const env = {};
    const key = createConnectionDiscoveryCacheKey(env, []);
    const parsed = JSON.parse(key);

    expect(parsed).toHaveProperty('openaiModels');
    expect(parsed).toHaveProperty('defaultModels');
    expect(parsed).toHaveProperty('allowed');
    expect(parsed.normalizedConnections).toEqual([]);
  });

  it('includes env model variables', () => {
    const env = { OPENAI_MODELS: 'gpt-4,gpt-3', DEFAULT_MODELS: 'default-model' };
    const key = createConnectionDiscoveryCacheKey(env, []);
    const parsed = JSON.parse(key);

    expect(parsed.openaiModels).toBe('gpt-4,gpt-3');
    expect(parsed.defaultModels).toBe('default-model');
  });

  it('falls back to OPENAI_API_MODELS', () => {
    const env = { OPENAI_API_MODELS: 'gpt-3' };
    const key = createConnectionDiscoveryCacheKey(env, []);
    const parsed = JSON.parse(key);

    expect(parsed.openaiModels).toBe('gpt-3');
  });

  it('normalizes connection fields', () => {
    const env = {};
    const connections = [
      {
        id: 'conn1',
        source: 'user',
        providerType: 'openai',
        providerFamily: 'openai',
        baseUrl: 'https://api.openai.com',
        key: 'secret',
        headers: { Authorization: 'Bearer tok' },
        manualModelsMode: true,
        manualModels: [{ modelId: 'm1', name: 'Model 1' }],
      },
    ];

    const key = createConnectionDiscoveryCacheKey(env, connections);
    const parsed = JSON.parse(key);

    expect(parsed.normalizedConnections).toHaveLength(1);
    const conn = parsed.normalizedConnections[0];
    expect(conn.id).toBe('conn1');
    expect(conn.key).toBe('secret');
    expect(conn.headers).toEqual([['authorization', 'Bearer tok']]);
    expect(conn.manualModels).toEqual([{ modelId: 'm1', name: 'Model 1' }]);
  });

  it('sorts header names alphabetically', () => {
    const env = {};
    const connections = [
      {
        headers: { 'Z-Header': 'z', 'A-Header': 'a', 'M-Header': 'm' },
      },
    ];

    const key = createConnectionDiscoveryCacheKey(env, connections);
    const parsed = JSON.parse(key);

    const headerNames = parsed.normalizedConnections[0].headers.map((h) => h[0]);
    expect(headerNames).toEqual(['a-header', 'm-header', 'z-header']);
  });

  it('sorts manual models by modelId', () => {
    const env = {};
    const connections = [
      {
        manualModels: [
          { modelId: 'z', name: 'Z' },
          { modelId: 'a', name: 'A' },
        ],
      },
    ];

    const key = createConnectionDiscoveryCacheKey(env, connections);
    const parsed = JSON.parse(key);

    expect(parsed.normalizedConnections[0].manualModels).toEqual([
      { modelId: 'a', name: 'A' },
      { modelId: 'z', name: 'Z' },
    ]);
  });

  it('includes sorted allowSet', () => {
    const env = {};
    const allowSet = new Set(['c', 'a', 'b']);

    const key = createConnectionDiscoveryCacheKey(env, [], allowSet);
    const parsed = JSON.parse(key);

    expect(parsed.allowed).toEqual(['a', 'b', 'c']);
  });

  it('handles allowSet as null', () => {
    const key = createConnectionDiscoveryCacheKey({}, [], null);
    const parsed = JSON.parse(key);

    expect(parsed.allowed).toEqual([]);
  });

  it('handles connection with null/undefined fields', () => {
    const env = {};
    const connections = [
      {
        id: null,
        source: undefined,
        providerType: null,
        providerFamily: undefined,
        baseUrl: null,
        key: undefined,
        headers: null,
        manualModelsMode: null,
        manualModels: null,
      },
    ];

    const key = createConnectionDiscoveryCacheKey(env, connections);
    const parsed = JSON.parse(key);

    const conn = parsed.normalizedConnections[0];
    expect(conn.id).toBe('');
    expect(conn.source).toBe('');
    expect(conn.headers).toEqual([]);
    expect(conn.manualModels).toEqual([]);
  });

  it('handles manual_models_mode snake_case', () => {
    const env = {};
    const connections = [{ manual_models_mode: 'true' }];

    const key = createConnectionDiscoveryCacheKey(env, connections);
    const parsed = JSON.parse(key);

    expect(parsed.normalizedConnections[0].manualModelsMode).toBe('true');
  });

  it('normalizes null manualModels via mock', () => {
    mockNormalizeConnectionManualModels.mockReturnValue([]);
    const env = {};
    const connections = [{ manualModels: null }];

    createConnectionDiscoveryCacheKey(env, connections);

    expect(mockNormalizeConnectionManualModels).toHaveBeenCalledWith(null);
  });
});

/* ─────────── getConnectionDiscoveryCache ─────────── */

describe('getConnectionDiscoveryCache', () => {
  it('returns Map for valid env object', () => {
    const cache = getConnectionDiscoveryCache({});
    expect(cache).toBeInstanceOf(Map);
  });

  it('returns same Map for same env', () => {
    const env = {};
    const cache1 = getConnectionDiscoveryCache(env);
    const cache2 = getConnectionDiscoveryCache(env);
    expect(cache1).toBe(cache2);
  });

  it('returns fallback cache for null env', () => {
    const cache = getConnectionDiscoveryCache(null);
    expect(cache).toBeInstanceOf(Map);
  });

  it('returns fallback cache for string env', () => {
    const cache = getConnectionDiscoveryCache('env');
    expect(cache).toBeInstanceOf(Map);
  });

  it('returns fallback cache for undefined env', () => {
    const cache = getConnectionDiscoveryCache(undefined);
    expect(cache).toBeInstanceOf(Map);
  });
});

/* ─────────── pruneExpiredConnectionDiscoveryCache ─────────── */

describe('pruneExpiredConnectionDiscoveryCache', () => {
  it('removes expired entries', () => {
    const cache = new Map([
      ['key1', { expiresAt: 100 }],
      ['key2', { expiresAt: 200 }],
      ['key3', { expiresAt: 300 }],
    ]);

    pruneExpiredConnectionDiscoveryCache(cache, 200);

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
    expect(cache.has('key3')).toBe(true);
  });

  it('removes entry exactly at now boundary', () => {
    const cache = new Map([['key1', { expiresAt: 100 }]]);

    pruneExpiredConnectionDiscoveryCache(cache, 100);

    expect(cache.has('key1')).toBe(false);
  });

  it('removes entry with null value', () => {
    const cache = new Map([['key1', null]]);

    pruneExpiredConnectionDiscoveryCache(cache, 100);

    expect(cache.has('key1')).toBe(false);
  });

  it('keeps future entries', () => {
    const cache = new Map([['key1', { expiresAt: 200 }]]);

    pruneExpiredConnectionDiscoveryCache(cache, 100);

    expect(cache.has('key1')).toBe(true);
  });

  it('handles empty cache', () => {
    const cache = new Map();

    pruneExpiredConnectionDiscoveryCache(cache, 100);

    expect(cache.size).toBe(0);
  });
});

/* ─────────── exports ─────────── */

describe('constants export', () => {
  it('exports MODEL_ATTACHMENT_CAPS_KEY', () => {
    expect(MODEL_ATTACHMENT_CAPS_KEY).toBe('model_attachment_caps_v1');
  });

  it('exports DEFAULT_ATTACHMENT_CAPS', () => {
    expect(DEFAULT_ATTACHMENT_CAPS).toEqual({ text: true });
  });

  it('exports CONNECTION_DISCOVERY_CACHE_TTL_MS', () => {
    expect(CONNECTION_DISCOVERY_CACHE_TTL_MS).toBe(60 * 1000);
  });

  it('exports connectionDiscoveryCacheByEnv as WeakMap', () => {
    expect(connectionDiscoveryCacheByEnv).toBeInstanceOf(WeakMap);
  });

  it('exports fallbackConnectionDiscoveryCache as Map', () => {
    expect(fallbackConnectionDiscoveryCache).toBeInstanceOf(Map);
  });
});
