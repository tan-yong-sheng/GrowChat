import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  loadWorkspaceSettingsPayload: vi.fn(),
  buildUserProfileResponse: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../services/workspace-settings.js', () => ({
  loadWorkspaceSettingsPayload: (...args) => mocks.loadWorkspaceSettingsPayload(...args),
}));

vi.mock('./user-profile.js', () => ({
  buildUserProfileResponse: (...args) => mocks.buildUserProfileResponse(...args),
}));

import { userSettingsRouter } from './user-settings.js';

function makeReq(path, method) {
  return new Request(`https://example.com${path}`, { method });
}

describe('userSettingsRouter', () => {
  const user = { sub: 'u1' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.loadWorkspaceSettingsPayload.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('returns 401 without user', async () => {
    const res = await userSettingsRouter({
      req: makeReq('/api/users/me/settings', 'GET'),
      env: env,
      ctx: ctx,
      user: null,
      path: '/api/users/me/settings',
      requestId: { logger, requestId: 'r1' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 405 for non-GET method', async () => {
    const res = await userSettingsRouter({
      req: makeReq('/api/users/me/settings', 'PUT'),
      env: env,
      ctx: ctx,
      user: user,
      path: '/api/users/me/settings',
      requestId: { logger, requestId: 'r1' },
    });
    expect(res.status).toBe(405);
  });

  it('returns user settings', async () => {
    const res = await userSettingsRouter({
      req: makeReq('/api/users/me/settings', 'GET'),
      env: env,
      ctx: ctx,
      user: user,
      path: '/api/users/me/settings',
      requestId: { logger, requestId: 'r1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when payload is null', async () => {
    mocks.loadWorkspaceSettingsPayload.mockResolvedValue(null);
    const res = await userSettingsRouter({
      req: makeReq('/api/users/me/settings', 'GET'),
      env: env,
      ctx: ctx,
      user: user,
      path: '/api/users/me/settings',
      requestId: { logger, requestId: 'r1' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 500 on error', async () => {
    mocks.loadWorkspaceSettingsPayload.mockRejectedValue(new Error('fail'));
    const res = await userSettingsRouter({
      req: makeReq('/api/users/me/settings', 'GET'),
      env: env,
      ctx: ctx,
      user: user,
      path: '/api/users/me/settings',
      requestId: { logger, requestId: 'r1' },
    });
    expect(res.status).toBe(500);
  });

  it('returns null for non-matching path', async () => {
    const result = await userSettingsRouter({
      req: makeReq('/api/users/me', 'GET'),
      env: env,
      ctx: ctx,
      user: user,
      path: '/api/users/me',
      requestId: { logger, requestId: 'r1' },
    });
    expect(result).toBeNull();
  });
});
