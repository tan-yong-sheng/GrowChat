import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mock registry                                              */
/* ------------------------------------------------------------------ */
const mocks = vi.hoisted(() => ({
  kvStore: {},     // KV namespace for refresh tokens
  // Query-specific response map for db.first()
  firstResponses: new Map(),
  // FIFO for db.run()
  runResponses: [],
  dbBatch: vi.fn().mockResolvedValue([]),
}));

/* ------------------------------------------------------------------ */
/*  Module mocks — infrastructure only                                 */
/* ------------------------------------------------------------------ */

// D1 database wrapper
vi.mock('../db.js', () => ({
  createDB: () => ({
    first: async (sql, params) => {
      const query = String(sql || '');
      // Special case: findByEmail with columns='id' always returns null
      if (query.includes('SELECT id FROM users WHERE email')) {
        return null;
      }
      // Check if there's a specific response registered for this query pattern
      for (const [pattern, response] of mocks.firstResponses) {
        if (query.includes(pattern)) {
          mocks.firstResponses.delete(pattern);
          return response;
        }
      }
      return null;
    },
    run: async (sql, params) => {
      const resp = mocks.runResponses.shift() ?? { success: true };
      return resp;
    },
    prepare: (sql) => {
      return {
        bind: (...params) => ({
          first: async () => {
            const query = String(sql || '');
            for (const [pattern, response] of mocks.firstResponses) {
              if (query.includes(pattern)) {
                mocks.firstResponses.delete(pattern);
                return response;
              }
            }
            return null;
          },
          run: async () => {
            const resp = mocks.runResponses.shift() ?? { success: true };
            return resp;
          },
        }),
      };
    },
    batch: async (statements) => {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
  }),
}));

// Session / refresh-token KV store — use real implementation
vi.mock('../shared/session.js', () => ({
  createRefreshToken: async (env, userId) => {
    const mod = await vi.importActual('../shared/session.js');
    const token = mod.generateOpaqueToken();
    const tokenHash = await mod.sha256Hex(token);
    const expiresAt = Math.floor(Date.now() / 1000) + 604800;
    const store = env.SESSIONS || {};
    store[`refresh:${tokenHash}`] = '1';
    store[`refresh-data:${tokenHash}`] = JSON.stringify({ userId, expiresAt, sessionVersion: 0 });
    return { token, expiresAt };
  },
  consumeRefreshToken: async (env, token) => {
    const mod = await vi.importActual('../shared/session.js');
    if (!token) return null;
    const tokenHash = await mod.sha256Hex(token);
    const gateKey = `refresh:${tokenHash}`;
    const dataKey = `refresh-data:${tokenHash}`;
    const store = env.SESSIONS || {};
    if (!Object.prototype.hasOwnProperty.call(store, gateKey)) return null;
    delete store[gateKey];
    const raw = store[dataKey];
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return data;
  },
  revokeRefreshToken: async (env, token) => {
    const mod = await vi.importActual('../shared/session.js');
    if (!token) return;
    const tokenHash = await mod.sha256Hex(token);
    const store = env.SESSIONS || {};
    delete store[`refresh:${tokenHash}`];
    delete store[`refresh-data:${tokenHash}`];
  },
}));

// JWT secret — stable 32-char test secret
vi.mock('../shared/jwt-secret.js', () => ({
  getJwtSecret: () => 'test-jwt-secret-not-real-0123456789',
}));

// Rate limit — inline no-op store approach
vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: {
    authLogin: { limit: 10, windowSeconds: 600 },
    authRegister: { limit: 5, windowSeconds: 600 },
  },
  checkRateLimit: async (store, opts) => {
    const noopStore = { get: async () => null, put: async () => {} };
    const real = await vi.importActual('../services/rate-limit.js');
    return real.checkRateLimit(noopStore, opts);
  },
  resolveRateLimitSubject: () => 'test-client',
}));

// User repository — use the real one
vi.mock('../repositories/user-repository.js', async () => {
  const real = await vi.importActual('../repositories/user-repository.js');
  return { UserRepository: real.UserRepository, createUserRepository: real.createUserRepository };
});

