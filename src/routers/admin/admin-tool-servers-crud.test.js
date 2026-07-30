import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  ensureAdminAclAccess: vi.fn(),
  logAuditEvent: vi.fn(),
  loadToolServers: vi.fn(),
  saveToolServers: vi.fn(),
  mergeToolServer: vi.fn(),
  mergeToolSpecs: vi.fn(),
  redactToolServer: vi.fn(),
  isValidHttpUrl: vi.fn(),
  normalizeAuthType: vi.fn(),
  parseHeadersForRequest: vi.fn(),
  isSafeOutboundUrl: vi.fn(),
  mcpRequest: vi.fn(),
  mcpNotify: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

vi.mock('../../mcp/client.js', () => ({
  MCP_PROTOCOL_VERSION: '2024-11-05',
  mcpRequest: (...args) => mocks.mcpRequest(...args),
  mcpNotify: (...args) => mocks.mcpNotify(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  loadToolServers: (...args) => mocks.loadToolServers(...args),
  saveToolServers: (...args) => mocks.saveToolServers(...args),
  mergeToolServer: (...args) => mocks.mergeToolServer(...args),
  mergeToolSpecs: (...args) => mocks.mergeToolSpecs(...args),
  redactToolServer: vi.fn((s) => ({ ...s, oauth_client_secret: '••••' })),
  isValidHttpUrl: (...args) => mocks.isValidHttpUrl(...args),
  normalizeAuthType: (...args) => mocks.normalizeAuthType(...args),
  parseHeadersForRequest: (...args) => mocks.parseHeadersForRequest(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminAclAccess: (...args) => mocks.ensureAdminAclAccess(...args),
  parseJsonAndRequireAdminAcl: async (req, env, user, resource) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return { error: new Response('Invalid JSON body', { status: 400 }) };
    }
    const aclDecision = await mocks.ensureAdminAclAccess({ env, user, resource });
    if (!aclDecision.allow) {
      return { error: new Response(aclDecision.reason || 'Forbidden', { status: 403 }) };
    }
    return { body };
  },
}));

