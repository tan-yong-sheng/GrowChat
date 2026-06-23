import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  appTtls: {
    accessTokenSeconds: 60 * 15,
    refreshTokenSeconds: 60 * 60 * 24 * 7,
    schemaCompatibilityWaitMs: 60 * 1000,
  },
  appLimits: {
    maxAttachments: 8,
    maxAttachmentBytes: 12 * 1024 * 1024,
    maxAttachmentTotalBytes: 24 * 1024 * 1024,
    maxTextAttachmentChars: 100000,
    defaultPageSize: 20,
    maxPageSize: 100,
    maxChatSendPerMinute: 30,
    maxLoginPerTenMinutes: 10,
    maxRegisterPerTenMinutes: 5,
    maxFileUploadPerHour: 10,
  },
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

vi.mock('../../utils/response.js', () => ({
  error: (req, msg, status) => new Response(JSON.stringify({ error: msg }), { status }),
  json: (req, data, status = 200) => new Response(JSON.stringify(data), { status }),
}));

vi.mock('../../config/app.js', () => ({
  APP_LIMITS: mocks.appLimits,
  APP_TTLS: mocks.appTtls,
  APP_DEFAULTS: { defaultModelFallback: '@cf/meta/llama-3.1-8b-instruct', appName: 'GrowChat' },
}));

import { handleAdminEmailSecurity } from './admin-email-security.js';
import { APP_LIMITS, APP_TTLS } from '../../config/app.js';