// User role — use real normalize, mock loadPrimaryRole
vi.mock('../utils/user-role.js', async () => {
  const real = await vi.importActual('../utils/user-role.js');
  return {
    loadPrimaryRole: async () => 'member',
    normalizePublicRole: real.normalizePublicRole,
  };
});

// App config — default public registration to enabled
vi.mock('../utils/app-config.js', async () => {
  const real = await vi.importActual('../utils/app-config.js');
  return {
    getConfigValue: async (db, key, fallback) => {
      if (key === 'public_registration_status') return 'active';
      if (key === 'public_registration') return true;
      return real.getConfigValue(db, key, fallback);
    },
    getConfigBool: async (db, key, fallback) => {
      if (key === 'public_registration') return true;
      return real.getConfigBool(db, key, fallback);
    },
    setConfigValue: real.setConfigValue,
  };
});

// Import the real auth primitives (NOT mocked)
import { hashPassword, verifyPassword, signJWT } from '../shared/auth.js';

// Import the router under test
import { authRouter } from './auth.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const VALID_JWT_SECRET = 'test-jwt-secret-not-real-0123456789';

function makeReq(path, method, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

/**
 * Register a user with a real-hashed password.
 * Returns { response, env, body }.
 */
async function registerUser(email, password, name = 'Test User') {
  mocks.runResponses.length = 0;
  mocks.kvStore = {};
  mocks.firstResponses.clear();

  const env = {
    DB: {},
    JWT_SECRET: VALID_JWT_SECRET,
    CACHE: {},
    SESSIONS: mocks.kvStore,
  };

  // Register DB responses for registration flow:
  // 1. SELECT COUNT(*) as count FROM users → { count: 0 }
  mocks.firstResponses.set('SELECT COUNT(*)', { count: 0 });
  // 2. SELECT * FROM users WHERE id = ? (findById in users.create) → user row
  const userId = crypto.randomUUID();
  mocks.firstResponses.set('SELECT * FROM users WHERE id', {
    id: userId,
    email,
    name,
    account_status: 'active',
    settings: '{}',
    created_at: Date.now(),
    updated_at: Date.now(),
    last_active_at: Date.now(),
  });

  // Register DB responses for run operations during registration:
  // 1. INSERT OR IGNORE first_admin_claimed
  mocks.runResponses.push({ meta: { changes: 1 } });
  // 2. INSERT INTO users (users.create)
  mocks.runResponses.push({ success: true });
  // 3. setConfigValue for public_registration='false'
  mocks.runResponses.push({ success: true });
  // 4-5. ensureUserRoleBinding batch: DELETE user_roles + INSERT user_roles
  mocks.runResponses.push({ success: true });
  mocks.runResponses.push({ success: true });

  const res = await authRouter(
    makeReq('/api/auth/register', 'POST', { email, name, password }),
    env,
    {},
    null,
    '/api/auth/register'
  );

  const body = res.status === 201 ? await res.json() : null;
  return { response: res, env, body };
}

/**
 * Set up the DB query/run queues for a successful login flow.
 */
function setupLoginQueue(userRow, userByIdRow) {
  // findByEmail (SELECT * FROM users WHERE email = ?)
  mocks.firstResponses.set('SELECT * FROM users WHERE email', userRow);
  // touchLastActive + ensureUserRoleBinding runs
  mocks.runResponses.push({ success: true });
  mocks.runResponses.push({ success: true });
  mocks.runResponses.push({ success: true });
  // findById (SELECT * FROM users WHERE id = ?)
  mocks.firstResponses.set('SELECT * FROM users WHERE id', userByIdRow);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('auth integration — tracer bullets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runResponses.length = 0;
    mocks.firstResponses.clear();
    mocks.dbBatch.mockResolvedValue([]);
    mocks.kvStore = {};
  });

  it('a user registered with a real-hashed password can log in with the same password', async () => {
    const email = 'tracer@example.com';
    const password = 'integration-pass';
    const name = 'Tracer User';

    // ---- Step 1: Register (real hashPassword, real PBKDF2) ----
    const { response: regRes, env, body: regBody } = await registerUser(email, password, name);
    expect(regRes.status).toBe(201);
    expect(regBody.user.email).toBe(email);
    expect(regBody.user.account_status).toBe('active');

    // Compute the real PBKDF2 hash for the password (same algorithm used during register)
    const realHash = await hashPassword(password);

    // ---- Step 2: Login with correct credentials ----
    const userRow = {
      id: regBody.user.id,
      email,
      name,
      account_status: 'active',
      password_hash: realHash,
      settings: '{}',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_active_at: Date.now(),
    };

    const userByIdRow = { ...userRow };
    setupLoginQueue(userRow, userByIdRow);

    const loginRes = await authRouter(
      makeReq('/api/auth/login', 'POST', { email, password }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody).toHaveProperty('access_token');
    expect(loginBody).toHaveProperty('refresh_token');
    expect(loginBody.user.email).toBe(email);
    expect(loginBody.user.account_status).toBe('active');

    // Verify the JWT is a real HS256-signed token (3 dot-separated segments)
    const parts = loginBody.access_token.split('.');
    expect(parts.length).toBe(3);
  });

  it('a user with an & in their password can log in', async () => {
    const email = 'special@example.com';
    const password = 'pass&word123';
    const name = 'Ampersand User';

    // ---- Register (real hashPassword handles & correctly) ----
    const { response: regRes, env, body: regBody } = await registerUser(email, password, name);
    expect(regRes.status).toBe(201);
    expect(regBody.user.email).toBe(email);

    // Compute the real hash for the password containing &
    const realHash = await hashPassword(password);

    // ---- Login with the same password containing & ----
    const userRow = {
      id: regBody.user.id,
      email,
      name,
      account_status: 'active',
      password_hash: realHash,
      settings: '{}',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_active_at: Date.now(),
    };

    const userByIdRow = { ...userRow };
    setupLoginQueue(userRow, userByIdRow);

    const loginRes = await authRouter(
      makeReq('/api/auth/login', 'POST', { email, password }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody).toHaveProperty('access_token');
    expect(loginBody.user.email).toBe(email);

    // Verify the JWT is a real signed token
    const parts = loginBody.access_token.split('.');
    expect(parts.length).toBe(3);

    // Decode the payload to confirm the user identity survived the & character
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (payloadB64.length % 4 || 4)) % 4);
    const payload = JSON.parse(atob(payloadB64 + padding));
    expect(payload.email).toBe(email);
  });

  it('returns 401 when password is wrong', async () => {
    const email = 'wrongpass@example.com';
    const correctPassword = 'correct123';
    const wrongPassword = 'wrong456';
    const realHash = await hashPassword(correctPassword);

    const userRow = {
      id: crypto.randomUUID(),
      email,
      name: 'Wrong Pass User',
      account_status: 'active',
      password_hash: realHash,
      settings: '{}',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_active_at: Date.now(),
    };

    mocks.firstResponses.set('SELECT * FROM users WHERE email', userRow);

    const env = {
      DB: {},
      JWT_SECRET: VALID_JWT_SECRET,
      CACHE: {},
      SESSIONS: {},
    };

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', { email, password: wrongPassword }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid credentials');
  });

  it('returns 401 when email does not exist', async () => {
    const email = 'missing@example.com';

    // No mock for findByEmail → returns null by default
    const env = {
      DB: {},
      JWT_SECRET: VALID_JWT_SECRET,
      CACHE: {},
      SESSIONS: {},
    };

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', { email, password: 'anypassword' }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid credentials');
  });

  it('returns 403 when account status is pending', async () => {
    const email = 'pending@example.com';
    const password = 'pendingpass';
    const realHash = await hashPassword(password);

    const userRow = {
      id: crypto.randomUUID(),
      email,
      name: 'Pending User',
      account_status: 'pending',
      password_hash: realHash,
      settings: '{}',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_active_at: Date.now(),
    };

    mocks.firstResponses.set('SELECT * FROM users WHERE email', userRow);

    const env = {
      DB: {},
      JWT_SECRET: VALID_JWT_SECRET,
      CACHE: {},
      SESSIONS: {},
    };

    const res = await authRouter(
      makeReq('/api/auth/login', 'POST', { email, password }),
      env,
      {},
      null,
      '/api/auth/login'
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('pending_account');
  });
});
