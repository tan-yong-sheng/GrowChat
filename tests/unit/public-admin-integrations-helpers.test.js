import { describe, expect, it } from 'vitest';
import {
  buildIntegrationsSnapshot,
  mapSavedToolServers,
  normalizeToolList,
  sanitizeIntegrationsServers,
  shouldShowAuthField,
} from '../../public/js/features/admin/settings/integrations-helpers.js';

describe('admin integrations helpers', () => {
  it('builds stable snapshots from tool servers', () => {
    const snapshot = buildIntegrationsSnapshot([
      {
        id: 'b',
        name: 'B',
        url: 'https://b.example',
        auth_type: 'none',
        tools: [{ name: 'z', enabled: false }],
      },
      {
        id: 'a',
        name: 'A',
        url: 'https://a.example',
        auth_type: 'bearer',
        tools: [{ name: 'a', enabled: true }],
      },
    ]);

    expect(snapshot).toContain('"id":"a"');
    expect(snapshot.indexOf('"id":"a"')).toBeLessThan(snapshot.indexOf('"id":"b"'));
    expect(snapshot).toContain('"enabled":true');
    expect(snapshot).toContain('"enabled":false');
  });

  it('sanitizes tool servers before save', () => {
    expect(
      sanitizeIntegrationsServers([
        {
          id: '1',
          name: ' Server ',
          url: ' https://x ',
          headers: ' {} ',
          enabled: false,
          auth_type: 'basic',
        },
        { id: '2', name: 'No URL', url: '   ' },
      ])
    ).toEqual([
      {
        id: '1',
        name: 'Server',
        url: 'https://x',
        headers: '{}',
        enabled: false,
        auth_type: 'basic',
        auth_bearer_token: '',
        auth_basic_username: '',
        auth_basic_password: '',
        oauth_client_name: '',
        oauth_scope: '',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_token_auth_method: '',
        tools: [],
      },
    ]);
  });

  it('trims auth credential strings so whitespace never reaches saved records', () => {
    expect(
      sanitizeIntegrationsServers([
        {
          id: '1',
          name: 'S',
          url: 'https://x',
          auth_type: 'bearer',
          auth_bearer_token: '  secret-token  ',
          auth_basic_username: '  user  ',
          auth_basic_password: '  pass  ',
          oauth_client_name: '  client  ',
          oauth_scope: '  read write  ',
          oauth_client_id: '  cid  ',
          oauth_client_secret: '  csecret  ',
          oauth_token_auth_method: '  client_secret_basic  ',
        },
      ])
    ).toEqual([
      expect.objectContaining({
        auth_type: 'bearer',
        auth_bearer_token: 'secret-token',
        auth_basic_username: 'user',
        auth_basic_password: 'pass',
        oauth_client_name: 'client',
        oauth_scope: 'read write',
        oauth_client_id: 'cid',
        oauth_client_secret: 'csecret',
        oauth_token_auth_method: 'client_secret_basic',
      }),
    ]);
  });

  it('normalizes null auth values to empty strings so DB columns stay non-null', () => {
    expect(
      sanitizeIntegrationsServers([
        {
          id: '1',
          name: 'S',
          url: 'https://x',
          auth_type: null,
          auth_bearer_token: null,
          auth_basic_username: null,
          auth_basic_password: null,
          oauth_client_name: null,
          oauth_scope: null,
          oauth_client_id: null,
          oauth_client_secret: null,
          oauth_token_auth_method: null,
        },
      ])
    ).toEqual([
      expect.objectContaining({
        auth_type: 'none',
        auth_bearer_token: '',
        auth_basic_username: '',
        auth_basic_password: '',
        oauth_client_name: '',
        oauth_scope: '',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_token_auth_method: '',
      }),
    ]);
  });

  it('maps saved servers and toggles auth field visibility', () => {
    expect(
      mapSavedToolServers(
        [{ id: '1', name: 'A', tools_error: 'bad', tools: [{ name: 'x', enabled: false }] }],
        []
      )
    ).toEqual([
      {
        id: '1',
        name: 'A',
        tools_error: 'bad',
        toolsExpanded: false,
        toolsError: 'bad',
        tools: [
          {
            name: 'x',
            title: '',
            description: '',
            parameters: undefined,
            enabled: false,
            _expanded: false,
          },
        ],
      },
    ]);
    expect(shouldShowAuthField('bearer', 'bearer')).toBe(true);
    expect(shouldShowAuthField('basic', 'oauth')).toBe(false);
  });

  it('normalizes tool lists with enabled flags', () => {
    expect(
      normalizeToolList([{ name: 'a', enabled: false }, { name: 'b' }, { name: ' ' }])
    ).toEqual([
      { name: 'a', title: '', description: '', parameters: undefined, enabled: false },
      { name: 'b', title: '', description: '', parameters: undefined, enabled: true },
    ]);
  });
});
