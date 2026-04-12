import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  buildUserProfileResponse: vi.fn(),
  loadWorkspaceSettingsPayload: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  createDB: mocks.createDB,
}));

vi.mock('../../src/routers/user-profile.js', () => ({
  buildUserProfileResponse: mocks.buildUserProfileResponse,
}));

vi.mock('../../src/services/workspace-settings.js', () => ({
  loadWorkspaceSettingsPayload: mocks.loadWorkspaceSettingsPayload,
}));

import { userSettingsRouter } from '../../src/routers/user-settings.js';

function makeReq(path, method = 'GET') {
  return new Request(`https://example.com${path}`, { method });
}

describe('userSettingsRouter', () => {
  const env = { DB: {} };
  const user = { sub: 'u1' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDB.mockReturnValue({ id: 'db' });
    mocks.buildUserProfileResponse.mockImplementation((row, options = {}) => ({
      user: {
        id: row.id,
        email: row.email,
        primary_role: options.primaryRole || 'member',
      },
      app_config: {
        default_model_id: options.defaultModelId || null,
      },
    }));
  });

  it('returns the effective account settings payload for the current user', async () => {
    const payload = {
      user: {
        id: 'u1',
        email: 'user@example.com',
        primary_role: 'member',
      },
      app_config: {
        default_model_id: 'gpt-5-mini',
      },
      settings: {
        connections: {
          my_connections: [],
          connections: [
            {
              id: 'conn-shared',
              name: 'Shared Connection',
              access_label: 'Shared',
              access_variant: 'shared',
              hidden_for_user: true,
              visible_for_user: false,
            },
          ],
        },
      },
    };

    mocks.loadWorkspaceSettingsPayload.mockResolvedValueOnce(payload);

    const res = await userSettingsRouter(
      makeReq('/api/users/me/settings', 'GET'),
      env,
      {},
      user,
      '/api/users/me/settings'
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(payload);
    expect(mocks.createDB).toHaveBeenCalledWith(env.DB);
    expect(mocks.loadWorkspaceSettingsPayload).toHaveBeenCalledWith(expect.objectContaining({
      db: { id: 'db' },
      env,
      userId: 'u1',
      route: 'account',
      profileResponseFactory: mocks.buildUserProfileResponse,
    }));
  });

  it('rejects unauthenticated requests', async () => {
    const res = await userSettingsRouter(
      makeReq('/api/users/me/settings', 'GET'),
      env,
      {},
      null,
      '/api/users/me/settings'
    );

    expect(res.status).toBe(401);
  });
});
