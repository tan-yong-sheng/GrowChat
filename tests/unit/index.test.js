import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSchemaCompatibilityState } from '../../src/bootstrap/schema-compatibility.js';

const mocks = vi.hoisted(() => ({
  verifyJWT: vi.fn(),
  publicRouter: vi.fn(),
  authRouter: vi.fn(),
  chatRouter: vi.fn(),
  usersRouter: vi.fn(),
  faqsRouter: vi.fn(),
  filesRouter: vi.fn(),
  adminRouter: vi.fn(),
  modelsRouter: vi.fn(),
  knowledgeRouter: vi.fn(),
  promptsRouter: vi.fn(),
  rbacRouter: vi.fn(),
  realtimeRouter: vi.fn(),
  foldersRouter: vi.fn(),
  getJwtSecret: vi.fn(() => 'test-secret'),
}));

function makeDb(overrides = {}) {
  return {
    prepare: vi.fn((sql) => {
      const statement = String(sql || '');
      const questionMarks = (statement.match(/\?/g) || []).length;
      return {
        bind: (...params) => ({
          first: async () => {
            if (statement.includes('SELECT role FROM users WHERE id = ?')) {
              return overrides.userRoleRow ?? { role: 'member' };
            }
            return overrides.first ?? null;
          },
          all: async () => {
            if (statement.includes('PRAGMA table_info(messages)')) {
              return overrides.messagesTableInfo ?? { results: [{ name: 'citations' }] };
            }
            if (statement.includes('PRAGMA table_info(users)')) {
              return overrides.usersTableInfo ?? {
                results: [
                  { name: 'last_active_at' },
                  { name: 'avatar' },
                  { name: 'avatar_emoji' },
                  { name: 'status' },
                  { name: 'preferences' },
                ],
              };
            }
            if (statement.includes('SELECT name FROM sqlite_master') && questionMarks === 4) {
              return {
                results: overrides.coreTables ?? [
                  { name: 'users' },
                  { name: 'chats' },
                  { name: 'messages' },
                  { name: 'refresh_tokens' },
                ],
              };
            }
            if (statement.includes('SELECT name FROM sqlite_master') && questionMarks === 5) {
              return {
                results: overrides.rbacTables ?? [
                  { name: 'roles' },
                  { name: 'permissions' },
                  { name: 'role_permissions' },
                  { name: 'user_roles' },
                  { name: 'audit_log' },
                ],
              };
            }
            return overrides.all ?? { results: [] };
          },
          run: async () => overrides.run ?? { success: true },
        }),
      };
    }),
  };
}

vi.mock('../../src/shared/auth.js', () => ({
  verifyJWT: (...args) => mocks.verifyJWT(...args),
}));

vi.mock('../../src/shared/jwt-secret.js', () => ({
  getJwtSecret: (...args) => mocks.getJwtSecret(...args),
}));

vi.mock('../../src/routers/public.js', () => ({
  publicRouter: (...args) => mocks.publicRouter(...args),
}));
vi.mock('../../src/routers/auth.js', () => ({
  authRouter: (...args) => mocks.authRouter(...args),
}));
vi.mock('../../src/routers/chat/index.js', () => ({
  chatRouter: (...args) => mocks.chatRouter(...args),
}));
vi.mock('../../src/routers/users.js', () => ({
  usersRouter: (...args) => mocks.usersRouter(...args),
}));
vi.mock('../../src/routers/faqs.js', () => ({
  faqsRouter: (...args) => mocks.faqsRouter(...args),
}));
vi.mock('../../src/routers/files.js', () => ({
  filesRouter: (...args) => mocks.filesRouter(...args),
}));
vi.mock('../../src/routers/admin/index.js', () => ({
  adminRouter: (...args) => mocks.adminRouter(...args),
}));
vi.mock('../../src/routers/models/index.js', () => ({
  modelsRouter: (...args) => mocks.modelsRouter(...args),
}));
vi.mock('../../src/routers/knowledge.js', () => ({
  knowledgeRouter: (...args) => mocks.knowledgeRouter(...args),
}));
vi.mock('../../src/routers/prompts.js', () => ({
  promptsRouter: (...args) => mocks.promptsRouter(...args),
}));
vi.mock('../../src/routers/rbac.js', () => ({
  rbacRouter: (...args) => mocks.rbacRouter(...args),
}));
vi.mock('../../src/routers/realtime.js', () => ({
  realtimeRouter: (...args) => mocks.realtimeRouter(...args),
}));
vi.mock('../../src/routers/folders.js', () => ({
  foldersRouter: (...args) => mocks.foldersRouter(...args),
}));

