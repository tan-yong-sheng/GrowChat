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
  createUserToolServer,
  loadToolServers,
  mergeToolServer,
  mergeToolSpecs,
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
    expect(normalizeAttachmentCaps({ image: true, pdf: null }, { allowNull: true })).toEqual({
      image: true,
      pdf: null,
    });
  });

  it('loads and saves tool servers through app config', async () => {
    mocks.getConfigValue.mockResolvedValueOnce('[{"id":"s1"}]');
    const servers = await loadToolServers({});
    expect(servers).toEqual([{ id: 's1' }]);

    await saveToolServers({}, [{ id: 's2' }]);
    expect(mocks.setConfigValue).toHaveBeenCalledWith({}, 'tool_servers', '[{"id":"s2"}]');
  });

  it('includes user-owned tool servers when a user id is provided', async () => {
    const db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      all: vi.fn().mockResolvedValue([
        {
          id: 'mcp-user',
          user_id: 'u1',
          server_json: JSON.stringify({
            id: 'mcp-user',
            name: 'Personal MCP',
            url: 'https://mcp.example.com',
            enabled: true,
          }),
        },
      ]),
      first: vi.fn(),
    };
    mocks.getConfigValue.mockResolvedValueOnce('[]');

    const servers = await loadToolServers(db, { userId: 'u1' });
    expect(servers).toEqual([
      expect.objectContaining({
        id: 'mcp-user',
        source: 'user',
        personal: true,
      }),
    ]);
  });

  it('filters admin tool servers by ACL when a user id is provided', async () => {
    const db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      all: vi.fn(async (sql) => {
        if (String(sql).includes('FROM group_members')) {
          return [{ group_id: 'g1' }];
        }
        if (String(sql).includes('FROM tool_server_acl_rules')) {
          return [
            {
              id: 'rule-1',
              tool_server_id: 'mcp-admin',
              principal_type: 'group',
              principal_id: 'g1',
              effect: 'allow',
              action: 'use',
            },
          ];
        }
        if (String(sql).includes('FROM user_tool_servers')) {
          return [];
        }
        return [];
      }),
      first: vi.fn().mockResolvedValue({ role: 'member' }),
    };
    mocks.getConfigValue.mockResolvedValueOnce(
      JSON.stringify([
        { id: 'mcp-admin', name: 'Admin MCP', url: 'https://mcp.example.com', enabled: true },
        { id: 'mcp-hidden', name: 'Hidden MCP', url: 'https://hidden.example.com', enabled: true },
      ])
    );

    const servers = await loadToolServers(db, { userId: 'u1' });
    expect(servers).toEqual([
      expect.objectContaining({
        id: 'mcp-admin',
        access_label: 'Shared',
        access_variant: 'shared',
      }),
    ]);
  });

  it('marks shared tool visibility from user overrides', async () => {
    const db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      all: vi.fn(async (sql) => {
        if (String(sql).includes('FROM group_members')) {
          return [{ group_id: 'g1' }];
        }
        if (String(sql).includes('FROM tool_server_acl_rules')) {
          return [
            {
              id: 'rule-1',
              tool_server_id: 'mcp-admin',
              principal_type: 'group',
              principal_id: 'g1',
              effect: 'allow',
              action: 'use',
            },
          ];
        }
        if (String(sql).includes('FROM user_tool_servers')) {
          return [];
        }
        return [];
      }),
      first: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT preferences FROM users WHERE id = ?')) {
          return {
            preferences: JSON.stringify({
              resource_overrides: {
                tool_servers: {
                  tools: {
                    'mcp-admin': {
                      hidden_ids: ['shared_search'],
                    },
                  },
                },
              },
            }),
          };
        }
        return { role: 'member' };
      }),
    };
    mocks.getConfigValue.mockResolvedValueOnce(
      JSON.stringify([
        {
          id: 'mcp-admin',
          name: 'Admin MCP',
          url: 'https://mcp.example.com',
          enabled: true,
          tools: [
            { name: 'shared_search', title: 'Shared Search', enabled: true },
            { name: 'shared_news', title: 'Shared News', enabled: true },
          ],
        },
      ])
    );

    const servers = await loadToolServers(db, { userId: 'u1' });
    expect(servers).toEqual([
      expect.objectContaining({
        id: 'mcp-admin',
        tools: [
          expect.objectContaining({
            name: 'shared_search',
            visible_for_user: false,
            hidden_for_user: true,
          }),
          expect.objectContaining({
            name: 'shared_news',
            visible_for_user: true,
            hidden_for_user: false,
          }),
        ],
      }),
    ]);
  });

  it('validates user-owned MCP server urls', async () => {
    const db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      all: vi.fn(),
      first: vi.fn().mockResolvedValue(null),
    };

    await expect(
      createUserToolServer(db, 'u1', {
        name: 'Bad MCP',
        url: 'ftp://example.com',
      })
    ).rejects.toThrow('url must start with http:// or https://');
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
    expect(merged.tools).toEqual([
      { name: 'fresh', title: 'Fresh', description: '', parameters: undefined, enabled: true },
    ]);
    expect(redactToolServer(merged)).not.toHaveProperty('oauth_tokens');
    expect(redactToolServer(merged).oauth_connected).toBe(true);
  });

  it('preserves existing tool enabled flags when merging discovered tools', () => {
    expect(
      mergeToolSpecs(
        [
          { name: 'tool-a', enabled: false },
          { name: 'tool-b', enabled: true },
        ],
        [
          { name: 'tool-a', title: 'Tool A' },
          { name: 'tool-c', title: 'Tool C' },
        ]
      )
    ).toEqual([
      { name: 'tool-a', title: 'Tool A', description: '', parameters: undefined, enabled: false },
      { name: 'tool-c', title: 'Tool C', description: '', parameters: undefined, enabled: true },
    ]);
  });

  it('preserves incoming enabled flags when merging saved tool servers', () => {
    const merged = mergeToolServer(
      {
        id: 's1',
        tools: [{ name: 'tool-a', enabled: true }],
      },
      {
        id: 's1',
        url: 'https://example.com',
        tools: [
          { name: 'tool-a', enabled: false },
          { name: 'tool-b', enabled: true },
        ],
      }
    );

    expect(merged.tools).toEqual([
      { name: 'tool-a', title: '', description: '', parameters: undefined, enabled: false },
      { name: 'tool-b', title: '', description: '', parameters: undefined, enabled: true },
    ]);
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ authorization_endpoint: 'https://auth.example.com/authorize' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
    );

    const metadata = await discoverAuthorizationMetadata('https://auth.example.com');
    expect(metadata.authorization_endpoint).toBe('https://auth.example.com/authorize');
  });
});
