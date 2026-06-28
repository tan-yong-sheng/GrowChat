import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  loadUserToolServers: vi.fn(),
  createUserToolServer: vi.fn(),
  updateUserToolServer: vi.fn(),
  deleteUserToolServer: vi.fn(),
  testToolServerConnection: vi.fn(),
  discoverAuthorizationMetadata: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  normalizeTokenAuthMethod: vi.fn(),
  selectTokenAuthMethod: vi.fn(),
  randomString: vi.fn(),
  sha256Base64Url: vi.fn(),
  saveUserToolServerJson: vi.fn(),
  findUserToolServerByOauthState: vi.fn(),
  isSafeOutboundUrl: vi.fn(),
  loadWorkspaceToolServersPayload: vi.fn(),
  toPersonalToolServerSummary: vi.fn(),
  logAuditEvent: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  loadUserToolServers: (...args) => mocks.loadUserToolServers(...args),
  createUserToolServer: (...args) => mocks.createUserToolServer(...args),
  updateUserToolServer: (...args) => mocks.updateUserToolServer(...args),
  deleteUserToolServer: (...args) => mocks.deleteUserToolServer(...args),
  testToolServerConnection: (...args) => mocks.testToolServerConnection(...args),
  discoverAuthorizationMetadata: (...args) => mocks.discoverAuthorizationMetadata(...args),
  buildAuthorizationUrl: (...args) => mocks.buildAuthorizationUrl(...args),
  normalizeTokenAuthMethod: (...args) => mocks.normalizeTokenAuthMethod(...args),
  selectTokenAuthMethod: (...args) => mocks.selectTokenAuthMethod(...args),
  randomString: (...args) => mocks.randomString(...args),
  sha256Base64Url: (...args) => mocks.sha256Base64Url(...args),
}));

vi.mock('../../services/workspace-settings.js', () => ({
  loadWorkspaceToolServersPayload: (...args) => mocks.loadWorkspaceToolServersPayload(...args),
  toPersonalToolServerSummary: (...args) => mocks.toPersonalToolServerSummary(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

vi.mock('./users-helpers.js', () => ({
  findUserToolServerByOauthState: (...args) => mocks.findUserToolServerByOauthState(...args),
  saveUserToolServerJson: (...args) => mocks.saveUserToolServerJson(...args),
}));

import { handleUsersMcp } from './users-mcp.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleUsersMcp', () => {
  const user = { sub: 'u1', primary_role: 'member' };
  const env = { DB: {}, APP_PUBLIC_ORIGIN: 'https://example.com' };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: true });
    mocks.loadWorkspaceToolServersPayload.mockResolvedValue({ servers: [] });
    mocks.toPersonalToolServerSummary.mockImplementation((s) => s);
    mocks.loadUserToolServers.mockResolvedValue([]);
    mocks.saveUserToolServerJson.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('GET /api/users/me/resources/mcp-servers/oauth/callback', () => {
    it('handles error param', async () => {
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/oauth/callback?error=denied', 'GET'),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/oauth/callback',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('requires code and state', async () => {
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/oauth/callback', 'GET'),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/oauth/callback',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects unknown state', async () => {
      mocks.findUserToolServerByOauthState.mockResolvedValue(null);
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/oauth/callback?code=abc&state=bad', 'GET'),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/oauth/callback',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('exchanges code for tokens', async () => {
      mocks.findUserToolServerByOauthState.mockResolvedValue({
        id: 's1',
        user_id: 'u1',
        url: 'https://mcp.example.com',
        oauth_client_id: 'c1',
        oauth_client_secret: 'sec',
        oauth_code_verifier: 'verifier',
        oauth_token_auth_method: 'client_secret_post',
        oauth_token_endpoint: 'https://auth.example.com/token',
      });
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
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/oauth/callback?code=abc&state=valid', 'GET'),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/oauth/callback',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.saveUserToolServerJson).toHaveBeenCalled();
    });
  });

  describe('GET /api/users/me/resources/mcp-servers', () => {
    it('returns 401 without user', async () => {
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers', 'GET'),
        env,
        ctx,
        null,
        '/api/users/me/resources/mcp-servers',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(401);
    });

    it('returns servers list', async () => {
      mocks.loadWorkspaceToolServersPayload.mockResolvedValue({ servers: [{ id: 's1' }] });
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers', 'GET'),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
    });

    it('returns 500 on error', async () => {
      mocks.loadWorkspaceToolServersPayload.mockRejectedValue(new Error('fail'));
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers', 'GET'),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/users/me/resources/mcp-servers', () => {
    it('creates server', async () => {
      mocks.createUserToolServer.mockResolvedValue({ id: 'new-s' });
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers', 'POST', {
          name: 'New',
          url: 'https://example.com',
        }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(201);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('handles creation error', async () => {
      mocks.createUserToolServer.mockRejectedValue(new Error('bad data'));
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers', 'POST', { name: '' }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/users/me/resources/mcp-servers/test', () => {
    it('requires valid URL', async () => {
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/test', 'POST', { url: '' }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/test',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects unsafe URL', async () => {
      mocks.isSafeOutboundUrl.mockReturnValue({ safe: false, reason: 'blocked' });
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/test', 'POST', { url: 'https://evil.com' }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/test',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('returns test results', async () => {
      mocks.testToolServerConnection.mockResolvedValue({ tools: [{ name: 't1' }] });
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/test', 'POST', { url: 'https://example.com' }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/test',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.tools).toHaveLength(1);
    });

    it('handles test failure', async () => {
      mocks.testToolServerConnection.mockRejectedValue(new Error('fail'));
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/test', 'POST', { url: 'https://example.com' }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/test',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/users/me/resources/mcp-servers/oauth/start', () => {
    it('requires server id', async () => {
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/oauth/start', 'POST', {
          url: 'https://example.com',
        }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/oauth/start',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('requires existing server', async () => {
      mocks.loadUserToolServers.mockResolvedValue([]);
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/oauth/start', 'POST', {
          id: 's1',
          url: 'https://example.com',
        }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/oauth/start',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/users/me/resources/mcp-servers/:id', () => {
    it('updates server', async () => {
      mocks.updateUserToolServer.mockResolvedValue({ id: 's1' });
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/s1', 'PUT', { name: 'Updated' }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/s1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 404 when server not found', async () => {
      mocks.updateUserToolServer.mockResolvedValue(null);
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/nonexistent', 'PUT', { name: 'X' }),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/nonexistent',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/resources/mcp-servers/:id', () => {
    it('deletes server', async () => {
      mocks.deleteUserToolServer.mockResolvedValue(true);
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/s1', 'DELETE'),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/s1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 404 when server not found', async () => {
      mocks.deleteUserToolServer.mockResolvedValue(false);
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/nonexistent', 'DELETE'),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/nonexistent',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(404);
    });

    it('returns 405 for unsupported method', async () => {
      const res = await handleUsersMcp(
        makeReq('/api/users/me/resources/mcp-servers/s1', 'PATCH', {}),
        env,
        ctx,
        user,
        '/api/users/me/resources/mcp-servers/s1',
        { _db: db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(405);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleUsersMcp(
      makeReq('/api/unknown', 'GET'),
      env,
      ctx,
      user,
      '/api/unknown',
      { _db: db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
