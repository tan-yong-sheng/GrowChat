/**
 * Tests for admin-tool-servers-oauth.js — OAuth start and callback paths
 * Coverage focus: validation errors, ACL checks, URL safety, dynamic
 * client registration, token exchange, error handling.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock dependencies ───────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  buildAuthorizationUrl: vi.fn(),
  discoverAuthorizationMetadata: vi.fn(),
  isValidHttpUrl: vi.fn(),
  loadToolServers: vi.fn(),
  normalizeTokenAuthMethod: vi.fn(),
  randomString: vi.fn(),
  saveToolServers: vi.fn(),
  selectTokenAuthMethod: vi.fn(),
  sha256Base64Url: vi.fn(),
  ensureAdminAclAccess: vi.fn(),
  isSafeOutboundUrl: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('../../utils/response.js', () => ({
  error: (req, msg, status, extra) =>
    new Response(JSON.stringify({ error: msg, ...extra }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  json: (req, data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  buildAuthorizationUrl: (...args) => mocks.buildAuthorizationUrl(...args),
  discoverAuthorizationMetadata: (...args) => mocks.discoverAuthorizationMetadata(...args),
  isValidHttpUrl: (...args) => mocks.isValidHttpUrl(...args),
  loadToolServers: (...args) => mocks.loadToolServers(...args),
  normalizeTokenAuthMethod: (...args) => mocks.normalizeTokenAuthMethod(...args),
  randomString: (...args) => mocks.randomString(...args),
  saveToolServers: (...args) => mocks.saveToolServers(...args),
  selectTokenAuthMethod: (...args) => mocks.selectTokenAuthMethod(...args),
  sha256Base64Url: (...args) => mocks.sha256Base64Url(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminAclAccess: (...args) => mocks.ensureAdminAclAccess(...args),
}));

vi.mock('../../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(path, method = 'POST', body) {
  const init = { method, headers: {} };
  if (body) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

import { handleAdminToolServersOAuth } from './admin-tool-servers-oauth.js';

describe('handleAdminToolServersOAuth', () => {
  const user = { sub: 'u1', role: 'admin' };
  const baseEnv = () => ({ APP_PUBLIC_ORIGIN: 'https://app.example.com' });
  const baseDb = () => ({});

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAdminAclAccess.mockResolvedValue({ allow: true });
    mocks.loadToolServers.mockResolvedValue([]);
    mocks.saveToolServers.mockResolvedValue(undefined);
    mocks.buildAuthorizationUrl.mockReturnValue(
      new URL('https://auth.example.com/authorize?client_id=cid')
    );
    mocks.isValidHttpUrl.mockReturnValue(true);
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: true });
    mocks.normalizeTokenAuthMethod.mockImplementation((v) => v || 'client_secret_post');
    mocks.selectTokenAuthMethod.mockReturnValue('client_secret_post');
    mocks.randomString.mockReturnValue('random-value-32-chars-long-ok');
    mocks.sha256Base64Url.mockResolvedValue('code-challenge-base64');
    mocks.discoverAuthorizationMetadata.mockResolvedValue(null);
  });

  // ── OAuth start — validation ──────────────────────────────────────────────

  it('returns 500 when APP_PUBLIC_ORIGIN is not configured', async () => {
    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      {},
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/APP_PUBLIC_ORIGIN/i);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = new Request('https://example.com/api/admin/tool-servers/oauth/start', {
      method: 'POST',
      body: 'not-json',
    });
    const res = await handleAdminToolServersOAuth(
      req,
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when user lacks tool-server ACL', async () => {
    mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no_acl' });

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when server id is empty', async () => {
    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: '  ',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/saved before OAuth/i);
  });

  it('returns 400 when server is not found', async () => {
    mocks.loadToolServers.mockResolvedValue([{ id: 'other-id', name: 'Other' }]);

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 'missing',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/saved before OAuth/i);
  });

  it('returns 400 when server URL is invalid', async () => {
    mocks.loadToolServers.mockResolvedValue([
      { id: 's1', name: 'Server', url: 'http://localhost' },
    ]);
    mocks.isValidHttpUrl.mockReturnValueOnce(false);

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', { id: 's1' }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/http/i);
  });

  it('returns 400 when server URL fails outbound safety check', async () => {
    mocks.loadToolServers.mockResolvedValue([
      { id: 's1', name: 'Server', url: 'https://evil.com' },
    ]);
    mocks.isSafeOutboundUrl.mockReturnValueOnce({ safe: false, reason: 'Blocked domain' });

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', { id: 's1', url: 'https://evil.com' }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Blocked domain');
  });

  // ── OAuth start — dynamic client registration ────────────────────────────

  it('returns 400 when no client_id and no registration endpoint', async () => {
    mocks.loadToolServers.mockResolvedValue([
      { id: 's1', name: 'Server', url: 'https://s.example.com', oauth_client_id: '' },
    ]);
    mocks.discoverAuthorizationMetadata.mockResolvedValue({}); // no registration_endpoint

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/dynamic client registration/i);
  });

  it('returns 502 when client registration fails', async () => {
    mocks.loadToolServers.mockResolvedValue([
      { id: 's1', name: 'Server', url: 'https://s.example.com', oauth_client_id: '' },
    ]);
    mocks.discoverAuthorizationMetadata.mockResolvedValue({
      registration_endpoint: 'https://s.example.com/register',
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('Registration failed', { status: 400 }));
    global.fetch = fetchMock;

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Client registration failed/i);
  });

  it('returns 502 when client registration throws', async () => {
    mocks.loadToolServers.mockResolvedValue([
      { id: 's1', name: 'Server', url: 'https://s.example.com', oauth_client_id: '' },
    ]);
    mocks.discoverAuthorizationMetadata.mockResolvedValue({
      registration_endpoint: 'https://s.example.com/register',
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(502);
  });

  // ── OAuth start — happy path ─────────────────────────────────────────────

  it('returns 200 with authorization_url on success', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        url: 'https://s.example.com',
        oauth_client_id: 'existing-client',
        oauth_client_secret: 'secret',
      },
    ]);

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.authorization_url).toBeTruthy();
    expect(mocks.saveToolServers).toHaveBeenCalled();
  });

  it('persists oauth state and code_verifier to server', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        url: 'https://s.example.com',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
      },
    ]);

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );

    const savedServers = mocks.saveToolServers.mock.calls[0][1];
    expect(savedServers[0].oauth_state).toBe('random-value-32-chars-long-ok');
    expect(savedServers[0].oauth_code_verifier).toBe('random-value-32-chars-long-ok');
  });

  // ── OAuth start — token auth method selection ────────────────────────────

  it('uses client_secret_basic when specified', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        url: 'https://s.example.com',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
        oauth_token_auth_method: 'client_secret_basic',
      },
    ]);
    mocks.normalizeTokenAuthMethod.mockReturnValue('client_secret_basic');

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );

    expect(mocks.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'cid',
        redirectUri: 'https://app.example.com/api/admin/tool-servers/oauth/callback',
      })
    );
  });

  // ── OAuth callback ───────────────────────────────────────────────────────

  it('returns 500 when APP_PUBLIC_ORIGIN missing on callback', async () => {
    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      {},
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );
    expect(res.status).toBe(500);
  });

  it('returns 400 when error param is present', async () => {
    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?error=access_denied', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toMatch(/access_denied/i);
  });

  it('returns 400 when code is missing', async () => {
    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toMatch(/Missing authorization code/i);
  });

  it('returns 400 when state is missing', async () => {
    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when state does not match any server', async () => {
    mocks.loadToolServers.mockResolvedValue([
      { id: 's1', name: 'Server', oauth_state: 'other-state' },
    ]);

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toMatch(/not found or expired/i);
  });

  it('returns 400 when token exchange fails', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        oauth_state: 'xyz',
        oauth_code_verifier: 'verifier',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
        oauth_token_endpoint: 'https://s.example.com/token',
        oauth_authorization_server: 'https://s.example.com',
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue(new Response('invalid_grant', { status: 400 }));

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toMatch(/Token exchange failed/i);
  });

  it('returns 400 when token fetch throws', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        oauth_state: 'xyz',
        oauth_code_verifier: 'verifier',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
        oauth_token_endpoint: 'https://s.example.com/token',
        oauth_authorization_server: 'https://s.example.com',
      },
    ]);

    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );
    expect(res.status).toBe(400);
  });

  it('returns HTML success page when token exchange succeeds', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        oauth_state: 'xyz',
        oauth_code_verifier: 'verifier',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
        oauth_token_endpoint: 'https://s.example.com/token',
        oauth_authorization_server: 'https://s.example.com',
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const text = await res.text();
    expect(text).toMatch(/OAuth connected/i);
  });

  it('clears oauth_state and oauth_code_verifier after successful token exchange', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        oauth_state: 'xyz',
        oauth_code_verifier: 'verifier',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
        oauth_token_endpoint: 'https://s.example.com/token',
        oauth_authorization_server: 'https://s.example.com',
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );

    const savedServers = mocks.saveToolServers.mock.calls[0][1];
    expect(savedServers[0].oauth_state).toBeNull();
    expect(savedServers[0].oauth_code_verifier).toBeNull();
    expect(savedServers[0].oauth_tokens).toBeDefined();
  });

  // ── Route not matched ────────────────────────────────────────────────────

  it('returns null when path does not match', async () => {
    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/other', 'POST'),
      baseEnv(),
      {},
      user,
      '/api/admin/other',
      { db: baseDb() }
    );
    expect(res).toBeNull();
  });

  // ── OAuth start — server URL from existing server ────────────────────────

  it('uses existing server URL when body.url is not provided', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        url: 'https://s.example.com',
        oauth_client_id: 'existing-client',
        oauth_client_secret: 'secret',
      },
    ]);

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', { id: 's1' }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('uses body.oauth_client_id when overriding existing server', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        url: 'https://s.example.com',
        oauth_client_id: 'old-client',
        oauth_client_secret: 'old-secret',
      },
    ]);

    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
        oauth_client_id: 'new-client',
        oauth_client_secret: 'new-secret',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );

    expect(res.status).toBe(200);
  });

  it('uses server oauth_authorization_server when provided', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        url: 'https://s.example.com',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
        oauth_authorization_server: 'https://auth.example.com',
      },
    ]);

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );

    expect(mocks.discoverAuthorizationMetadata).toHaveBeenCalledWith('https://auth.example.com');
  });

  it('discovers metadata from server url when no auth server set', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        url: 'https://s.example.com',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
      },
    ]);

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );

    expect(mocks.discoverAuthorizationMetadata).toHaveBeenCalledWith('https://s.example.com');
  });

  it('uses metadata authorization_endpoint when available', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        url: 'https://s.example.com',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
      },
    ]);
    mocks.discoverAuthorizationMetadata.mockResolvedValue({
      authorization_endpoint: 'https://auth.example.com/oauth/authorize',
      token_endpoint: 'https://auth.example.com/oauth/token',
    });

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );

    expect(mocks.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationEndpoint: 'https://auth.example.com/oauth/authorize',
      })
    );
  });

  // ── OAuth callback — token auth methods ──────────────────────────────────

  it('uses client_secret_basic on callback when configured', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        oauth_state: 'xyz',
        oauth_code_verifier: 'verifier',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
        oauth_token_endpoint: 'https://s.example.com/token',
        oauth_authorization_server: 'https://s.example.com',
        oauth_token_auth_method: 'client_secret_basic',
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );

    const fetchCall = global.fetch.mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers.get('Authorization')).toMatch(/Basic /);
  });

  it('uses client_secret_post on callback when no secret and no basic', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        oauth_state: 'xyz',
        oauth_code_verifier: 'verifier',
        oauth_client_id: 'cid',
        oauth_client_secret: '',
        oauth_token_endpoint: 'https://s.example.com/token',
        oauth_authorization_server: 'https://s.example.com',
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );

    const fetchCall = global.fetch.mock.calls[0];
    const body = new URLSearchParams(fetchCall[1].body);
    expect(body.has('client_id')).toBe(true);
    expect(body.has('client_secret')).toBe(false);
  });

  it('constructs fallback token endpoint from authorization server', async () => {
    mocks.loadToolServers.mockResolvedValue([
      {
        id: 's1',
        name: 'Server',
        oauth_state: 'xyz',
        oauth_code_verifier: 'verifier',
        oauth_client_id: 'cid',
        oauth_client_secret: 'secret',
        oauth_token_endpoint: '',
        oauth_authorization_server: 'https://auth.example.com',
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'at' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=xyz', 'GET'),
      baseEnv(),
      {},
      user,
      '/api/admin/tool-servers/oauth/callback',
      { db: baseDb() }
    );

    const fetchCall = global.fetch.mock.calls[0];
    expect(fetchCall[0]).toBe('https://auth.example.com/token');
  });

  it('returns 500 when APP_PUBLIC_ORIGIN missing for start path', async () => {
    const res = await handleAdminToolServersOAuth(
      makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
        id: 's1',
        url: 'https://s.example.com',
      }),
      {},
      {},
      user,
      '/api/admin/tool-servers/oauth/start',
      { db: baseDb() }
    );
    expect(res.status).toBe(500);
  });
});
