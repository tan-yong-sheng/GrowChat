import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Hoisted mocks ---
const mocks = vi.hoisted(() => ({
  db: {
    first: vi.fn(),
    run: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
      first: vi.fn().mockResolvedValue(null),
    }),
    batch: vi.fn().mockResolvedValue([]),
  },
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  signJWT: vi.fn(),
  createRefreshToken: vi.fn(),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  loadPrimaryRole: vi.fn(),
  logSecurityEvent: vi.fn(),
  findByGoogleId: vi.fn(),
  findByEmail: vi.fn(),
  findById: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  updateGoogleId: vi.fn(),
  touchLastActive: vi.fn(),
  kvGet: vi.fn(),
  kvPut: vi.fn(),
  kvDelete: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../shared/auth.js', () => ({
  hashPassword: (...args) => mocks.hashPassword(...args),
  verifyPassword: (...args) => mocks.verifyPassword(...args),
  signJWT: (...args) => mocks.signJWT(...args),
}));

vi.mock('../shared/session.js', () => ({
  createRefreshToken: (...args) => mocks.createRefreshToken(...args),
  consumeRefreshToken: (...args) => mocks.consumeRefreshToken(...args),
  revokeRefreshToken: (...args) => mocks.revokeRefreshToken(...args),
}));

vi.mock('../repositories/user-repository.js', () => ({
  createUserRepository: () => ({
    count: (...args) => mocks.count(...args),
    findByEmail: (...args) => mocks.findByEmail(...args),
    findByGoogleId: (...args) => mocks.findByGoogleId(...args),
    findById: (...args) => mocks.findById(...args),
    create: (...args) => mocks.create(...args),
    updateGoogleId: (...args) => mocks.updateGoogleId(...args),
    touchLastActive: (...args) => mocks.touchLastActive(...args),
  }),
}));

vi.mock('../utils/user-role.js', () => ({
  loadPrimaryRole: (...args) => mocks.loadPrimaryRole(...args),
  normalizePublicRole: vi.fn((r) => r || 'member'),
}));

vi.mock('../services/audit-logging.js', () => ({
  logSecurityEvent: (...args) => mocks.logSecurityEvent(...args),
  SecurityEventTypes: {
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILURE: 'login_failure',
    CSRF_TOKEN_VALIDATION_FAILED: 'csrf_token_validation_failed',
  },
}));

vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: { authLogin: { maxAttempts: 10, windowSeconds: 600 } },
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  resolveRateLimitSubject: vi.fn().mockReturnValue('ip:127.0.0.1'),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigBool: vi.fn().mockResolvedValue(true),
  getConfigValue: vi.fn().mockResolvedValue('pending'),
  setConfigValue: vi.fn(),
}));

vi.mock('../validation/request.js', () => ({
  requireString: vi.fn((v) => v),
  validateEmail: vi.fn((v) => v),
}));

import { authRouter } from './auth.js';

const VALID_JWT_SECRET = '0123456789abcdef0123456789abcdef';