describe('handleAdminEmailSecurity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appTtls.accessTokenSeconds = 60 * 15;
    mocks.appTtls.refreshTokenSeconds = 60 * 60 * 24 * 7;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  function makeReq(path, method = 'GET', opts = {}) {
    return new Request(`https://example.com${path}`, {
      method,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      headers: opts.headers || {},
    });
  }

  const db = {
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };
  const logger = { error: vi.fn() };
  const user = { sub: 'admin-1' };

  it('returns null for unmatched paths', async () => {
    const req = makeReq('/api/admin/unknown');
    const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/unknown', {
      db,
      logger,
    });
    expect(res).toBeNull();
  });

  it('returns null for POST to security-config (kills method-check mutant)', async () => {
    const req = makeReq('/api/admin/security-config', 'POST');
    const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
      db,
      logger,
    });
    expect(res).toBeNull();
  });

  describe('GET /api/admin/email-config', () => {
    it('returns config when key is set', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('test-key');
      const req = makeReq('/api/admin/email-config');

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.email_provider).toBe('resend');
      expect(json.resend_api_key_configured).toBe(true);
    });

    it('returns config when key is not set', async () => {
      mocks.getConfigValue.mockResolvedValueOnce(null);
      const req = makeReq('/api/admin/email-config');

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.resend_api_key_configured).toBe(false);
    });

    it('returns 500 on Error object', async () => {
      mocks.getConfigValue.mockRejectedValueOnce(new Error('db fail'));
      const req = makeReq('/api/admin/email-config');

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('Failed to fetch email config');
      expect(logger.error).toHaveBeenCalledWith(
        'Email config fetch failed',
        expect.objectContaining({ error: 'db fail' })
      );
    });

    it('returns 500 when error is a string (kills optional-chain || mutants)', async () => {
      mocks.getConfigValue.mockRejectedValueOnce('db fail');
      const req = makeReq('/api/admin/email-config');

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith(
        'Email config fetch failed',
        expect.objectContaining({ error: 'db fail' })
      );
    });

    it('returns 500 when error is null (kills optional-chain mutant)', async () => {
      mocks.getConfigValue.mockImplementationOnce(() => {
        throw null;
      });
      const req = makeReq('/api/admin/email-config');

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith('Email config fetch failed', expect.any(Object));
    });
  });

  describe('PUT /api/admin/email-config', () => {
    it('returns 400 for invalid JSON', async () => {
      const req = new Request('https://example.com/api/admin/email-config', {
        method: 'PUT',
        body: 'not-json',
      });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid JSON body');
    });

    it('returns 403 when mutation access denied with explicit reason', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: false, reason: 'NoWrite' });
      const req = makeReq('/api/admin/email-config', 'PUT', { body: { resend_api_key: 'key' } });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('NoWrite');
    });

    it('returns 403 when mutation access denied without reason (kills || mutant)', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: false });
      const req = makeReq('/api/admin/email-config', 'PUT', { body: { resend_api_key: 'key' } });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Forbidden');
    });

    it('passes correct permission and resource to authorization', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      const req = makeReq('/api/admin/email-config', 'PUT', {
        body: { resend_api_key: 'key' },
      });

      await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(mocks.authorize).toHaveBeenCalledWith(
        expect.anything(),
        user,
        expect.objectContaining({ action: 'admin.rbac.admin', resource: 'email-config' })
      );
    });

    it('returns 400 when resend_api_key is missing', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      const req = makeReq('/api/admin/email-config', 'PUT', { body: {} });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('resend_api_key is required');
    });

    it('returns 400 when resend_api_key is empty after trim', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      const req = makeReq('/api/admin/email-config', 'PUT', {
        body: { resend_api_key: '   ' },
      });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('resend_api_key cannot be empty');
    });

    it('trims and stores the API key (kills String.trim mutant)', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      mocks.setConfigValue.mockResolvedValueOnce();
      mocks.logAuditEvent.mockResolvedValueOnce();
      const req = makeReq('/api/admin/email-config', 'PUT', {
        body: { resend_api_key: '  new-key  ' },
      });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(200);
      expect(mocks.setConfigValue).toHaveBeenCalledWith(db, 'resend_api_key', 'new-key');
    });

    it('updates config and logs audit event on success', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      mocks.setConfigValue.mockResolvedValueOnce();
      mocks.logAuditEvent.mockResolvedValueOnce();
      const req = makeReq('/api/admin/email-config', 'PUT', {
        body: { resend_api_key: 'new-key' },
      });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).message).toBe('Email configuration updated');
      expect(mocks.setConfigValue).toHaveBeenCalledWith(db, 'resend_api_key', 'new-key');
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actor_id: 'admin-1',
          action: 'email_config_updated',
          resource_type: 'admin',
          resource_id: 'email-config',
        }),
        logger
      );
    });

    it('returns 500 when update fails', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      mocks.setConfigValue.mockRejectedValueOnce(new Error('write fail'));
      const req = makeReq('/api/admin/email-config', 'PUT', { body: { resend_api_key: 'k' } });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to update email config');
      expect(logger.error).toHaveBeenCalledWith(
        'Email config update failed',
        expect.objectContaining({ error: 'write fail' })
      );
    });

    it('returns 500 when update throws a string (kills || mutant)', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      mocks.setConfigValue.mockImplementationOnce(() => {
        throw 'write fail';
      });
      const req = makeReq('/api/admin/email-config', 'PUT', { body: { resend_api_key: 'k' } });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith(
        'Email config update failed',
        expect.objectContaining({ error: 'write fail' })
      );
    });
  });

  describe('POST /api/admin/email-config/test', () => {
    it('returns 400 for invalid JSON', async () => {
      const req = new Request('https://example.com/api/admin/email-config/test', {
        method: 'POST',
        body: 'not-json',
      });

      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid JSON body');
    });

    it('returns 400 when email is missing', async () => {
      const req = makeReq('/api/admin/email-config/test', 'POST', { body: {} });

      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('email is required');
    });

    it('returns 400 for email without @', async () => {
      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test.example.com' },
      });

      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid email address');
    });

    it('returns 400 for email without dot', async () => {
      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example' },
      });

      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid email address');
    });

    it('returns 400 when no API key configured', async () => {
      mocks.getConfigValue.mockResolvedValueOnce(null);
      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });

      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Resend API key not configured');
    });

    it('sends test email successfully', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(200);
      expect((await res.json()).message).toBe('Test email sent');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer api-key-123',
          }),
        })
      );
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actor_id: 'admin-1',
          action: 'email_config_test_sent',
          resource_type: 'admin',
          resource_id: 'email-config',
          metadata: { test_email: 'test@example.com' },
        }),
        logger
      );

      delete global.fetch;
    });

    it('lowercases and trims the email (kills String.toLowerCase/trim mutants)', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'email-2' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: '  TEST@EXAMPLE.COM  ' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(200);
      const fetchBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(fetchBody.from).toBe('noreply@growchat.app');
      expect(fetchBody.to).toBe('test@example.com');
      expect(fetchBody.subject).toBe('GrowChat Email Configuration Test');
      expect(fetchBody.html).toBe(
        '<p>This is a test email from GrowChat. Your email configuration is working correctly.</p>'
      );
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ metadata: { test_email: 'test@example.com' } }),
        logger
      );
      // Verify fetch was called with correct Content-Type header
      expect(fetch.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
      delete global.fetch;
    });

    it('verifies exact config key used for getConfigValue (kills string literal mutants)', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('key');
      const req = makeReq('/api/admin/email-config');

      await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(mocks.getConfigValue).toHaveBeenCalledWith(db, 'resend_api_key', null);
    });

    it('verifies exact config key used for test email getConfigValue', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('key');
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'e1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config/test', {
        db,
        logger,
      });
      expect(mocks.getConfigValue).toHaveBeenCalledWith(db, 'resend_api_key', null);
      delete global.fetch;
    });

    it('returns null for PUT to wrong path (kills conditional mutant)', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      const req = makeReq('/api/admin/email-config/test', 'PUT', {
        body: { resend_api_key: 'key' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res).toBeNull();
    });

    it('returns 400 when Resend API returns error with code field (kills || mutant)', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'invalid_key', message: 'Bad' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      );
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Failed to send test email');
      expect(logger.error).toHaveBeenCalledWith(
        'Resend API error',
        expect.objectContaining({
          status: 401,
          code: 'invalid_key',
          message: 'Bad',
        })
      );

      delete global.fetch;
    });

    it('returns 400 when Resend API error has name but no code (kills || mutant)', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ name: 'auth_error', message: 'Bad' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      );
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect(logger.error).toHaveBeenCalledWith(
        'Resend API error',
        expect.objectContaining({
          status: 401,
          code: 'auth_error',
          message: 'Bad',
        })
      );

      delete global.fetch;
    });

    it('returns 400 when Resend API error has neither code nor name', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'unknown' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      );
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect(logger.error).toHaveBeenCalledWith(
        'Resend API error',
        expect.objectContaining({
          code: undefined,
          message: 'unknown',
        })
      );

      delete global.fetch;
    });

    it('handles Resend error response with non-JSON body', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockResolvedValue(new Response('plain text error', { status: 500 }));
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Failed to send test email');

      delete global.fetch;
    });

    it('returns 500 on unexpected fetch error', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockRejectedValue(new Error('network timeout'));
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to send test email');
      expect(logger.error).toHaveBeenCalledWith(
        'Email test failed',
        expect.objectContaining({ error: 'network timeout' })
      );

      delete global.fetch;
    });

    it('returns 500 when test error is a string (kills || mutant)', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockRejectedValue('network fail');
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith(
        'Email test failed',
        expect.objectContaining({ error: 'network fail' })
      );

      delete global.fetch;
    });

    it('returns 500 when fetch throws null (kills optional-chain mutant)', async () => {
      mocks.getConfigValue.mockResolvedValueOnce('api-key-123');
      const fetch = vi.fn().mockRejectedValue(null);
      global.fetch = fetch;

      const req = makeReq('/api/admin/email-config/test', 'POST', {
        body: { email: 'test@example.com' },
      });
      const res = await handleAdminEmailSecurity(
        req,
        {},
        {},
        user,
        '/api/admin/email-config/test',
        { db, logger }
      );
      expect(res.status).toBe(500);

      delete global.fetch;
    });

    it('returns 500 when PUT update throws null (kills optional-chain mutant)', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: true });
      mocks.setConfigValue.mockImplementationOnce(() => {
        throw null;
      });
      const req = makeReq('/api/admin/email-config', 'PUT', { body: { resend_api_key: 'k' } });

      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/email-config', {
        db,
        logger,
      });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/admin/security-config', () => {
    it('returns exact rate limit values from APP_LIMITS', async () => {
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rate_limits).toEqual({
        chat_messages_per_minute: APP_LIMITS.maxChatSendPerMinute,
        login_attempts_per_10min: APP_LIMITS.maxLoginPerTenMinutes,
        registrations_per_10min: APP_LIMITS.maxRegisterPerTenMinutes,
        file_uploads_per_hour: APP_LIMITS.maxFileUploadPerHour,
      });
      expect(json.token_ttls).toEqual({
        access_token_seconds: APP_TTLS.accessTokenSeconds,
        refresh_token_seconds: APP_TTLS.refreshTokenSeconds,
        access_token_display: expect.any(String),
        refresh_token_display: expect.any(String),
      });
    });

    it('formats refresh token as days', async () => {
      mocks.appTtls.refreshTokenSeconds = 60 * 60 * 24 * 7;
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.refresh_token_display).toBe('7 days');
    });

    it('formats access token as minutes', async () => {
      mocks.appTtls.accessTokenSeconds = 60 * 15;
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.access_token_display).toBe('15 minutes');
    });

    it('formats exactly 86400 seconds as "1 day" (kills > and !== mutants)', async () => {
      mocks.appTtls.refreshTokenSeconds = 86400;
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.refresh_token_display).toBe('1 day');
    });

    it('formats exactly 3600 seconds as "1 hour" (kills > and !== mutants)', async () => {
      mocks.appTtls.accessTokenSeconds = 3600;
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.access_token_display).toBe('1 hour');
    });

    it('formats exactly 60 seconds as "1 minute" (kills !== mutant)', async () => {
      mocks.appTtls.accessTokenSeconds = 60;
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.access_token_display).toBe('1 minute');
    });

    it('formats exactly 172800 seconds as "2 days" (kills / and round mutants)', async () => {
      mocks.appTtls.refreshTokenSeconds = 172800;
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.refresh_token_display).toBe('2 days');
    });

    it('formats 129600 seconds as "2 days" (kills Math.floor mutant)', async () => {
      mocks.appTtls.refreshTokenSeconds = 129600; // 1.5 days
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.refresh_token_display).toBe('2 days');
    });

    it('formats 90000 seconds as "1 day" (kills Math.ceil mutant)', async () => {
      mocks.appTtls.refreshTokenSeconds = 90000; // ~1.04 days
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.refresh_token_display).toBe('1 day');
    });

    it('formats 3660 seconds as "1 hour" (kills Math.ceil mutant)', async () => {
      mocks.appTtls.accessTokenSeconds = 3660; // ~1.016 hours
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.access_token_display).toBe('1 hour');
    });

    it('formats 7200 seconds as "2 hours"', async () => {
      mocks.appTtls.accessTokenSeconds = 7200;
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.access_token_display).toBe('2 hours');
    });

    it('formats 91 seconds as "2 minutes" (kills Math.floor mutant)', async () => {
      mocks.appTtls.accessTokenSeconds = 91; // 1.516 min
      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      const json = await res.json();
      expect(json.token_ttls.access_token_display).toBe('2 minutes');
    });

    it('returns 500 when security config throws', async () => {
      // Force a throw by temporarily making APP_LIMITS access throw
      const original = mocks.appLimits.maxChatSendPerMinute;
      Object.defineProperty(mocks.appLimits, 'maxChatSendPerMinute', {
        get() {
          throw new Error('bad limits');
        },
        configurable: true,
      });

      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to fetch security config');
      expect(logger.error).toHaveBeenCalledWith(
        'Security config fetch failed',
        expect.objectContaining({ error: 'bad limits' })
      );

      Object.defineProperty(mocks.appLimits, 'maxChatSendPerMinute', {
        value: original,
        configurable: true,
      });
    });

    it('returns 500 when security config throws null (kills optional-chain mutant)', async () => {
      const original = mocks.appLimits.maxChatSendPerMinute;
      Object.defineProperty(mocks.appLimits, 'maxChatSendPerMinute', {
        get() {
          throw null;
        },
        configurable: true,
      });

      const req = makeReq('/api/admin/security-config');
      const res = await handleAdminEmailSecurity(req, {}, {}, user, '/api/admin/security-config', {
        db,
        logger,
      });
      expect(res.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith('Security config fetch failed', expect.any(Object));

      Object.defineProperty(mocks.appLimits, 'maxChatSendPerMinute', {
        value: original,
        configurable: true,
      });
    });
  });
});