import { handleAdminToolServersCrud } from './admin-tool-servers-crud.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminToolServersCrud', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = {
    all: vi.fn(),
    run: vi.fn(),
    batch: vi.fn(),
    prepare: vi.fn((sql, params = []) => ({
      sql,
      params,
      bind: (...args) => ({ sql, params: args }),
    })),
  };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.ensureAdminAclAccess.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.isValidHttpUrl.mockReturnValue(true);
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: true });
    mocks.normalizeAuthType.mockReturnValue('none');
    mocks.parseHeadersForRequest.mockReturnValue({});
    mocks.loadToolServers.mockResolvedValue([]);
    mocks.saveToolServers.mockResolvedValue(undefined);
    mocks.mergeToolServer.mockImplementation((existing, incoming) => ({
      ...existing,
      ...incoming,
    }));
    mocks.mergeToolSpecs.mockImplementation((existing, discovered) => discovered);
  });

  describe('GET /api/admin/tool-servers', () => {
    it('returns list of servers', async () => {
      mocks.loadToolServers.mockResolvedValue([
        { id: 's1', name: 'Server 1', url: 'https://example.com', enabled: true },
      ]);
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers', 'GET'),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.servers).toHaveLength(1);
    });

    it('filters disabled by default', async () => {
      mocks.loadToolServers.mockResolvedValue([
        { id: 's1', name: 'Enabled', url: 'https://example.com', enabled: true },
        { id: 's2', name: 'Disabled', url: 'https://example.com', enabled: false },
      ]);
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers', 'GET'),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers',
        db,
        logger,
        requestContext: {},
      });
      const payload = await res.json();
      expect(payload.servers).toHaveLength(1);
    });

    it('includes disabled when param set', async () => {
      mocks.loadToolServers.mockResolvedValue([
        { id: 's1', name: 'Enabled', url: 'https://example.com', enabled: true },
        { id: 's2', name: 'Disabled', url: 'https://example.com', enabled: false },
      ]);
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers?include_disabled=true', 'GET'),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers',
        db,
        logger,
        requestContext: {},
      });
      const payload = await res.json();
      expect(payload.servers).toHaveLength(2);
    });

    it('returns 500 on error', async () => {
      mocks.loadToolServers.mockRejectedValue(new Error('fail'));
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers', 'GET'),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/admin/tool-servers/test', () => {
    it('rejects ACL denied', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers/test', 'POST', { url: 'https://example.com' }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers/test',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(403);
    });

    it('rejects invalid URL', async () => {
      mocks.isValidHttpUrl.mockReturnValue(false);
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers/test', 'POST', { url: 'not-url' }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers/test',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(400);
    });

    it('rejects unsafe URL', async () => {
      mocks.isSafeOutboundUrl.mockReturnValue({ safe: false, reason: 'blocked' });
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers/test', 'POST', { url: 'https://evil.com' }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers/test',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(400);
    });

    it('rejects invalid headers JSON', async () => {
      mocks.parseHeadersForRequest.mockImplementation(() => {
        throw new Error('Bad headers');
      });
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers/test', 'POST', {
          url: 'https://example.com',
          headers: 'bad',
        }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers/test',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(400);
    });

    it('requires server ID for OAuth auth', async () => {
      mocks.normalizeAuthType.mockReturnValue('oauth');
      mocks.loadToolServers.mockResolvedValue([]);
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers/test', 'POST', {
          url: 'https://example.com',
          auth_type: 'oauth',
        }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers/test',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(400);
    });

    it('returns connection test results', async () => {
      mocks.mcpRequest.mockResolvedValueOnce({ sessionId: 's1' }).mockResolvedValueOnce({
        result: {
          tools: [
            {
              name: 'tool-a',
              title: 'A',
              description: 'Tool A',
              inputSchema: { type: 'object' },
            },
          ],
        },
      });
      mocks.mcpNotify.mockResolvedValueOnce({ sessionId: 's1' });
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers/test', 'POST', { url: 'https://example.com' }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers/test',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.ok).toBe(true);
      expect(payload.tools).toHaveLength(1);
    });

    it('returns 502 on connection failure', async () => {
      mocks.mcpRequest.mockRejectedValue(new Error('Connection failed'));
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers/test', 'POST', { url: 'https://example.com' }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers/test',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(502);
    });

    it('persists error state on failure when id provided', async () => {
      mocks.loadToolServers.mockResolvedValue([
        { id: 's1', name: 'Server', url: 'https://example.com', enabled: true },
      ]);
      mocks.mcpRequest.mockRejectedValue(new Error('Connection failed'));
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers/test', 'POST', {
          id: 's1',
          url: 'https://example.com',
        }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers/test',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(502);
      expect(mocks.saveToolServers).toHaveBeenCalled();
    });
  });

  describe('PUT /api/admin/tool-servers', () => {
    it('rejects ACL denied', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers', 'PUT', { servers: [] }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(403);
    });

    it('saves servers and returns them', async () => {
      mocks.mergeToolServer.mockImplementation((_existing, incoming) => ({ ...incoming }));
      mocks.loadToolServers.mockResolvedValue([]);
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers', 'PUT', {
          servers: [{ id: 's1', name: 'Server', url: 'https://example.com', enabled: true }],
        }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(200);
      expect(mocks.saveToolServers).toHaveBeenCalled();
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 500 on save failure', async () => {
      mocks.mergeToolServer.mockImplementation((_e, incoming) => ({ ...incoming }));
      mocks.loadToolServers.mockResolvedValue([]);
      mocks.saveToolServers.mockRejectedValue(new Error('fail'));
      const res = await handleAdminToolServersCrud({
        req: makeReq('/api/admin/tool-servers', 'PUT', {
          servers: [{ id: 's1', name: 'Server', url: 'https://example.com' }],
        }),
        env,
        ctx,
        user,
        path: '/api/admin/tool-servers',
        db,
        logger,
        requestContext: {},
      });
      expect(res.status).toBe(500);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleAdminToolServersCrud({
      req: makeReq('/api/admin/unknown', 'GET'),
      env,
      ctx,
      user,
      path: '/api/admin/unknown',
      db,
      logger,
      requestContext: {},
    });
    expect(result).toBeNull();
  });
});
