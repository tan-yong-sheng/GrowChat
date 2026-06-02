import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  loadWorkspaceConnectionsPayload: vi.fn(),
  toPersonalConnectionSummary: vi.fn(),
  createUserOpenAIConnection: vi.fn(),
  updateUserOpenAIConnection: vi.fn(),
  deleteUserOpenAIConnection: vi.fn(),
  getUserOpenAIConnectionConfig: vi.fn(),
  discoverConnectionModels: vi.fn(),
  buildConnectionHeaders: vi.fn(),
  getConnectionDefaultBaseUrl: vi.fn(),
  isConnectionUrlRequired: vi.fn(),
  isSafeOutboundUrl: vi.fn(),
  logAuditEvent: vi.fn(),
  normalizeRole: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../services/workspace-settings.js', () => ({
  loadWorkspaceConnectionsPayload: (...args) => mocks.loadWorkspaceConnectionsPayload(...args),
  toPersonalConnectionSummary: (...args) => mocks.toPersonalConnectionSummary(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  createUserOpenAIConnection: (...args) => mocks.createUserOpenAIConnection(...args),
  updateUserOpenAIConnection: (...args) => mocks.updateUserOpenAIConnection(...args),
  deleteUserOpenAIConnection: (...args) => mocks.deleteUserOpenAIConnection(...args),
  getUserOpenAIConnectionConfig: (...args) => mocks.getUserOpenAIConnectionConfig(...args),
  discoverConnectionModels: (...args) => mocks.discoverConnectionModels(...args),
  buildConnectionHeaders: (...args) => mocks.buildConnectionHeaders(...args),
  getConnectionDefaultBaseUrl: (...args) => mocks.getConnectionDefaultBaseUrl(...args),
  isConnectionUrlRequired: (...args) => mocks.isConnectionUrlRequired(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/validation.js', () => ({
  isSafeOutboundUrl: (...args) => mocks.isSafeOutboundUrl(...args),
}));

vi.mock('../../errors/http-errors.js', () => ({
  ValidationError: class extends Error { constructor(msg) { super(msg); } },
  isHttpError: vi.fn(() => false),
  toHttpErrorPayload: vi.fn(),
}));

vi.mock('./users-helpers.js', () => ({
  normalizeRole: (...args) => mocks.normalizeRole(...args),
}));

import { handleUsersConnections } from './users-connections.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleUsersConnections', () => {
  const user = { sub: 'u1', primary_role: 'member' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.normalizeRole.mockReturnValue('member');
    mocks.loadWorkspaceConnectionsPayload.mockResolvedValue({ connections: [], my_connections: [] });
    mocks.toPersonalConnectionSummary.mockImplementation((c) => c);
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: true });
    mocks.getConnectionDefaultBaseUrl.mockReturnValue('https://api.openai.com/v1');
    mocks.isConnectionUrlRequired.mockReturnValue(false);
  });

  describe('GET /api/users/me/resources/connections', () => {
    it('returns connections', async () => {
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'GET'),
        env, ctx, user, '/api/users/me/resources/connections',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
    });

    it('returns 500 on error', async () => {
      mocks.loadWorkspaceConnectionsPayload.mockRejectedValue(new Error('fail'));
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'GET'),
        env, ctx, user, '/api/users/me/resources/connections',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/users/me/resources/connections', () => {
    it('creates a connection', async () => {
      mocks.createUserOpenAIConnection.mockResolvedValue({ id: 'c1' });
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'POST', { name: 'My Conn', url: 'https://example.com/v1' }),
        env, ctx, user, '/api/users/me/resources/connections',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(201);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('handles validation error', async () => {
      const { ValidationError } = await import('../../errors/http-errors.js');
      mocks.createUserOpenAIConnection.mockRejectedValue(new ValidationError('bad'));
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'POST', {}),
        env, ctx, user, '/api/users/me/resources/connections',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/users/me/resources/connections/:id', () => {
    it('updates a connection', async () => {
      mocks.updateUserOpenAIConnection.mockResolvedValue({ id: 'c1' });
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/c1', 'PUT', { name: 'Updated' }),
        env, ctx, user, '/api/users/me/resources/connections/c1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 404 for non-existent connection', async () => {
      mocks.updateUserOpenAIConnection.mockResolvedValue(null);
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/c1', 'PUT', { name: 'X' }),
        env, ctx, user, '/api/users/me/resources/connections/c1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/users/me/resources/connections/:id', () => {
    it('deletes a connection', async () => {
      mocks.deleteUserOpenAIConnection.mockResolvedValue(true);
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/c1', 'DELETE'),
        env, ctx, user, '/api/users/me/resources/connections/c1',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 404 for non-existent connection', async () => {
      mocks.deleteUserOpenAIConnection.mockResolvedValue(false);
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/nonexistent', 'DELETE'),
        env, ctx, user, '/api/users/me/resources/connections/nonexistent',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/users/me/resources/connections/test', () => {
    it('rejects invalid URL', async () => {
      mocks.isConnectionUrlRequired.mockReturnValue(true);
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', { url: 'not-url', provider_type: 'openai-compatible' }),
        env, ctx, user, '/api/users/me/resources/connections/test',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(400);
    });

    it('returns connection test results', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({
        items: [{ id: 'gpt-4o', name: 'GPT-4o' }], url: 'https://api.openai.com/v1/models',
      });
      mocks.buildConnectionHeaders.mockReturnValue({});
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          provider_type: 'openai', base_url: 'https://api.openai.com/v1', key: 'test',
        }),
        env, ctx, user, '/api/users/me/resources/connections/test',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(200);
    });

    it('returns 502 on failed connection', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({
        items: [], error: { status: 401, message: 'Bad key' },
      });
      mocks.buildConnectionHeaders.mockReturnValue({});
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          provider_type: 'openai', base_url: 'https://api.openai.com/v1', key: 'bad',
        }),
        env, ctx, user, '/api/users/me/resources/connections/test',
        { _db: db, logger, _requestContext: {} },
      );
      expect(res.status).toBe(502);
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleUsersConnections(
      makeReq('/api/unknown', 'GET'),
      env, ctx, user, '/api/unknown',
      { _db: db, logger, _requestContext: {} },
    );
    expect(result).toBeNull();
  });
});
