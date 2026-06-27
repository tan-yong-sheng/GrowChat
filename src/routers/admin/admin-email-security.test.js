import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  ensureAdminMutationAccess: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminMutationAccess: (...args) => mocks.ensureAdminMutationAccess(...args),
  ensureAdminAclAccess: vi.fn(),
  isValidModelAccessId: vi.fn(),
}));

vi.mock('../../config/app.js', () => ({
  APP_LIMITS: {
    maxChatSendPerMinute: 20,
    maxLoginPerTenMinutes: 5,
    maxRegisterPerTenMinutes: 3,
    maxFileUploadPerHour: 50,
  },
  APP_TTLS: {
    accessTokenSeconds: 900,
    refreshTokenSeconds: 604800,
  },
}));

import { handleAdminEmailSecurity } from './admin-email-security.js';

function makeReq(path, method, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminEmailSecurity', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.ensureAdminMutationAccess.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getConfigValue.mockResolvedValue(null);
    mocks.setConfigValue.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('GET /api/admin/email-config', () => {
    it('returns email provider config', async () => {
      mocks.getConfigValue.mockResolvedValue('re_test_123');
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/email-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.email_provider).toBe('resend');
      expect(payload.resend_api_key_configured).toBe(true);
    });

    it('returns unconfigured when no key', async () => {
      mocks.getConfigValue.mockResolvedValue(null);
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/email-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.resend_api_key_configured).toBe(false);
    });

    it('returns 500 on error', async () => {
      mocks.getConfigValue.mockRejectedValue(new Error('fail'));
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/email-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/email-config', () => {
    it('rejects unauthenticated', async () => {
      mocks.ensureAdminMutationAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config', 'PUT', { resend_api_key: 're_test' }),
        env,
        ctx,
        user,
        '/api/admin/email-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('requires resend_api_key', async () => {
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config', 'PUT', {}),
        env,
        ctx,
        user,
        '/api/admin/email-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects empty resend_api_key', async () => {
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config', 'PUT', { resend_api_key: '  ' }),
        env,
        ctx,
        user,
        '/api/admin/email-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('saves and returns success', async () => {
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config', 'PUT', { resend_api_key: 're_test_123' }),
        env,
        ctx,
        user,
        '/api/admin/email-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.setConfigValue).toHaveBeenCalledWith(db, 'resend_api_key', 're_test_123');
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 500 on save failure', async () => {
      mocks.setConfigValue.mockRejectedValue(new Error('fail'));
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config', 'PUT', { resend_api_key: 're_test' }),
        env,
        ctx,
        user,
        '/api/admin/email-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/admin/email-config/test', () => {
    it('requires email field', async () => {
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config/test', 'POST', {}),
        env,
        ctx,
        user,
        '/api/admin/email-config/test',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('validates email format', async () => {
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config/test', 'POST', { email: 'invalid' }),
        env,
        ctx,
        user,
        '/api/admin/email-config/test',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects when API key not configured', async () => {
      mocks.getConfigValue.mockResolvedValue(null);
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/email-config/test', 'POST', { email: 'test@example.com' }),
        env,
        ctx,
        user,
        '/api/admin/email-config/test',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('sends test email successfully', async () => {
      mocks.getConfigValue.mockResolvedValue('re_test');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
      try {
        const res = await handleAdminEmailSecurity(
          makeReq('/api/admin/email-config/test', 'POST', { email: 'test@example.com' }),
          env,
          ctx,
          user,
          '/api/admin/email-config/test',
          { db, logger, _requestContext: {} }
        );
        expect(res.status).toBe(200);
        expect(mocks.logAuditEvent).toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('handles Resend API failure', async () => {
      mocks.getConfigValue.mockResolvedValue('re_test');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('{"message":"error"}', { status: 422 }))
      );
      try {
        const res = await handleAdminEmailSecurity(
          makeReq('/api/admin/email-config/test', 'POST', { email: 'test@example.com' }),
          env,
          ctx,
          user,
          '/api/admin/email-config/test',
          { db, logger, _requestContext: {} }
        );
        expect(res.status).toBe(400);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('returns 500 on exception', async () => {
      mocks.getConfigValue.mockResolvedValue('re_test');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      try {
        const res = await handleAdminEmailSecurity(
          makeReq('/api/admin/email-config/test', 'POST', { email: 'test@example.com' }),
          env,
          ctx,
          user,
          '/api/admin/email-config/test',
          { db, logger, _requestContext: {} }
        );
        expect(res.status).toBe(500);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('GET /api/admin/security-config', () => {
    it('returns rate limits and token TTLs', async () => {
      const res = await handleAdminEmailSecurity(
        makeReq('/api/admin/security-config', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/security-config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.rate_limits).toBeDefined();
      expect(payload.token_ttls).toBeDefined();
      expect(payload.rate_limits.chat_messages_per_minute).toBe(20);
      expect(payload.token_ttls.access_token_display).toContain('minute');
      expect(payload.token_ttls.refresh_token_display).toContain('day');
    });

    it('returns 500 on error', async () => {
      // Force an error by making JSON.stringify fail during response creation
      const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
        throw new Error('crash');
      });
      try {
        const res = await handleAdminEmailSecurity(
          makeReq('/api/admin/security-config', 'GET'),
          env,
          ctx,
          user,
          '/api/admin/security-config',
          { db, logger, _requestContext: {} }
        );
        expect(res.status).toBe(500);
      } finally {
        stringifySpy.mockRestore();
      }
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleAdminEmailSecurity(
      makeReq('/api/admin/unknown', 'GET'),
      env,
      ctx,
      user,
      '/api/admin/unknown',
      { db, logger, _requestContext: {} }
    );
    expect(result).toBeNull();
  });
});
