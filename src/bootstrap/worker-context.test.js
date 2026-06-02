import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyJWT: vi.fn(),
  getJwtSecret: vi.fn(),
  loadPrimaryRoleFromDb: vi.fn(),
}));

vi.mock('../shared/auth.js', () => ({
  verifyJWT: (...args) => mocks.verifyJWT(...args),
}));

vi.mock('../shared/jwt-secret.js', () => ({
  getJwtSecret: (...args) => mocks.getJwtSecret(...args),
}));

vi.mock('../utils/user-role.js', () => ({
  loadPrimaryRole: (...args) => mocks.loadPrimaryRoleFromDb(...args),
}));

import {
  getPath,
  readBearer,
  resolveAuthUser,
  loadPrimaryRole,
  loadUserAccountStatus,
  touchLastActive,
  validateRouteBindings,
} from './worker-context.js';

describe('getPath', () => {
  it('extracts pathname from request URL', () => {
    const req = new Request('http://localhost/api/test?foo=bar');
    expect(getPath(req)).toBe('/api/test');
  });

  it('handles root path', () => {
    const req = new Request('http://localhost/');
    expect(getPath(req)).toBe('/');
  });
});

describe('readBearer', () => {
  it('extracts Bearer token from Authorization header', () => {
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer abc123' },
    });
    expect(readBearer(req)).toBe('abc123');
  });

  it('trims whitespace from token', () => {
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer   abc123   ' },
    });
    expect(readBearer(req)).toBe('abc123');
  });

  it('returns null when no Authorization header', () => {
    const req = new Request('http://localhost/');
    expect(readBearer(req)).toBeNull();
  });

  it('returns null for non-Bearer auth scheme', () => {
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Basic abc123' },
    });
    expect(readBearer(req)).toBeNull();
  });

  it('returns null for empty Authorization header', () => {
    const req = new Request('http://localhost/', {
      headers: { Authorization: '' },
    });
    expect(readBearer(req)).toBeNull();
  });
});

describe('resolveAuthUser', () => {
  it('returns null when no token', async () => {
    mocks.getJwtSecret.mockReturnValue('secret');
    const req = new Request('http://localhost/');
    expect(await resolveAuthUser(req, { JWT_SECRET: 'a'.repeat(32) })).toBeNull();
  });

  it('returns null when no jwtSecret', async () => {
    mocks.getJwtSecret.mockReturnValue(null);
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer abc' },
    });
    expect(await resolveAuthUser(req, {})).toBeNull();
  });

  it('returns verified user on valid JWT', async () => {
    mocks.getJwtSecret.mockReturnValue('valid-secret');
    mocks.verifyJWT.mockResolvedValueOnce({ sub: 'user-1', role: 'admin' });
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    const result = await resolveAuthUser(req, { JWT_SECRET: 'a'.repeat(32) });
    expect(result).toEqual({ sub: 'user-1', role: 'admin' });
  });

  it('returns null on invalid JWT', async () => {
    mocks.getJwtSecret.mockReturnValue('secret');
    mocks.verifyJWT.mockRejectedValueOnce(new Error('Invalid token'));
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(await resolveAuthUser(req, { JWT_SECRET: 'a'.repeat(32) })).toBeNull();
  });
});

describe('loadPrimaryRole', () => {
  it('delegates to loadPrimaryRoleFromDb', async () => {
    mocks.loadPrimaryRoleFromDb.mockResolvedValueOnce('admin');
    const env = { DB: {} };
    const result = await loadPrimaryRole(env, 'user-1');
    expect(result).toBe('admin');
    // loadPrimaryRole passes env?.DB, not env
    expect(mocks.loadPrimaryRoleFromDb).toHaveBeenCalledWith(env.DB, 'user-1');
  });
});

