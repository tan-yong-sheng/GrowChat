import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  loadWorkspaceConnectionsPayload: vi.fn(),
  toPersonalConnectionSummary: vi.fn((c) => ({
    id: c.id,
    name: c.name,
    access_label: 'Personal',
    access_variant: 'personal',
  })),
  updateUserOpenAIConnection: vi.fn(),
  deleteUserOpenAIConnection: vi.fn(),
  createUserOpenAIConnection: vi.fn(),
  getUserOpenAIConnectionConfig: vi.fn(),
  discoverConnectionModels: vi.fn(),
  getConnectionDefaultBaseUrl: vi.fn(() => 'https://api.openai.com/v1'),
  isConnectionUrlRequired: vi.fn(() => true),
  buildConnectionHeaders: vi.fn((conn) => conn.headers || {}),
  logAuditEvent: vi.fn(),
  isSafeOutboundUrl: vi.fn(() => ({ safe: true })),
  getConnectionTestFailureMessage: vi.fn((status) => `Test failed (status ${status})`),
  normalizeRole: vi.fn((r) => String(r || '').trim()),
}));

vi.mock('../db.js', () => ({
  createDB: mocks.createDB,
}));

vi.mock('../services/workspace-settings.js', () => ({
  loadWorkspaceConnectionsPayload: mocks.loadWorkspaceConnectionsPayload,
  toPersonalConnectionSummary: mocks.toPersonalConnectionSummary,
}));

vi.mock('../llm/connections.js', () => ({
  updateUserOpenAIConnection: mocks.updateUserOpenAIConnection,
  deleteUserOpenAIConnection: mocks.deleteUserOpenAIConnection,
  createUserOpenAIConnection: mocks.createUserOpenAIConnection,
  getUserOpenAIConnectionConfig: mocks.getUserOpenAIConnectionConfig,
  discoverConnectionModels: mocks.discoverConnectionModels,
  getConnectionDefaultBaseUrl: mocks.getConnectionDefaultBaseUrl,
  isConnectionUrlRequired: mocks.isConnectionUrlRequired,
  buildConnectionHeaders: mocks.buildConnectionHeaders,
}));

vi.mock('../utils/authorize.js', () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

vi.mock('../utils/response.js', () => ({
  error: (req, message, status = 500, details) => {
    const body = details ? { error: message, details } : { error: message };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  },
  json: (_req, data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }),
  getConnectionTestFailureMessage: mocks.getConnectionTestFailureMessage,
}));

vi.mock('../utils/validation.js', () => ({
  isSafeOutboundUrl: mocks.isSafeOutboundUrl,
}));

vi.mock('./users/users-helpers.js', () => ({
  normalizeRole: mocks.normalizeRole,
}));

import { handleUsersConnections } from './users/users-connections.js';
import { ValidationError } from '../errors/http-errors.js';

