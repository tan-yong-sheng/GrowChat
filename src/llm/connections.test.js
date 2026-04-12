import { describe, expect, it, vi } from 'vitest';
import {
  discoverConnectionModels,
  dedupeConnectionConfigs,
  extractConnectionModelId,
  getConnectionApiType,
  getConnectionDefaultBaseUrl,
  getConnectionModelDiscoveryUrls,
  isConnectionUrlRequired,
  normalizeConnectionManualModels,
  loadUserOpenAIConnectionConfigs,
  buildConnectionHeaders,
} from './connections.js';

describe('openai connection helpers', () => {
  it('maps api type by provider family', () => {
    expect(getConnectionApiType('openai')).toBe('chat-completions');
    expect(getConnectionApiType('openai-compatible')).toBe('chat-completions');
    expect(getConnectionApiType('google')).toBe('stream-generate-content');
    expect(getConnectionApiType('gemini-compatible')).toBe('stream-generate-content');
    expect(getConnectionApiType('anthropic')).toBe('messages');
    expect(getConnectionApiType('claude-compatible')).toBe('messages');
  });

  it('returns default base urls by provider family', () => {
    expect(getConnectionDefaultBaseUrl('openai')).toBe('https://api.openai.com/v1');
    expect(getConnectionDefaultBaseUrl('google')).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(getConnectionDefaultBaseUrl('anthropic')).toBe('https://api.anthropic.com/v1');
  });

  it('marks compatible providers as requiring an explicit url', () => {
    expect(isConnectionUrlRequired('openai')).toBe(false);
    expect(isConnectionUrlRequired('google')).toBe(false);
    expect(isConnectionUrlRequired('anthropic')).toBe(false);
    expect(isConnectionUrlRequired('openai-compatible')).toBe(true);
    expect(isConnectionUrlRequired('gemini-compatible')).toBe(true);
    expect(isConnectionUrlRequired('claude-compatible')).toBe(true);
  });

  it('dedupes identical endpoints for the same provider type', () => {
    const connections = dedupeConnectionConfigs([
      { id: 'legacy-a', source: 'legacy', providerType: 'openai-compatible', providerFamily: 'openai', baseUrl: 'https://api.example.com/v1' },
      { id: 'config-a', source: 'config', providerType: 'openai-compatible', providerFamily: 'openai', baseUrl: 'https://api.example.com/v1' },
      { id: 'gemini-a', providerType: 'google', providerFamily: 'google', baseUrl: 'https://api.example.com/v1' },
      { id: 'google-a', providerType: 'google', providerFamily: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    ]);

    expect(connections).toHaveLength(3);
    expect(connections.map((conn) => conn.id)).toEqual(['config-a', 'gemini-a', 'google-a']);
  });

  it('keeps distinct provider types even when base url matches', () => {
    const connections = dedupeConnectionConfigs([
      { id: 'openai-a', providerType: 'openai-compatible', providerFamily: 'openai', baseUrl: 'https://api.example.com/v1' },
      { id: 'gemini-a', providerType: 'google', providerFamily: 'google', baseUrl: 'https://api.example.com/v1' },
      { id: 'claude-a', providerType: 'anthropic', providerFamily: 'anthropic', baseUrl: 'https://api.example.com/v1' },
    ]);

    expect(connections).toHaveLength(3);
  });

  it('keeps distinct api types for the same provider type and base url', () => {
    const connections = dedupeConnectionConfigs([
      { id: 'openai-chat', providerType: 'openai-compatible', apiType: 'chat-completions', baseUrl: 'https://api.example.com/v1' },
      { id: 'openai-responses', providerType: 'openai-compatible', apiType: 'responses', baseUrl: 'https://api.example.com/v1' },
    ]);

    expect(connections).toHaveLength(2);
  });

  it('prefers user-owned connections over config connections for matching signatures', () => {
    const connections = dedupeConnectionConfigs([
      { id: 'config-a', source: 'config', providerType: 'openai-compatible', providerFamily: 'openai', baseUrl: 'https://api.example.com/v1' },
      { id: 'user-a', source: 'user', providerType: 'openai-compatible', providerFamily: 'openai', baseUrl: 'https://api.example.com/v1' },
    ]);

    expect(connections).toHaveLength(1);
    expect(connections[0].id).toBe('user-a');
  });

  it('normalizes manual models for a connection', () => {
    expect(normalizeConnectionManualModels([
      'gpt-oss-20b',
      { id: 'models/gemini-2.5-pro', name: 'Gemini Pro' },
      { modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet' },
      { modelId: 'gpt-oss-20b', name: 'Duplicate' },
    ])).toEqual([
      { modelId: 'gpt-oss-20b', name: 'gpt-oss-20b' },
      { modelId: 'gemini-2.5-pro', name: 'Gemini Pro' },
      { modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet' },
    ]);
  });

  it('adds x-api-key fallback header for openai-family when auth type is not explicit', () => {
    const headers = buildConnectionHeaders({
      providerType: 'openai',
      providerFamily: 'openai',
      key: 'secret-key',
      headers: {},
      authType: '',
    });

    expect(headers.Authorization).toBe('Bearer secret-key');
    expect(headers['x-api-key']).toBe('secret-key');
  });

  it('does not add x-api-key fallback when auth type is explicitly bearer', () => {
    const headers = buildConnectionHeaders({
      providerType: 'openai',
      providerFamily: 'openai',
      key: 'secret-key',
      headers: {},
      authType: 'bearer',
    });

    expect(headers.Authorization).toBe('Bearer secret-key');
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('builds provider-specific discovery urls', () => {
    expect(getConnectionModelDiscoveryUrls({
      providerType: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    })).toEqual(['https://generativelanguage.googleapis.com/v1beta/models']);

    expect(getConnectionModelDiscoveryUrls({
      providerType: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
    })).toEqual(['https://api.anthropic.com/v1/models', 'https://api.anthropic.com/models']);
  });

  it('prefers https discovery urls when configured base url is http', () => {
    expect(getConnectionModelDiscoveryUrls({
      providerType: 'openai',
      baseUrl: 'http://proxy.tanyongsheng.site/v1',
    })).toEqual([
      'https://proxy.tanyongsheng.site/v1/models',
      'http://proxy.tanyongsheng.site/v1/models',
    ]);
  });

  it('loads personal connection configs from D1 rows', async () => {
    const db = {
      run: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockResolvedValue([
        {
          id: 'conn-user',
          user_id: 'u1',
          name: 'My Gateway',
          provider_type: 'openai-compatible',
          base_url: 'https://example.com/v1',
          key: 'secret',
          headers: '{"x-test":"1"}',
          auth_type: 'bearer',
          enabled: 1,
          manual_models: '["gpt-5-mini"]',
        },
      ]),
    };

    const connections = await loadUserOpenAIConnectionConfigs(db, 'u1');

    expect(db.run).toHaveBeenCalled();
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      id: 'conn-user',
      source: 'user',
      ownerUserId: 'u1',
      providerType: 'openai-compatible',
      providerFamily: 'openai',
      enabled: true,
      manualModels: [{ modelId: 'gpt-5-mini', name: 'gpt-5-mini' }],
    });
  });

  it('discovers gemini models from the Google models payload shape', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: 'models/gemini-2.5-pro' },
          { name: 'models/gemini-2.0-flash' },
        ],
      }),
      text: async () => '',
    }));

    const result = await discoverConnectionModels(
      {
        providerType: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        key: 'google-key',
      },
      { fetch: fetchMock },
    );

    expect(result.url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => extractConnectionModelId(item))).toEqual([
      'gemini-2.5-pro',
      'gemini-2.0-flash',
    ]);
  });

  it('falls back to generic discovery urls when provider-specific discovery fails', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith('/v1/models')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => 'not found',
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'claude-sonnet-4-5' },
          ],
        }),
        text: async () => '',
      };
    });

    const result = await discoverConnectionModels(
      {
        providerType: 'anthropic',
        baseUrl: 'https://proxy.example.com',
        key: 'anthropic-key',
      },
      { fetch: fetchMock },
    );

    expect(result.url).toBe('https://proxy.example.com/models');
    expect(result.items.map((item) => extractConnectionModelId(item))).toEqual([
      'claude-sonnet-4-5',
    ]);
  });
});