describe('loadUserAccountStatus', () => {
  it('returns null when no userId', async () => {
    expect(await loadUserAccountStatus({}, null)).toBeNull();
    expect(await loadUserAccountStatus({}, '')).toBeNull();
  });

  it('returns active for active user', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ account_status: 'active' });
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: mockFirst }) }),
      },
    };
    const result = await loadUserAccountStatus(env, 'user-1');
    expect(result).toBe('active');
  });

  it('returns pending for non-active status', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ account_status: 'pending' });
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: mockFirst }) }),
      },
    };
    const result = await loadUserAccountStatus(env, 'user-1');
    expect(result).toBe('pending');
  });

  it('returns pending for suspended user', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ account_status: 'suspended' });
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: mockFirst }) }),
      },
    };
    const result = await loadUserAccountStatus(env, 'user-1');
    expect(result).toBe('pending');
  });

  it('returns null when user not found', async () => {
    const mockFirst = vi.fn().mockResolvedValue(null);
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: mockFirst }) }),
      },
    };
    const result = await loadUserAccountStatus(env, 'user-1');
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi
            .fn()
            .mockReturnValue({ first: vi.fn().mockRejectedValue(new Error('DB error')) }),
        }),
      },
    };
    const result = await loadUserAccountStatus(env, 'user-1');
    expect(result).toBeNull();
  });

  it('normalizes account_status case-insensitively', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ account_status: 'ACTIVE' });
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: mockFirst }) }),
      },
    };
    const result = await loadUserAccountStatus(env, 'user-1');
    expect(result).toBe('active');
  });

  it('treats empty account_status as active (not pending)', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ account_status: '' });
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: mockFirst }) }),
      },
    };
    const result = await loadUserAccountStatus(env, 'user-1');
    // Empty string trims to empty, normalized to 'active' by the normalize logic
    expect(result).toBe('active');
  });
});

describe('touchLastActive', () => {
  it('skips when userId is empty', async () => {
    const env = { DB: { prepare: vi.fn() } };
    await touchLastActive(env, '');
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('skips when env.DB is missing', async () => {
    await touchLastActive({}, 'user-1');
    // No error thrown
  });

  it('updates last_active_at on success', async () => {
    const mockRun = vi.fn().mockResolvedValue({ success: true });
    const env = {
      DB: { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ run: mockRun }) }) },
    };
    await touchLastActive(env, 'user-1');
    expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'));
  });

  it('silently handles "no such column" error', async () => {
    const mockRun = vi.fn().mockRejectedValue(new Error('no such column: last_active_at'));
    const env = {
      DB: { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ run: mockRun }) }) },
    };
    await expect(touchLastActive(env, 'user-1')).resolves.toBeUndefined();
  });

  it('logs warning for other DB errors', async () => {
    const mockRun = vi.fn().mockRejectedValue(new Error('connection lost'));
    const env = {
      DB: { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ run: mockRun }) }) },
    };
    // Should not throw
    await expect(touchLastActive(env, 'user-1')).resolves.toBeUndefined();
  });
});

describe('validateRouteBindings', () => {
  it('returns null when all required bindings are present', () => {
    const req = new Request('http://localhost/api/chats');
    const env = { FILES: {}, MESSAGE_QUEUE: {} };
    expect(validateRouteBindings(req, env, '/api/chats')).toBeNull();
  });

  it('returns error when FILES binding missing for upload route', () => {
    const req = { method: 'POST', headers: new Headers() };
    const env = { FILES: null };
    const result = validateRouteBindings(req, env, '/api/files/upload');
    expect(result).not.toBeNull();
    expect(result.status).toBe(500);
  });

  it('returns null when FILES binding present for upload route', () => {
    const req = { method: 'POST', headers: new Headers() };
    const env = { FILES: {} };
    expect(validateRouteBindings(req, env, '/api/files/upload')).toBeNull();
  });

  it('returns error when MESSAGE_QUEUE binding missing for realtime route', () => {
    const req = { method: 'GET', headers: new Headers() };
    const env = { MESSAGE_QUEUE: null };
    const result = validateRouteBindings(req, env, '/api/realtime/stream');
    expect(result).not.toBeNull();
    expect(result.status).toBe(500);
  });

  it('returns null when MESSAGE_QUEUE binding present for realtime route', () => {
    const req = { method: 'GET', headers: new Headers() };
    const env = { MESSAGE_QUEUE: {} };
    expect(validateRouteBindings(req, env, '/api/realtime/stream')).toBeNull();
  });

  it('returns null for routes that do not require bindings', () => {
    const req = { method: 'GET', headers: new Headers() };
    const env = {};
    expect(validateRouteBindings(req, env, '/api/auth/login')).toBeNull();
  });

  it('does not check FILES for non-POST on upload route', () => {
    const req = { method: 'GET', headers: new Headers() };
    const env = {};
    expect(validateRouteBindings(req, env, '/api/files/upload')).toBeNull();
  });
});
