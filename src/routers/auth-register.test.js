import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  hashPassword: vi.fn(),
  createRefreshToken: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  checkRateLimit: vi.fn(),
  resolveRateLimitSubject: vi.fn(),
  stripHtml: vi.fn((v) => v),
  escapeHtml: vi.fn((v) => v),
  normalizePublicRole: vi.fn((r) => r || 'member'),
  validateEmail: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
}));

vi.mock('../shared/session.js', () => ({
  createRefreshToken: (...args) => mocks.createRefreshToken(...args),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigBool: (...args) => mocks.getConfigBool(...args),
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: { authRegister: { maxRequests: 3, windowSeconds: 600 } },
  checkRateLimit: (...args) => mocks.checkRateLimit(...args),
  resolveRateLimitSubject: (...args) => mocks.resolveRateLimitSubject(...args),
}));

vi.mock('../utils/sanitize.js', () => ({
  stripHtml: (...args) => mocks.stripHtml(...args),
  escapeHtml: (...args) => mocks.escapeHtml(...args),
}));

vi.mock('../utils/user-role.js', () => ({
  normalizePublicRole: (...args) => mocks.normalizePublicRole(...args),
}));

vi.mock('../validation/request.js', () => ({
  requireString: vi.fn((v, msg) => {
    if (!v) throw new Error(msg);
    return v;
  }),
  validateEmail: (...args) => mocks.validateEmail(...args),
}));

vi.mock('../errors/http-errors.js', () => ({
  ValidationError: class extends Error {
    constructor(msg) {
      super(msg);
    }
  },
  isHttpError: vi.fn(() => false),
  toHttpErrorPayload: vi.fn(),
}));

import { handleRegister } from './auth-register.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleRegister', () => {
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const users = {
    count: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
  };
  const jwtSecret = 'test-secret-0123456789abcdef0123456789abcdef';
  const sharedFns = {
    ensureUserRoleBinding: vi.fn(),
    createAccessToken: vi.fn(),
  };
  const env = { DB: {}, CACHE: {} };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hashPassword.mockResolvedValue('hashed');
    mocks.createRefreshToken.mockResolvedValue({ token: 'rt', expiresAt: Date.now() + 604800000 });
    mocks.getConfigBool.mockResolvedValue(true);
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => fallback);
    mocks.setConfigValue.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.resolveRateLimitSubject.mockReturnValue('ip:127.0.0.1');
    mocks.stripHtml.mockImplementation((v) => v);
    mocks.escapeHtml.mockImplementation((v) => v);
    mocks.normalizePublicRole.mockImplementation((r) => r || 'member');
    mocks.validateEmail.mockImplementation((e) => e);
    users.count.mockResolvedValue(1);
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation(async (data) => ({ ...data, id: data.id }));
    sharedFns.ensureUserRoleBinding.mockResolvedValue(undefined);
    sharedFns.createAccessToken.mockResolvedValue('access-token');
  });

  it('rejects invalid JSON body', async () => {
    const res = await handleRegister(
      new Request('https://example.com/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(400);
  });

  it('rejects when public registration is disabled', async () => {
    mocks.getConfigBool.mockResolvedValue(false);
    users.count.mockResolvedValue(1);
    const res = await handleRegister(
      makeReq('/api/register', 'POST', { email: 'u@e.com', name: 'U', password: 'password123' }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(403);
  });

  it('rejects rate limited requests', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, resetAt: Date.now() + 60000 });
    const res = await handleRegister(
      makeReq('/api/register', 'POST', { email: 'u@e.com', name: 'U', password: 'password123' }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(429);
  });

  it('rejects short password', async () => {
    const res = await handleRegister(
      makeReq('/api/register', 'POST', { email: 'u@e.com', name: 'U', password: 'short' }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email', async () => {
    users.findByEmail.mockResolvedValue({ id: 'existing' });
    const res = await handleRegister(
      makeReq('/api/register', 'POST', { email: 'u@e.com', name: 'U', password: 'password123' }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(409);
  });

  it('registers user with pending status', async () => {
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'public_registration_status') return 'pending';
      return fallback;
    });
    db.run.mockResolvedValue(undefined);
    const res = await handleRegister(
      makeReq('/api/register', 'POST', { email: 'u@e.com', name: 'U', password: 'password123' }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.status).toBe('pending');
  });

  it('registers user with active status and returns tokens', async () => {
    mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
      if (key === 'public_registration_status') return 'active';
      return fallback;
    });
    db.run.mockResolvedValue(undefined);
    const res = await handleRegister(
      makeReq('/api/register', 'POST', { email: 'u@e.com', name: 'U', password: 'password123' }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.access_token).toBe('access-token');
    expect(payload.refresh_token).toBe('rt');
  });

  it('first user becomes admin', async () => {
    users.count.mockResolvedValue(0);
    db.run.mockResolvedValue({ meta: { changes: 1 } });
    users.create.mockImplementation(async (data) => ({ ...data, id: data.id }));
    const res = await handleRegister(
      makeReq('/api/register', 'POST', {
        email: 'admin@e.com',
        name: 'Admin',
        password: 'password123',
      }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.user.primary_role).toBe('admin');
  });

  it('handles first-admin race condition', async () => {
    users.count.mockResolvedValue(0);
    db.run.mockResolvedValue({ meta: { changes: 0 } });
    const res = await handleRegister(
      makeReq('/api/register', 'POST', {
        email: 'admin@e.com',
        name: 'Admin',
        password: 'password123',
      }),
      env,
      db,
      users,
      jwtSecret,
      logger,
      sharedFns
    );
    expect(res.status).toBe(409);
  });
});
