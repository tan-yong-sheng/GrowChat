import { describe, expect, it } from 'vitest';
import {
  buildIntegrationsSnapshot,
  mapSavedToolServers,
  sanitizeIntegrationsServers,
  shouldShowAuthField,
} from '../../public/js/components/admin/settings/integrations-helpers.js';

describe('admin integrations helpers', () => {
  it('builds stable snapshots from tool servers', () => {
    const snapshot = buildIntegrationsSnapshot([
      { id: 'b', name: 'B', url: 'https://b.example', auth_type: 'none' },
      { id: 'a', name: 'A', url: 'https://a.example', auth_type: 'bearer' },
    ]);

    expect(snapshot).toContain('"id":"a"');
    expect(snapshot.indexOf('"id":"a"')).toBeLessThan(snapshot.indexOf('"id":"b"'));
  });

  it('sanitizes tool servers before save', () => {
    expect(sanitizeIntegrationsServers([
      { id: '1', name: ' Server ', url: ' https://x ', headers: ' {} ', enabled: false, auth_type: 'basic' },
      { id: '2', name: 'No URL', url: '   ' },
    ])).toEqual([
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
      },
    ]);
  });

  it('maps saved servers and toggles auth field visibility', () => {
    expect(mapSavedToolServers([{ id: '1', name: 'A', tools_error: 'bad' }], [])).toEqual([
      { id: '1', name: 'A', tools_error: 'bad', toolsExpanded: false, toolsError: 'bad' },
    ]);
    expect(shouldShowAuthField('bearer', 'bearer')).toBe(true);
    expect(shouldShowAuthField('basic', 'oauth')).toBe(false);
  });
});