function makeReq(path, method, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

function makeEnv(overrides = {}) {
  const sessionsKv = {
    get: mocks.kvGet,
    put: mocks.kvPut,
    delete: mocks.kvDelete,
  };
  return {
    DB: {},
    JWT_SECRET: VALID_JWT_SECRET,
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    SESSIONS: sessionsKv,
    CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

/**
 * Mock globalThis.fetch for Google OAuth token exchange + userinfo.
 * Returns a standard Google userinfo response unless overridden.
 */
function mockGoogleFetch(overrides = {}) {
  const tokenResponse = overrides.tokenResponse || {
    access_token: 'google-access-token',
    id_token: 'fake-id-token',
  };
  const userinfoResponse = overrides.userinfoResponse || {
    sub: 'google-123',
    email: 'new@gmail.com',
    name: 'New Google User',
    email_verified: true,
  };
  const tokenStatus = overrides.tokenStatus || 200;
  const userinfoStatus = overrides.userinfoStatus || 200;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mocks.mockFetch;
  mocks.mockFetch.mockImplementation(async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify(tokenResponse), {
        status: tokenStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('googleapis.com/oauth2/v3/userinfo')) {
      return new Response(JSON.stringify(userinfoResponse), {
        status: userinfoStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not found', { status: 404 });
  });
  return originalFetch;
}

function restoreFetch(originalFetch) {
  globalThis.fetch = originalFetch;
}

/**
 * Wraps a test function with mocked Google fetch, ensuring restoration
 * even if the test throws. Prevents cross-test fetch mock pollution.
 */
async function withMockedGoogleFetch(overrides, run) {
  const originalFetch = mockGoogleFetch(overrides);
  try {
    return await run();
  } finally {
    restoreFetch(originalFetch);
  }
}

describe('Google OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPrimaryRole.mockResolvedValue('member');
    mocks.signJWT.mockResolvedValue('jwt-token');
    mocks.createRefreshToken.mockResolvedValue({
      token: 'refresh-token',
      expiresAt: 1_700_000_000,
    });
    mocks.count.mockResolvedValue(1);
    mocks.findById.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'User',
      account_status: 'active',
      settings: '{}',
      created_at: 1,
      updated_at: 1,
    });
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.db.batch.mockResolvedValue([]);
    mocks.db.first.mockResolvedValue(null);
    mocks.logSecurityEvent.mockResolvedValue(undefined);
    mocks.kvGet.mockResolvedValue(null);
  });

  // --- GET /api/auth/google (redirect) ---

  it('redirects to Google OAuth consent screen when configured', async () => {
    const env = makeEnv();
    const req = makeReq('/api/auth/google', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google');

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(location).toContain('client_id=test-google-client-id');
    expect(location).toContain('response_type=code');
    expect(location).toContain('scope=openid+email+profile');
    expect(location).toContain('state=');
    // State should be stored in KV
    expect(mocks.kvPut).toHaveBeenCalled();
  });

  it('returns 503 when Google OAuth is not configured (no client ID)', async () => {
    const env = makeEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });
    const req = makeReq('/api/auth/google', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google');

    expect(res.status).toBe(503);
  });

  // --- GET /api/auth/google/callback ---

  it('redirects with error when user denies access', async () => {
    const env = makeEnv();
    const req = makeReq('/api/auth/google/callback?error=access_denied&state=test-state', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('oauth_error=access_denied');
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      env,
      'login_failure',
      expect.objectContaining({ provider: 'google', error: 'access_denied' })
    );
  });

  it('redirects with error when state parameter is invalid (CSRF)', async () => {
    const env = makeEnv();
    // KV returns null — state not found / expired
    mocks.kvGet.mockResolvedValue(null);

    const req = makeReq('/api/auth/google/callback?code=abc&state=bad-state', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('oauth_error=invalid_state');
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      env,
      'csrf_token_validation_failed',
      expect.objectContaining({ provider: 'google' })
    );
  });

  it('auto-provisions a new user when no matching account exists', async () => {
    const env = makeEnv();
    // Valid state in KV
    mocks.kvGet.mockImplementation(async (key) => {
      if (key.startsWith('oauth-state:')) {
        return { createdAt: Date.now() };
      }
      return null;
    });

    // No existing user by google_id or email
    mocks.findByGoogleId.mockResolvedValue(null);
    mocks.findByEmail.mockResolvedValue(null);

    // Create returns a new user
    mocks.create.mockResolvedValue({
      id: 'new-google-user',
      email: 'new@gmail.com',
      name: 'New Google User',
      account_status: 'active',
      settings: '{}',
      google_id: 'google-123',
    });

    const originalFetch = mockGoogleFetch();

    const req = makeReq('/api/auth/google/callback?code=abc123&state=test-state', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('access_token=jwt-token');
    expect(location).toContain('refresh_token=refresh-token');

    // Should have created a new user
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@gmail.com',
        googleId: 'google-123',
        accountStatus: 'active',
      })
    );

    // Should have logged security event for new account
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      env,
      'login_success',
      expect.objectContaining({ provider: 'google', isNewAccount: true })
    );

    restoreFetch(originalFetch);
  });

  it('links Google account to existing user with matching email', async () => {
    const env = makeEnv();
    // Valid state in KV
    mocks.kvGet.mockImplementation(async (key) => {
      if (key.startsWith('oauth-state:')) {
        return { createdAt: Date.now() };
      }
      return null;
    });

    // No user found by google_id, but found by email
    mocks.findByGoogleId.mockResolvedValue(null);
    mocks.findByEmail.mockResolvedValue({
      id: 'existing-u1',
      email: 'existing@gmail.com',
      name: 'Existing User',
      account_status: 'active',
      password_hash: 'pbkdf2:hash',
      settings: '{}',
    });

    mocks.updateGoogleId.mockResolvedValue(undefined);

    const originalFetch = mockGoogleFetch({
      userinfoResponse: {
        sub: 'google-456',
        email: 'existing@gmail.com',
        name: 'Existing User',
        email_verified: true,
      },
    });

    const req = makeReq('/api/auth/google/callback?code=abc123&state=test-state', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('access_token=jwt-token');

    // Should have linked the google_id to the existing user
    expect(mocks.updateGoogleId).toHaveBeenCalledWith('existing-u1', 'google-456');

    // Should NOT have created a new user
    expect(mocks.create).not.toHaveBeenCalled();

    restoreFetch(originalFetch);
  });

  it('logs in existing linked Google account directly', async () => {
    const env = makeEnv();
    // Valid state in KV
    mocks.kvGet.mockImplementation(async (key) => {
      if (key.startsWith('oauth-state:')) {
        return { createdAt: Date.now() };
      }
      return null;
    });

    // Found by google_id — existing linked account
    mocks.findByGoogleId.mockResolvedValue({
      id: 'linked-u1',
      email: 'linked@gmail.com',
      name: 'Linked User',
      account_status: 'active',
      password_hash: 'oauth:no-password',
      settings: '{}',
      google_id: 'google-789',
    });

    const originalFetch = mockGoogleFetch({
      userinfoResponse: {
        sub: 'google-789',
        email: 'linked@gmail.com',
        name: 'Linked User',
        email_verified: true,
      },
    });

    const req = makeReq('/api/auth/google/callback?code=abc123&state=test-state', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('access_token=jwt-token');

    // Should NOT have created or updated — just logged in
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.updateGoogleId).not.toHaveBeenCalled();

    // Should have logged security event for returning user
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      env,
      'login_success',
      expect.objectContaining({ provider: 'google', isNewAccount: false })
    );

    restoreFetch(originalFetch);
  });

  it('redirects with pending_account error for pending Google users', async () => {
    const env = makeEnv();
    // Valid state in KV
    mocks.kvGet.mockImplementation(async (key) => {
      if (key.startsWith('oauth-state:')) {
        return { createdAt: Date.now() };
      }
      return null;
    });

    // Existing linked user with pending status
    mocks.findByGoogleId.mockResolvedValue({
      id: 'pending-u1',
      email: 'pending@gmail.com',
      name: 'Pending User',
      account_status: 'pending',
      password_hash: 'oauth:no-password',
      settings: '{}',
      google_id: 'google-pending',
    });

    const originalFetch = mockGoogleFetch({
      userinfoResponse: {
        sub: 'google-pending',
        email: 'pending@gmail.com',
        name: 'Pending User',
        email_verified: true,
      },
    });

    const req = makeReq('/api/auth/google/callback?code=abc123&state=test-state', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('oauth_error=pending_account');
    expect(mocks.createRefreshToken).not.toHaveBeenCalled();

    restoreFetch(originalFetch);
  });

  it('returns 503 when callback called without Google OAuth configured', async () => {
    const env = makeEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });
    const req = makeReq('/api/auth/google/callback?code=abc', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    expect(res.status).toBe(503);
  });

  it('redirects with error when Google token exchange fails', async () => {
    const env = makeEnv();
    // Valid state in KV
    mocks.kvGet.mockImplementation(async (key) => {
      if (key.startsWith('oauth-state:')) {
        return { createdAt: Date.now() };
      }
      return null;
    });

    const originalFetch = mockGoogleFetch({ tokenStatus: 400 });

    const req = makeReq('/api/auth/google/callback?code=bad-code&state=test-state', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    expect(res.status).toBe(302);
    const location = res.headers.get('Location');
    expect(location).toContain('oauth_error=exchange_failed');
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      env,
      'login_failure',
      expect.objectContaining({ provider: 'google', error: 'token_exchange_failed' })
    );

    restoreFetch(originalFetch);
  });

  it('consumes the OAuth state (one-time use) on successful validation', async () => {
    const env = makeEnv();
    mocks.kvGet.mockImplementation(async (key) => {
      if (key.startsWith('oauth-state:test-state')) {
        return { createdAt: Date.now() };
      }
      return null;
    });

    mocks.findByGoogleId.mockResolvedValue({
      id: 'u1',
      email: 'user@gmail.com',
      name: 'User',
      account_status: 'active',
      settings: '{}',
      google_id: 'google-123',
    });

    const originalFetch = mockGoogleFetch();
    const req = makeReq('/api/auth/google/callback?code=abc&state=test-state', 'GET');
    await authRouter(req, env, {}, null, '/api/auth/google/callback');

    // State should be deleted (consumed) from KV
    expect(mocks.kvDelete).toHaveBeenCalledWith(expect.stringContaining('oauth-state:test-state'));

    restoreFetch(originalFetch);
  });

  it('redirects with error when callback has no code parameter', async () => {
    const env = makeEnv();
    mocks.kvGet.mockResolvedValue(null);

    const req = makeReq('/api/auth/google/callback?state=some-state', 'GET');
    const res = await authRouter(req, env, {}, null, '/api/auth/google/callback');

    // Missing code parameter → 400 error
    expect(res.status).toBe(302);
  });

  it('redirects with error when Google email is not verified', async () => {
    const env = makeEnv();
    // Set up valid state in KV so CSRF check passes
    mocks.kvGet.mockResolvedValueOnce({ createdAt: Date.now() });
    await withMockedGoogleFetch(
      {
        userinfoResponse: {
          sub: 'google-unverified',
          email: 'unverified@gmail.com',
          name: 'Unverified User',
          email_verified: false,
        },
      },
      async () => {
        const req = makeReq('/api/auth/google/callback?state=valid-state&code=auth-code', 'GET');
        const result = await authRouter(req, env, {}, null, '/api/auth/google/callback');
        expect(result.status).toBe(302);
        expect(result.headers.get('location')).toContain('oauth_error=missing_info');
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.updateGoogleId).not.toHaveBeenCalled();
      }
    );
  });

  it('returns 429 when Google OAuth initiation is rate limited', async () => {
    // Override the global checkRateLimit mock for this test
    const { checkRateLimit } = await import('../services/rate-limit.js');
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      resetAt: Date.now() + 60000,
    });
    const env = makeEnv();
    const req = makeReq('/api/auth/google', 'GET');
    const result = await authRouter(req, env, {}, null, '/api/auth/google');
    expect(result.status).toBe(429);
  });
});