function makeReq(path, method = 'GET', body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

const db = {
  first: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
};

const logger = { error: vi.fn(), warn: vi.fn() };
const user = { sub: 'u1', primary_role: 'member' };
const env = { DB: {} };

const deps = { db, logger, requestContext: {} };

describe('handleUsersConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.isSafeOutboundUrl.mockReturnValue({ safe: true });
    mocks.isConnectionUrlRequired.mockReturnValue(true);
    mocks.getConnectionDefaultBaseUrl.mockReturnValue('https://api.openai.com/v1');
  });

  it('returns null for unmatched paths', async () => {
    const res = await handleUsersConnections(
      makeReq('/api/other'),
      env,
      {},
      user,
      '/api/other',
      deps
    );
    expect(res).toBeNull();
  });

  describe('GET /api/users/me/resources/connections', () => {
    it('returns connections payload on success', async () => {
      mocks.loadWorkspaceConnectionsPayload.mockResolvedValue({
        connections: [{ id: 'c1', name: 'Shared' }],
        my_connections: [{ id: 'c2', name: 'Mine' }],
      });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'GET'),
        env,
        {},
        user,
        '/api/users/me/resources/connections',
        deps
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.connections).toEqual([{ id: 'c1', name: 'Shared' }]);
      expect(json.my_connections).toEqual([expect.objectContaining({ id: 'c2' })]);
      expect(mocks.loadWorkspaceConnectionsPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          primaryRole: 'member',
          includeDisabled: true,
          includeHiddenForUser: true,
        })
      );
    });

    it('returns 500 when load fails', async () => {
      mocks.loadWorkspaceConnectionsPayload.mockRejectedValue(new Error('db down'));

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'GET'),
        env,
        {},
        user,
        '/api/users/me/resources/connections',
        deps
      );
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to load resources');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('PUT /api/users/me/resources/connections/:id', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await handleUsersConnections(
        new Request('https://example.com/api/users/me/resources/connections/conn-1', {
          method: 'PUT',
          body: 'not-json',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid JSON body');
    });

    it('returns 404 when connection not found', async () => {
      mocks.updateUserOpenAIConnection.mockResolvedValue(null);

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/conn-1', 'PUT', { name: 'New' }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('Connection not found');
    });

    it('returns 400 on ValidationError', async () => {
      mocks.updateUserOpenAIConnection.mockRejectedValue(new ValidationError('name is required'));

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/conn-1', 'PUT', {}),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('name is required');
    });

    it('updates and logs audit on success', async () => {
      mocks.updateUserOpenAIConnection.mockResolvedValue({ id: 'conn-1', name: 'Updated' });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/conn-1', 'PUT', { name: 'Updated' }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.connection).toMatchObject({ id: 'conn-1', access_variant: 'personal' });
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        env,
        expect.objectContaining({ action: 'user_connection_updated', resource_id: 'conn-1' })
      );
    });

    it('returns 400 on generic error', async () => {
      mocks.updateUserOpenAIConnection.mockRejectedValue(new Error('some error'));

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/conn-1', 'PUT', { name: 'X' }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('some error');
    });
  });

  describe('DELETE /api/users/me/resources/connections/:id', () => {
    it('returns 404 when connection not found', async () => {
      mocks.deleteUserOpenAIConnection.mockResolvedValue(false);

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/conn-1', 'DELETE'),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('Connection not found');
    });

    it('deletes and logs audit on success', async () => {
      mocks.deleteUserOpenAIConnection.mockResolvedValue(true);

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/conn-1', 'DELETE'),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        env,
        expect.objectContaining({ action: 'user_connection_deleted', resource_id: 'conn-1' })
      );
    });

    it('returns 400 on error', async () => {
      mocks.deleteUserOpenAIConnection.mockRejectedValue(new Error('delete failed'));

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/conn-1', 'DELETE'),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('delete failed');
    });
  });

  describe('POST /api/users/me/resources/connections', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await handleUsersConnections(
        new Request('https://example.com/api/users/me/resources/connections', {
          method: 'POST',
          body: 'not-json',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid JSON body');
    });

    it('returns 400 on ValidationError', async () => {
      mocks.createUserOpenAIConnection.mockRejectedValue(new ValidationError('bad input'));

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'POST', { name: 'X' }),
        env,
        {},
        user,
        '/api/users/me/resources/connections',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('bad input');
    });

    it('creates and logs audit on success', async () => {
      mocks.createUserOpenAIConnection.mockResolvedValue({ id: 'conn-new', name: 'New' });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'POST', {
          name: 'New',
          base_url: 'https://example.com/v1',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections',
        deps
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.connection).toMatchObject({ id: 'conn-new', access_variant: 'personal' });
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        env,
        expect.objectContaining({ action: 'user_connection_created', resource_id: 'conn-new' })
      );
    });

    it('returns 400 on generic error', async () => {
      mocks.createUserOpenAIConnection.mockRejectedValue(new Error('create failed'));

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections', 'POST', { name: 'X' }),
        env,
        {},
        user,
        '/api/users/me/resources/connections',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('create failed');
    });
  });

  describe('POST /api/users/me/resources/connections/test', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await handleUsersConnections(
        new Request('https://example.com/api/users/me/resources/connections/test', {
          method: 'POST',
          body: 'not-json',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid JSON body');
    });

    it('returns 400 when URL required but missing', async () => {
      mocks.isConnectionUrlRequired.mockReturnValue(true);

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          provider_type: 'openai-compatible',
          base_url: '',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Connection URL is required for compatible providers');
    });

    it('returns 400 when URL does not start with http:// or https://', async () => {
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'ftp://example.com',
          provider_type: 'openai-compatible',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Connection URL must start with http:// or https://');
    });

    it('returns 400 when URL is unsafe', async () => {
      mocks.isSafeOutboundUrl.mockReturnValue({ safe: false, reason: 'Private IP not allowed' });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://192.168.1.1',
          provider_type: 'openai-compatible',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Private IP not allowed');
    });

    it('returns 400 when headers JSON is invalid', async () => {
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
          headers: 'not-json',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(400);
      // JSON.parse throws with the actual parse error message
      expect((await res.json()).error).toContain('not valid JSON');
    });

    it('returns 400 when headers JSON is an array', async () => {
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
          headers: JSON.stringify([1, 2]),
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Headers must be a JSON object');
    });

    it('treats whitespace-only headers string as empty (trim makes it falsy)', async () => {
      // '   '.trim() === '' which is falsy, so the string-type branch is skipped
      // and the else-if also skips (string is not object), so headers = {}
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
          headers: '   ',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
    });

    it('accepts headers as object', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1', name: 'Model 1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
          headers: { 'X-Custom': '1' },
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
    });

    it('accepts existing connection and merges settings', async () => {
      mocks.getUserOpenAIConnectionConfig.mockResolvedValue({
        id: 'conn-1',
        providerType: 'openai-compatible',
        providerFamily: 'openai',
        baseUrl: 'https://saved.example.com',
        key: 'saved-key',
        headers: { 'X-Saved': '1' },
        authType: 'bearer',
      });
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1', name: 'Model 1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          id: 'conn-1',
          base_url: '',
          key: '',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
      expect(mocks.getUserOpenAIConnectionConfig).toHaveBeenCalledWith(db, 'u1', 'conn-1');
    });

    it('uses providerType from existing connection', async () => {
      mocks.getUserOpenAIConnectionConfig.mockResolvedValue({
        id: 'conn-1',
        providerType: 'gemini-compatible',
        baseUrl: 'https://gemini.example.com',
        key: 'saved',
      });
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1', name: 'Model 1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          id: 'conn-1',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
    });

    it('uses default base URL when not provided', async () => {
      mocks.isConnectionUrlRequired.mockReturnValue(false);
      mocks.getConnectionDefaultBaseUrl.mockReturnValue('https://api.anthropic.com/v1');
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1', name: 'Model 1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          provider_type: 'claude-compatible',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
      expect(mocks.getConnectionDefaultBaseUrl).toHaveBeenCalledWith('claude-compatible');
    });

    it('returns 502 when discovery has no items and no error status', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({ items: [] });
      mocks.getConnectionTestFailureMessage.mockReturnValue('No models discovered');

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toBe('Connection failed');
      expect(json.details.message).toBe('No models discovered');
    });

    it('returns 502 with safe message when discovery returns error status', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({
        items: [],
        error: { status: 401, message: 'Bad key', url: 'https://example.com/models' },
      });
      mocks.getConnectionTestFailureMessage.mockReturnValue('Authentication failed');

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.details.message).toBe('Authentication failed');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns 200 with discovered models on success', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({
        items: [
          { id: 'models/gpt-4', displayName: 'GPT-4' },
          { id: 'm2', name: 'Model 2' },
          { id: '', name: 'Empty' },
        ],
      });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.models).toEqual([
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'm2', name: 'Model 2' },
        { id: 'Empty', name: 'Empty' },
      ]);
    });

    it('returns 502 on thrown error during discovery', async () => {
      mocks.discoverConnectionModels.mockRejectedValue(new Error('network fail'));

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toBe('Connection failed');
      expect(json.details.message).toBe('network fail');
    });

    it('uses connection_id fallback when id missing', async () => {
      mocks.getUserOpenAIConnectionConfig.mockResolvedValue({
        id: 'conn-2',
        providerType: 'openai-compatible',
        baseUrl: 'https://fallback.example.com',
        key: 'k2',
      });
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          connection_id: 'conn-2',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
      expect(mocks.getUserOpenAIConnectionConfig).toHaveBeenCalledWith(db, 'u1', 'conn-2');
    });

    it('uses providerType fallback from body.providerType', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          providerType: 'gemini-compatible',
          base_url: 'https://gemini.example.com',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
    });

    it('uses baseUrl fallback from body.baseUrl', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          baseUrl: 'https://alt.example.com',
          provider_type: 'openai-compatible',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
    });

    it('uses auth_type fallback from body.authType', async () => {
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          base_url: 'https://example.com',
          provider_type: 'openai-compatible',
          authType: 'api-key',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
    });

    it('uses existing headers when body headers empty', async () => {
      mocks.getUserOpenAIConnectionConfig.mockResolvedValue({
        id: 'conn-1',
        providerType: 'openai-compatible',
        baseUrl: 'https://example.com',
        key: 'k',
        headers: { 'X-Existing': '1' },
      });
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          id: 'conn-1',
          headers: {},
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
    });

    it('skips URL required check when not required', async () => {
      mocks.isConnectionUrlRequired.mockReturnValue(false);
      mocks.discoverConnectionModels.mockResolvedValue({ items: [{ id: 'm1' }] });

      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/test', 'POST', {
          provider_type: 'google',
        }),
        env,
        {},
        user,
        '/api/users/me/resources/connections/test',
        deps
      );
      expect(res.status).toBe(200);
    });

    it('returns 405 for unsupported method on connection resource', async () => {
      const res = await handleUsersConnections(
        makeReq('/api/users/me/resources/connections/conn-1', 'PATCH'),
        env,
        {},
        user,
        '/api/users/me/resources/connections/conn-1',
        deps
      );
      expect(res.status).toBe(405);
      expect((await res.json()).error).toBe('Method not allowed');
    });
  });
});
