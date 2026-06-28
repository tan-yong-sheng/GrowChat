import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  ensureAdminAclAccess: vi.fn(),
  loadToolServers: vi.fn(),
  saveToolServers: vi.fn(),
  isValidHttpUrl: vi.fn(),
  isSafeOutboundUrl: vi.fn(),
  discoverAuthorizationMetadata: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  normalizeTokenAuthMethod: vi.fn(),
  selectTokenAuthMethod: vi.fn(),
  randomString: vi.fn(),
  sha256Base64Url: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  loadToolServers: (...args) => mocks.loadToolServers(...args),
  saveToolServers: (...args) => mocks.saveToolServers(...args),
  isValidHttpUrl: (...args) => mocks.isValidHttpUrl(...args),
  discoverAuthorizationMetadata: (...args) => mocks.discoverAuthorizationMetadata(...args),
  buildAuthorizationUrl: (...args) => mocks.buildAuthorizationUrl(...args),
  normalizeTokenAuthMethod: (...args) => mocks.normalizeTokenAuthMethod(...args),
  selectTokenAuthMethod: (...args) => mocks.selectTokenAuthMethod(...args),
  randomString: (...args) => mocks.randomString(...args),
  sha256Base64Url: (...args) => mocks.sha256Base64Url(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminAclAccess: (...args) => mocks.ensureAdminAclAccess(...args),
}));

import { handleAdminToolServersOAuth } from './admin-tool-servers-oauth.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminToolServersOAuth', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {}, APP_PUBLIC_ORIGIN: 'https://example.com' };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.ensureAdminAclAccess.mockResolvedValue({ allow: true });
    mocks.isValidHttpUrl.mockReturnValue(true);
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: true });
    mocks.loadToolServers.mockResolvedValue([
      { id: 's1', name: 'Server', url: 'https://mcp.example.com', enabled: true },
    ]);
    mocks.saveToolServers.mockResolvedValue(undefined);
    mocks.discoverAuthorizationMetadata.mockResolvedValue({
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
    });
    mocks.normalizeTokenAuthMethod.mockReturnValue('client_secret_post');
    mocks.selectTokenAuthMethod.mockReturnValue('client_secret_post');
    mocks.randomString.mockReturnValue('random-state-value');
    mocks.sha256Base64Url.mockResolvedValue('code-challenge-value');
    mocks.buildAuthorizationUrl.mockReturnValue(
      new URL('https://auth.example.com/authorize?client_id=c1&redirect_uri=xxx')
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('POST /api/admin/tool-servers/oauth/start', () => {
    it('rejects ACL denied', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
          id: 's1',
          url: 'https://mcp.example.com',
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/start',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('requires server id', async () => {
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/start', 'POST', { url: 'https://mcp.example.com' }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/start',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('requires existing saved server', async () => {
      mocks.loadToolServers.mockResolvedValue([]);
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
          id: 'nonexistent',
          url: 'https://mcp.example.com',
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/start',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid URL', async () => {
      mocks.isValidHttpUrl.mockReturnValue(false);
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/start', 'POST', { id: 's1', url: 'not-url' }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/start',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('starts OAuth with provided client_id', async () => {
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
          id: 's1',
          url: 'https://mcp.example.com',
          oauth_client_id: 'client-1',
          oauth_client_secret: 'secret-1',
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/start',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.ok).toBe(true);
      expect(payload.authorization_url).toBeDefined();
      expect(mocks.saveToolServers).toHaveBeenCalled();
    });

    it('starts OAuth with dynamic registration when no client_id', async () => {
      mocks.discoverAuthorizationMetadata.mockResolvedValue({
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              client_id: 'dynamic-id',
              client_secret: 'dynamic-secret',
            }),
            { status: 200 }
          )
        )
      );
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
          id: 's1',
          url: 'https://mcp.example.com',
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/start',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
    });

    it('rejects when no registration endpoint and no client_id', async () => {
      mocks.discoverAuthorizationMetadata.mockResolvedValue({
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
      });
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
          id: 's1',
          url: 'https://mcp.example.com',
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/start',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('handles dynamic registration failure', async () => {
      mocks.discoverAuthorizationMetadata.mockResolvedValue({
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 400 })));
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/start', 'POST', {
          id: 's1',
          url: 'https://mcp.example.com',
        }),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/start',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(502);
    });
  });

  describe('GET /api/admin/tool-servers/oauth/callback', () => {
    it('handles error param', async () => {
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/callback?error=access_denied', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/callback',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('requires code and state', async () => {
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/callback', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/callback',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects unknown state', async () => {
      mocks.loadToolServers.mockResolvedValue([
        { id: 's1', url: 'https://mcp.example.com', oauth_state: 'different-state' },
      ]);
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=unknown-state', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/callback',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('exchanges code for token', async () => {
      mocks.loadToolServers.mockResolvedValue([
        {
          id: 's1',
          url: 'https://mcp.example.com',
          oauth_state: 'random-state-value',
          oauth_client_id: 'c1',
          oauth_client_secret: 's1',
          oauth_code_verifier: 'verifier',
          oauth_token_auth_method: 'client_secret_post',
          oauth_token_endpoint: 'https://auth.example.com/token',
        },
      ]);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              access_token: 'at-1',
              token_type: 'Bearer',
            }),
            { status: 200 }
          )
        )
      );
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=random-state-value', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/callback',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.saveToolServers).toHaveBeenCalled();
    });

    it('handles token exchange failure', async () => {
      mocks.loadToolServers.mockResolvedValue([
        {
          id: 's1',
          url: 'https://mcp.example.com',
          oauth_state: 'random-state-value',
          oauth_client_id: 'c1',
          oauth_client_secret: 's1',
          oauth_code_verifier: 'verifier',
          oauth_token_auth_method: 'client_secret_post',
          oauth_token_endpoint: 'https://auth.example.com/token',
        },
      ]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 400 })));
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=random-state-value', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/callback',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('handles token exchange exception', async () => {
      mocks.loadToolServers.mockResolvedValue([
        {
          id: 's1',
          url: 'https://mcp.example.com',
          oauth_state: 'random-state-value',
          oauth_client_id: 'c1',
          oauth_code_verifier: 'verifier',
          oauth_token_auth_method: 'client_secret_post',
          oauth_token_endpoint: 'https://auth.example.com/token',
        },
      ]);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const res = await handleAdminToolServersOAuth(
        makeReq('/api/admin/tool-servers/oauth/callback?code=abc&state=random-state-value', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/tool-servers/oauth/callback',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleAdminToolServersOAuth(
      makeReq('/api/admin/unknown', 'GET'),
      env,
      ctx,
      user,
      '/api/admin/unknown',
      { db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
