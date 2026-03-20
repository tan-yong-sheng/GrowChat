import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

import {
  buildAuthorizationUrl,
  discoverAuthorizationMetadata,
  isValidHttpUrl,
  loadToolServers,
  mergeToolServer,
  normalizeAttachmentCaps,
  normalizeAuthType,
  normalizeBaseUrl,
  normalizeHeaders,
  normalizeModelId,
  normalizeTokenAuthMethod,
  parseHeadersForRequest,
  redactToolServer,
  saveToolServers,
  selectTokenAuthMethod,
} from './tool-servers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin tool server helpers', () => {
  it('normalizes and validates headers and limits', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true);
    expect(normalizeBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1');
    expect(normalizeModelId(' model-1 ')).toBe('model-1');
    expect(normalizeModelId('')).toBeNull();
    expect(normalizeAuthType('Bearer')).toBe('bearer');
    expect(normalizeTokenAuthMethod('CLIENT_SECRET_BASIC')).toBe('client_secret_basic');
    expect(selectTokenAuthMethod(['client_secret_basic'], true)).toBe('client_secret_basic');
    expect(normalizeHeaders('{"Authorization":" Bearer x "}')).toBe('{"Authorization":"Bearer x"}');
    expect(parseHeadersForRequest({ a: '1' })).toEqual({ a: '1' });
    expect(normalizeAttachmentCaps({ image: true, pdf: null }, { allowNull: true })).toEqual({ image: true, pdf: null });
  });

  it('loads and saves tool servers through app config', async () => {
    mocks.getConfigValue.mockResolvedValueOnce('[{"id":"s1"}]');
    const servers = await loadToolServers({});
    expect(servers).toEqual([{ id: 's1' }]);

    await saveToolServers({}, [{ id: 's2' }]);
    expect(mocks.setConfigValue).toHaveBeenCalledWith({}, 'tool_servers', '[{"id":"s2"}]');
  });

  it('merges and redacts tool server secrets', () => {
    const merged = mergeToolServer(
      {
        id: 's1',
        oauth_tokens: { access_token: 'secret', connected_at: '2024-01-01T00:00:00.000Z' },
        oauth_connected_at: '2024-01-01T00:00:00.000Z',
        tools: [{ name: 'existing', title: 'Existing' }],
      },
      {
        id: 's1',
        name: 'Server',
        url: 'https://example.com',
        auth_type: 'oauth',
        tools: [{ name: 'fresh', title: 'Fresh' }],
      }
    );

    expect(merged.oauth_tokens.access_token).toBe('secret');
    expect(merged.tools).toEqual([{ name: 'fresh', title: 'Fresh', description: '', parameters: undefined }]);
    expect(redactToolServer(merged)).not.toHaveProperty('oauth_tokens');
    expect(redactToolServer(merged).oauth_connected).toBe(true);
  });

  it('builds OAuth authorization URLs and discovers metadata', async () => {
    const url = buildAuthorizationUrl({
      authorizationEndpoint: 'https://auth.example.com/authorize',
      clientId: 'client-1',
      redirectUri: 'https://app.example.com/callback',
      scope: 'openid profile',
      state: 'state-1',
      codeChallenge: 'challenge',
    });

    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('code_challenge')).toBe('challenge');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ authorization_endpoint: 'https://auth.example.com/authorize' }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    )));

    const metadata = await discoverAuthorizationMetadata('https://auth.example.com');
    expect(metadata.authorization_endpoint).toBe('https://auth.example.com/authorize');
  });
});
