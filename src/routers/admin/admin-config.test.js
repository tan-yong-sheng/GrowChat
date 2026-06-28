import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTACHMENT_CAP_TYPES } from '../../chat/attachments.js';

const mocks = vi.hoisted(() => ({
  createDB: vi.fn(),
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  getAuditLog: vi.fn(),
  getConfigBool: vi.fn(),
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  ensureAdminAclAccess: vi.fn(),
  ensureAdminMutationAccess: vi.fn(),
  normalizeAttachmentCaps: vi.fn((caps) => caps || {}),
  normalizeModelId: vi.fn((id) => String(id || '').trim()),
}));

vi.mock('../../db.js', () => ({
  createDB: (...args) => mocks.createDB(...args),
}));

vi.mock('../../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
  getAuditLog: (...args) => mocks.getAuditLog(...args),
}));

vi.mock('../../utils/app-config.js', () => ({
  getConfigBool: (...args) => mocks.getConfigBool(...args),
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  normalizeAttachmentCaps: (...args) => mocks.normalizeAttachmentCaps(...args),
  normalizeModelId: (...args) => mocks.normalizeModelId(...args),
}));

vi.mock('./admin-helpers.js', () => ({
  ensureAdminAclAccess: (...args) => mocks.ensureAdminAclAccess(...args),
  ensureAdminMutationAccess: (...args) => mocks.ensureAdminMutationAccess(...args),
  isValidModelAccessId: vi.fn((id) => !!id && !/\s/.test(id) && id.length <= 200),
}));

import { handleAdminConfig } from './admin-config.js';

function makeReq(path, method, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  return new Request(`https://example.com${path}`, init);
}

