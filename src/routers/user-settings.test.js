import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockLoadWorkspaceSettingsPayload = vi.fn();
const mockBuildUserProfileResponse = vi.fn();

vi.mock('../services/workspace-settings.js', () => ({
  loadWorkspaceSettingsPayload: (...args) => mockLoadWorkspaceSettingsPayload(...args),
}));

vi.mock('./user-profile.js', () => ({
  buildUserProfileResponse: (...args) => mockBuildUserProfileResponse(...args),
}));

vi.mock('../db.js', () => ({
  createDB: (db) => db,
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { userSettingsRouter } from './user-settings.js';
import { createLogger } from '../utils/logger.js';

describe('userSettingsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeReq(method = 'GET', body) {
    return new Request('https://example.com/api/users/me/settings', {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'content-type': 'application/json' } : {},
    });
  }

  const env = { DB: {} };
  const user = { sub: 'u1' };
  const logger = { error: vi.fn() };

  it('returns null for non-matching path', async () => {
    const res = await userSettingsRouter(
      new Request('https://example.com/api/other'),
      env,
      {},
      user,
      '/api/other'
    );
    expect(res).toBeNull();
  });

  it('returns null for path that is a superset of the settings path', async () => {
    const res = await userSettingsRouter(
      new Request('https://example.com/api/users/me/settings/extra'),
      env,
      {},
      user,
      '/api/users/me/settings/extra'
    );
    expect(res).toBeNull();
  });

  it('returns 401 when user is not authenticated', async () => {
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, null, '/api/users/me/settings');
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 405 for POST method', async () => {
    const req = makeReq('POST');
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings');
    expect(res.status).toBe(405);
    const json = await res.json();
    expect(json.error).toBe('Method not allowed');
  });

  it('returns 405 for PUT method', async () => {
    const req = makeReq('PUT');
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings');
    expect(res.status).toBe(405);
  });

  it('returns 405 for DELETE method', async () => {
    const req = makeReq('DELETE');
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings');
    expect(res.status).toBe(405);
  });

  it('returns settings payload on success', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({
      name: 'Test User',
      email: 'test@example.com',
    });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe('Test User');
    expect(mockLoadWorkspaceSettingsPayload).toHaveBeenCalledWith({
      db: env.DB,
      env,
      userId: 'u1',
      route: 'account',
      profileResponseFactory: expect.any(Function),
    });
  });

  it('matches path with trailing slash', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings/');
    expect(res.status).toBe(200);
    expect(mockLoadWorkspaceSettingsPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        db: env.DB,
        env,
        userId: 'u1',
        route: 'account',
        profileResponseFactory: expect.any(Function),
      })
    );
  });

  it('returns 404 when payload is null', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue(null);
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('returns 404 when payload is undefined', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue(undefined);
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('returns 500 when loadWorkspaceSettingsPayload throws an Error', async () => {
    mockLoadWorkspaceSettingsPayload.mockRejectedValue(new Error('db error'));
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('An error occurred. Please try again later.');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Load user settings failed', { error: 'db error' });
  });

  it('returns 500 and logs string when thrown value is a string', async () => {
    mockLoadWorkspaceSettingsPayload.mockImplementation(() => {
      throw 'string error';
    });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('An error occurred. Please try again later.');
    expect(logger.error).toHaveBeenCalledWith('Load user settings failed', {
      error: 'string error',
    });
  });

  it('returns 500 and logs null when thrown value is null', async () => {
    mockLoadWorkspaceSettingsPayload.mockImplementation(() => {
      throw null;
    });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith('Load user settings failed', { error: null });
  });

  it('returns 500 and logs object when thrown value has no message property', async () => {
    mockLoadWorkspaceSettingsPayload.mockImplementation(() => {
      throw { code: 'ERR_1' };
    });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith('Load user settings failed', {
      error: { code: 'ERR_1' },
    });
  });

  it('returns 500 and falls back to Error object when message is empty string', async () => {
    const err = new Error('');
    err.code = 'EMPTY';
    mockLoadWorkspaceSettingsPayload.mockImplementation(() => {
      throw err;
    });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith('Load user settings failed', { error: err });
  });

  it('returns 500 and logs number when thrown value is a number', async () => {
    mockLoadWorkspaceSettingsPayload.mockImplementation(() => {
      throw 42;
    });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith('Load user settings failed', { error: 42 });
  });

  it('uses requestContext.logger when provided', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const customLogger = { error: vi.fn(), info: vi.fn() };
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger: customLogger,
      requestId: 'req-123',
    });
    expect(res.status).toBe(200);
    expect(createLogger).not.toHaveBeenCalled();
  });

  it('falls back to createLogger when requestContext.logger is not provided', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const req = makeReq();
    await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {});
    expect(createLogger).toHaveBeenCalledTimes(1);
  });

  it('falls back to createLogger when requestContext.logger is null', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const req = makeReq();
    await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', { logger: null });
    expect(createLogger).toHaveBeenCalledTimes(1);
  });

  it('falls back to createLogger when requestContext.logger is undefined', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const req = makeReq();
    await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger: undefined,
    });
    expect(createLogger).toHaveBeenCalledTimes(1);
  });

  it('passes requestContext.requestId to createLogger', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const req = makeReq();
    await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      requestId: 'req-456',
    });
    expect(createLogger).toHaveBeenCalledWith(env, { requestId: 'req-456' });
  });

  it('uses default requestContext when argument is omitted', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings');
    expect(res.status).toBe(200);
    expect(createLogger).toHaveBeenCalledWith(env, { requestId: undefined });
  });

  it('uses default requestContext when argument is explicitly undefined', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', undefined);
    expect(res.status).toBe(200);
    expect(createLogger).toHaveBeenCalledWith(env, { requestId: undefined });
  });

  it('calls createDB with env.DB', async () => {
    const customEnv = { DB: { custom: true } };
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User' });
    const req = makeReq();
    await userSettingsRouter(req, customEnv, {}, user, '/api/users/me/settings');
    expect(mockLoadWorkspaceSettingsPayload).toHaveBeenCalledWith(
      expect.objectContaining({ db: customEnv.DB })
    );
  });

  it('uses requestContext.logger for error logging when provided', async () => {
    mockLoadWorkspaceSettingsPayload.mockRejectedValue(new Error('db fail'));
    const customLogger = { error: vi.fn() };
    const req = makeReq();
    await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger: customLogger,
    });
    expect(customLogger.error).toHaveBeenCalledWith('Load user settings failed', {
      error: 'db fail',
    });
    expect(createLogger).not.toHaveBeenCalled();
  });

  it('returns json response on success with correct content-type', async () => {
    mockLoadWorkspaceSettingsPayload.mockResolvedValue({ name: 'User', email: 'u@e.com' });
    const req = makeReq();
    const res = await userSettingsRouter(req, env, {}, user, '/api/users/me/settings', {
      logger,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const json = await res.json();
    expect(json).toEqual({ name: 'User', email: 'u@e.com' });
  });

  it('does not call loadWorkspaceSettingsPayload for non-matching path', async () => {
    await userSettingsRouter(
      new Request('https://example.com/api/other'),
      env,
      {},
      user,
      '/api/other'
    );
    expect(mockLoadWorkspaceSettingsPayload).not.toHaveBeenCalled();
  });

  it('does not call loadWorkspaceSettingsPayload when user is null', async () => {
    const req = makeReq();
    await userSettingsRouter(req, env, {}, null, '/api/users/me/settings');
    expect(mockLoadWorkspaceSettingsPayload).not.toHaveBeenCalled();
  });

  it('does not call loadWorkspaceSettingsPayload for non-GET method', async () => {
    const req = makeReq('POST');
    await userSettingsRouter(req, env, {}, user, '/api/users/me/settings');
    expect(mockLoadWorkspaceSettingsPayload).not.toHaveBeenCalled();
  });
});