import app from '../../src/index.js';

function makeReq(path, method = 'GET', init = {}) {
  return new Request(`https://example.com${path}`, { method, ...init });
}

describe('worker entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSchemaCompatibilityState();
    mocks.publicRouter.mockResolvedValue(null);
    mocks.authRouter.mockResolvedValue(null);
    mocks.chatRouter.mockResolvedValue(null);
    mocks.usersRouter.mockResolvedValue(null);
    mocks.faqsRouter.mockResolvedValue(null);
    mocks.filesRouter.mockResolvedValue(null);
    mocks.adminRouter.mockResolvedValue(null);
    mocks.modelsRouter.mockResolvedValue(null);
    mocks.knowledgeRouter.mockResolvedValue(null);
    mocks.promptsRouter.mockResolvedValue(null);
    mocks.rbacRouter.mockResolvedValue(null);
    mocks.realtimeRouter.mockResolvedValue(null);
    mocks.foldersRouter.mockResolvedValue(null);
    mocks.verifyJWT.mockResolvedValue({ sub: 'u1', email: 'u@example.com', role: 'user', name: 'User' });
  });

  it('skips auth resolution for public API routes', async () => {
    const env = { DB: makeDb(), SESSIONS: {}, ASSETS: {} };
    const ctx = { waitUntil: vi.fn() };
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    mocks.publicRouter.mockResolvedValueOnce(response);

    const res = await app.fetch(makeReq('/api/health'), env, ctx);

    expect(res.status).toBe(200);
    expect(mocks.verifyJWT).not.toHaveBeenCalled();
    expect(mocks.publicRouter).toHaveBeenCalled();
  });

  it('resolves auth and passes the loaded role to protected routers', async () => {
    const env = { DB: makeDb({ userRoleRow: { role: 'member' } }), SESSIONS: {}, ASSETS: {} };
    const ctx = { waitUntil: vi.fn() };
    let receivedUser = null;
    mocks.chatRouter.mockImplementation(async (_req, _env, _ctx, user) => {
      receivedUser = user;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await app.fetch(makeReq('/api/chats', 'GET', { headers: { Authorization: 'Bearer access-token' } }), env, ctx);

    expect(res.status).toBe(200);
    expect(mocks.verifyJWT).toHaveBeenCalledWith('access-token', 'test-secret');
    expect(receivedUser).toMatchObject({ sub: 'u1', role: 'member' });
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('rejects file uploads when FILES binding is missing', async () => {
    const env = { DB: makeDb(), SESSIONS: {}, ASSETS: {} };
    const ctx = { waitUntil: vi.fn() };

    const res = await app.fetch(makeReq('/api/files/upload', 'POST'), env, ctx);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'FILES binding missing' });
    expect(mocks.filesRouter).not.toHaveBeenCalled();
  });

  it('rejects realtime stream requests when MESSAGE_QUEUE binding is missing', async () => {
    const env = { DB: makeDb(), SESSIONS: {}, ASSETS: {} };
    const ctx = { waitUntil: vi.fn() };

    const res = await app.fetch(makeReq('/api/realtime/stream'), env, ctx);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'MESSAGE_QUEUE binding missing' });
    expect(mocks.realtimeRouter).not.toHaveBeenCalled();
  });

  it('returns preflight responses for OPTIONS requests', async () => {
    const env = { DB: makeDb(), SESSIONS: {}, ASSETS: {} };
    const ctx = { waitUntil: vi.fn() };

    const res = await app.fetch(makeReq('/api/chats', 'OPTIONS'), env, ctx);

    expect(res.status).toBe(204);
    expect(mocks.publicRouter).not.toHaveBeenCalled();
    expect(mocks.chatRouter).not.toHaveBeenCalled();
  });
});