describe('handleAdminConfig', () => {
  const user = { sub: 'admin-1' };
  const env = { DB: {} };
  const ctx = {};
  const db = { all: vi.fn(), run: vi.fn(), first: vi.fn(), batch: vi.fn(), prepare: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createDB.mockReturnValue(db);
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getConfigBool.mockResolvedValue(true);
    mocks.setConfigValue.mockResolvedValue(undefined);
    mocks.ensureAdminAclAccess.mockResolvedValue({ allow: true });
    mocks.ensureAdminMutationAccess.mockResolvedValue({ allow: true });
    mocks.normalizeModelId.mockImplementation((id) => String(id || '').trim());
    mocks.normalizeAttachmentCaps.mockImplementation((caps) => caps || {});
  });

  describe('GET /api/admin/audit-logs', () => {
    it('returns audit logs with mapped fields', async () => {
      mocks.getAuditLog.mockResolvedValue({
        entries: [
          { actor_id: 'u1', action: 'user_created', metadata: { key: 'val' }, created_at: 1 },
        ],
        total: 1,
      });
      const res = await handleAdminConfig(
        makeReq('/api/admin/audit-logs', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/audit-logs',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.logs[0].user_id).toBe('u1');
      expect(payload.logs[0].details).toEqual({ key: 'val' });
    });

    it('supports query params for filtering', async () => {
      mocks.getAuditLog.mockResolvedValue({ entries: [], total: 0 });
      const res = await handleAdminConfig(
        makeReq('/api/admin/audit-logs?userId=u1&action=login&limit=10&offset=5', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/audit-logs',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.getAuditLog).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          actor_id: 'u1',
          action: 'login',
          limit: 10,
          offset: 5,
        })
      );
    });

    it('returns 500 on error', async () => {
      mocks.getAuditLog.mockRejectedValue(new Error('DB fail'));
      const res = await handleAdminConfig(
        makeReq('/api/admin/audit-logs', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/audit-logs',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/admin/config', () => {
    it('returns config values', async () => {
      mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => {
        if (key === 'public_registration_status') return 'active';
        if (key === 'default_model_id') return 'gpt-4o';
        return fallback;
      });
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.public_registration).toBe(true);
      expect(payload.public_registration_status).toBe('active');
      expect(payload.default_model_id).toBe('gpt-4o');
    });

    it('defaults to pending when status is not active', async () => {
      mocks.getConfigValue.mockImplementation(async (_db, key, fallback) => fallback);
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      const payload = await res.json();
      expect(payload.public_registration_status).toBe('pending');
      expect(payload.default_model_id).toBeNull();
    });

    it('returns 500 on error', async () => {
      mocks.getConfigBool.mockRejectedValue(new Error('DB fail'));
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/config', () => {
    it('rejects unauthenticated users', async () => {
      mocks.ensureAdminMutationAccess.mockResolvedValue({ allow: false, reason: 'Forbidden' });
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { public_registration: true }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects empty body', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', {}),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid public_registration type', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { public_registration: 'yes' }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid registration_status', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { public_registration_status: 'invalid' }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects non-string registration_status', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { public_registration_status: 123 }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects invalid default_model_id with whitespace', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { default_model_id: 'has space' }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('rejects too long default_model_id', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { default_model_id: 'a'.repeat(201) }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('accepts null default_model_id', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { default_model_id: null }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.setConfigValue).toHaveBeenCalledWith(db, 'default_model_id', '');
    });

    it('accepts empty string default_model_id', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { default_model_id: '' }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
    });

    it('updates config and logs audit event', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', {
          public_registration: false,
          public_registration_status: 'active',
          default_model_id: 'gpt-4o',
        }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.public_registration).toBe(false);
      expect(payload.public_registration_status).toBe('active');
      expect(payload.default_model_id).toBe('gpt-4o');
      expect(mocks.setConfigValue).toHaveBeenCalledTimes(3);
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('returns 500 on setConfigValue failure', async () => {
      mocks.setConfigValue.mockRejectedValue(new Error('write fail'));
      const res = await handleAdminConfig(
        makeReq('/api/admin/config', 'PUT', { public_registration: false }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });

    it('rejects invalid JSON body', async () => {
      const res = await handleAdminConfig(
        new Request('https://example.com/api/admin/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: 'not-json',
        }),
        env,
        ctx,
        user,
        '/api/admin/config',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/model-attachment-caps', () => {
    it('returns caps and supported types', async () => {
      mocks.getConfigValue.mockResolvedValue(
        JSON.stringify({
          'gpt-4o': { attachments: { image: true, pdf: false }, updated_at: 123 },
        })
      );
      const res = await handleAdminConfig(
        makeReq('/api/admin/model-attachment-caps', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/model-attachment-caps',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.caps['gpt-4o'].attachments.image).toBe(true);
      expect(payload.supported_types).toEqual(ATTACHMENT_CAP_TYPES);
    });

    it('returns empty caps for invalid JSON', async () => {
      mocks.getConfigValue.mockResolvedValue('not-json');
      const res = await handleAdminConfig(
        makeReq('/api/admin/model-attachment-caps', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/model-attachment-caps',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.caps).toEqual({});
    });

    it('returns 500 on error', async () => {
      mocks.getConfigValue.mockRejectedValue(new Error('fail'));
      const res = await handleAdminConfig(
        makeReq('/api/admin/model-attachment-caps', 'GET'),
        env,
        ctx,
        user,
        '/api/admin/model-attachment-caps',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/admin/model-attachment-caps', () => {
    it('rejects ACL denied', async () => {
      mocks.ensureAdminAclAccess.mockResolvedValue({ allow: false, reason: 'no' });
      const res = await handleAdminConfig(
        makeReq('/api/admin/model-attachment-caps', 'PUT', {
          updates: [{ model_id: 'x', attachments: { image: true } }],
        }),
        env,
        ctx,
        user,
        '/api/admin/model-attachment-caps',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(403);
    });

    it('rejects empty updates', async () => {
      const res = await handleAdminConfig(
        makeReq('/api/admin/model-attachment-caps', 'PUT', {}),
        env,
        ctx,
        user,
        '/api/admin/model-attachment-caps',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(400);
    });

    it('applies incremental updates', async () => {
      mocks.getConfigValue.mockResolvedValue('{}');
      mocks.normalizeModelId.mockImplementation((id) => id);
      mocks.normalizeAttachmentCaps.mockImplementation((caps) => caps);
      const res = await handleAdminConfig(
        makeReq('/api/admin/model-attachment-caps', 'PUT', {
          updates: [{ model_id: 'gpt-4o', attachments: { image: true } }],
        }),
        env,
        ctx,
        user,
        '/api/admin/model-attachment-caps',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      expect(mocks.setConfigValue).toHaveBeenCalled();
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('replaces caps entirely when caps object provided', async () => {
      mocks.normalizeModelId.mockImplementation((id) => id);
      mocks.normalizeAttachmentCaps.mockImplementation((caps) => caps);
      const res = await handleAdminConfig(
        makeReq('/api/admin/model-attachment-caps', 'PUT', {
          caps: { 'gpt-4o': { attachments: { image: true } } },
        }),
        env,
        ctx,
        user,
        '/api/admin/model-attachment-caps',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.caps['gpt-4o']).toBeDefined();
      expect(mocks.logAuditEvent).toHaveBeenCalled();
    });

    it('handles remove entries', async () => {
      mocks.getConfigValue.mockResolvedValue(JSON.stringify({ 'old-model': { attachments: {} } }));
      mocks.normalizeModelId.mockImplementation((id) => id);
      const res = await handleAdminConfig(
        makeReq('/api/admin/model-attachment-caps', 'PUT', {
          remove: ['old-model'],
        }),
        env,
        ctx,
        user,
        '/api/admin/model-attachment-caps',
        { db, logger, _requestContext: {} }
      );
      expect(res.status).toBe(200);
      const payload = await res.json();
      expect(payload.caps['old-model']).toBeUndefined();
    });
  });

  it('returns null for unrecognized paths', async () => {
    const result = await handleAdminConfig(
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
