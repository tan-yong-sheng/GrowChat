/**
 * Tests for files.js — core logic paths, branches, conditions, error paths.
 * Coverage focus: route matching, auth, rate limits, upload, list, get, delete,
 * search, blob, status, content, and all mutation-sensitive branches.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    all: vi.fn(),
    first: vi.fn(),
    run: vi.fn(),
  },
  authorize: vi.fn(),
  logAuditEvent: vi.fn(),
  validateFile: vi.fn(),
  resolveContentType: vi.fn(),
  uploadFileToR2: vi.fn(),
  storeFileMetadata: vi.fn(),
  getFileMetadata: vi.fn(),
  listUserDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  extractDocumentText: vi.fn(),
  requireOwnedDocument: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
  checkRateLimit: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../services/uploads.js', () => ({
  validateFile: (...args) => mocks.validateFile(...args),
  resolveContentType: (...args) => mocks.resolveContentType(...args),
  uploadFileToR2: (...args) => mocks.uploadFileToR2(...args),
  storeFileMetadata: (...args) => mocks.storeFileMetadata(...args),
  getFileMetadata: (...args) => mocks.getFileMetadata(...args),
  listUserDocuments: (...args) => mocks.listUserDocuments(...args),
  deleteDocument: (...args) => mocks.deleteDocument(...args),
  requireOwnedDocument: (...args) => mocks.requireOwnedDocument(...args),
}));

vi.mock('../services/extraction.js', () => ({
  extractDocumentText: (...args) => mocks.extractDocumentText(...args),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: (...args) => mocks.createLogger(...args),
}));

vi.mock('../services/rate-limit.js', () => ({
  RATE_LIMITS: {
    fileUpload: { limit: 10, windowSeconds: 3600 },
    fileDownload: { limit: 100, windowSeconds: 3600 },
    fileList: { limit: 50, windowSeconds: 3600 },
    fileSearch: { limit: 100, windowSeconds: 3600 },
  },
  checkRateLimit: (...args) => mocks.checkRateLimit(...args),
}));

import { filesRouter } from './files.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(path, init = {}) {
  return new Request(`https://example.com${path}`, {
    method: 'GET',
    headers: new Headers(),
    ...init,
  });
}

function makeMultipartReq(path, formData) {
  return {
    url: `https://example.com${path}`,
    method: 'POST',
    headers: new Headers(),
    async formData() {
      return formData;
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('filesRouter', () => {
  const user = { sub: 'u1', role: 'member', email: 'u@example.com' };
  const env = { DB: {}, FILES: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true });
    mocks.db.all.mockResolvedValue([]);
    mocks.db.first.mockResolvedValue(null);
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.uploadFileToR2.mockResolvedValue({
      r2Key: 'r2-key',
      r2Url: 'https://r2.example.com/r2-key',
    });
    mocks.storeFileMetadata.mockResolvedValue('d1');
    mocks.deleteDocument.mockResolvedValue(true);
    mocks.listUserDocuments.mockResolvedValue([]);
    mocks.validateFile.mockReturnValue({ valid: true });
    mocks.resolveContentType.mockReturnValue('application/json');
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.createLogger.mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    });
    mocks.extractDocumentText.mockResolvedValue({ skipped: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Route matching ────────────────────────────────────────────────────────

  describe('route matching', () => {
    it('returns null for non-file paths', async () => {
      const res = await filesRouter(makeReq('/api/other'), env, {}, user, '/api/other');
      expect(res).toBeNull();
    });

    it('matches /api/files', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res).not.toBeNull();
    });

    it('matches /api/files/health', async () => {
      const mockFiles = { list: vi.fn().mockResolvedValue({ objects: [] }) };
      const res = await filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(200);
    });

    it('matches /api/files/upload', async () => {
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res).not.toBeNull();
    });

    it('matches /api/files/search', async () => {
      const res = await filesRouter(
        makeReq('/api/files/search'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res).not.toBeNull();
    });

    it('matches /api/files/:id', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({ doc: { id: 'd1' } });
      const res = await filesRouter(makeReq('/api/files/d1'), env, {}, user, '/api/files/d1');
      expect(res.status).toBe(200);
    });

    it('matches /api/files/:id/blob', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.txt', content_type: 'text/plain', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({ body: new ReadableStream(), httpMetadata: {} }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(200);
    });

    it('matches /api/files/:id/process/status', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.txt', extraction_status: 0, created_at: 1, updated_at: 1 },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      expect(res.status).toBe(200);
    });

    it('matches /api/files/:id/content', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          content_type: 'text/plain',
          text_excerpt: 'hi',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      expect(res.status).toBe(200);
    });
  });

  // ── Authentication ────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 when user is null', async () => {
      const res = await filesRouter(makeReq('/api/files'), env, {}, null, '/api/files');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when user is undefined', async () => {
      const res = await filesRouter(makeReq('/api/files'), env, {}, undefined, '/api/files');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });
  });

  // ── Logger ────────────────────────────────────────────────────────────────

  describe('logger', () => {
    it('uses provided requestContext.logger without calling createLogger', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files', {
        logger: customLogger,
      });
      expect(mocks.createLogger).not.toHaveBeenCalled();
    });

    it('calls createLogger when requestContext.logger is not provided', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files', {});
      expect(mocks.createLogger).toHaveBeenCalledWith(env, { requestId: undefined });
    });

    it('passes requestId to createLogger', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files', {
        requestId: 'req-123',
      });
      expect(mocks.createLogger).toHaveBeenCalledWith(env, { requestId: 'req-123' });
    });
  });

  // ── GET /api/files/health ─────────────────────────────────────────────────

  describe('GET /api/files/health', () => {
    it('returns 500 when FILES binding is missing', async () => {
      const res = await filesRouter(
        makeReq('/api/files/health'),
        {},
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
    });

    it('handles null rejection in health check gracefully', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const mockFiles = { list: vi.fn().mockRejectedValue(null) };
      const res = await filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health',
        { logger: customLogger }
      );
      expect(res.status).toBe(503);
      expect(customLogger.error).not.toHaveBeenCalled();
    });

    it('returns 200 when R2 is reachable', async () => {
      const mockFiles = { list: vi.fn().mockResolvedValue({ objects: [] }) };
      const res = await filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(mockFiles.list).toHaveBeenCalledWith({ limit: 1 });
    });

    it('returns 503 when R2 list throws', async () => {
      const mockFiles = { list: vi.fn().mockRejectedValue(new Error('connection refused')) };
      const res = await filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(503);
    });

    it('returns 503 with fallback message when error has no message', async () => {
      const mockFiles = { list: vi.fn().mockRejectedValue({}) };
      const res = await filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(503);
    });

    it('returns 503 when R2 health check times out', async () => {
      vi.useFakeTimers();
      const mockFiles = { list: vi.fn().mockReturnValue(new Promise(() => {})) };
      const promise = filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      vi.advanceTimersByTime(3100);
      const res = await promise;
      expect(res.status).toBe(503);
    });
  });

  // ── GET /api/files ────────────────────────────────────────────────────────

  describe('GET /api/files', () => {
    it('returns 200 with documents', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([{ id: 'd1', filename: 'a.txt' }]);
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documents).toHaveLength(1);
    });

    it('uses default limit of 20', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(mocks.listUserDocuments).toHaveBeenCalledWith(expect.anything(), 'u1', 20, 0);
    });

    it('uses default offset of 0', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(mocks.listUserDocuments).toHaveBeenCalledWith(
        expect.anything(),
        'u1',
        expect.any(Number),
        0
      );
    });

    it('parses limit and offset from query params', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files?limit=10&offset=5'), env, {}, user, '/api/files');
      expect(mocks.listUserDocuments).toHaveBeenCalledWith(expect.anything(), 'u1', 10, 5);
    });

    it('caps limit at 100', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files?limit=200'), env, {}, user, '/api/files');
      expect(mocks.listUserDocuments).toHaveBeenCalledWith(expect.anything(), 'u1', 100, 0);
    });

    it('returns 429 when list rate limit exceeded', async () => {
      const resetAt = Date.now() + 45_000;
      mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, resetAt });
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe('Too many file lists');
      expect(body.details.retry_after).toBeGreaterThanOrEqual(44);
      expect(body.details.retry_after).toBeLessThanOrEqual(45);
      expect(mocks.listUserDocuments).not.toHaveBeenCalled();
    });

    it('calls checkRateLimit with correct list params', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(mocks.checkRateLimit).toHaveBeenCalledWith(env, {
        action: 'file-list',
        subject: 'u1',
        limit: 50,
        windowSeconds: 3600,
      });
    });

    it('returns empty list when documents table is missing', async () => {
      mocks.listUserDocuments.mockRejectedValueOnce(new Error('no such table: documents'));
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documents).toEqual([]);
    });

    it('handles null rejection in list gracefully for isMissingDocumentsTable', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.listUserDocuments.mockRejectedValueOnce(null);
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files', {
        logger: customLogger,
      });
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('File list failed', { error: null });
    });

    it('returns 500 on unexpected list error', async () => {
      mocks.listUserDocuments.mockRejectedValueOnce(new Error('sqlite error'));
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res.status).toBe(500);
    });

    it('returns 500 when error has no message', async () => {
      mocks.listUserDocuments.mockRejectedValueOnce({});
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res.status).toBe(500);
    });

    it('catches case-insensitive missing table error', async () => {
      mocks.listUserDocuments.mockRejectedValueOnce(new Error('NO SUCH TABLE: documents'));
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documents).toEqual([]);
    });

    it('catches missing table error with extra whitespace', async () => {
      mocks.listUserDocuments.mockRejectedValueOnce(new Error('no such table:  documents'));
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documents).toEqual([]);
    });
  });

  // ── POST /api/files/upload ────────────────────────────────────────────────

  describe('POST /api/files/upload', () => {
    it('returns 403 when file.upload authorization denied with reason', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: false, reason: 'no_upload' });
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('no_upload');
    });

    it('returns 403 with default message when authorization reason is missing', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: false });
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Forbidden');
    });

    it('returns 429 when rate limit exceeded', async () => {
      mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, resetAt: Date.now() + 60_000 });
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.details.retry_after).toBeGreaterThanOrEqual(0);
    });

    it('returns 400 when file field is missing', async () => {
      const formData = new FormData();
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/file field required/i);
    });

    it('returns 400 when file validation fails', async () => {
      mocks.validateFile.mockReturnValueOnce({ valid: false, error: 'File too large' });
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('File too large');
    });

    it('returns 201 on successful upload with JSON file', async () => {
      const formData = new FormData();
      formData.append(
        'file',
        new File(['{"ok":true}'], 'sample.json', { type: 'application/json' })
      );
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('d1');
      expect(body.filename).toBe('sample.json');
      expect(body.extraction_status).toBe(0);
    });

    it('skips extraction for JSON files and logs', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      expect(mocks.extractDocumentText).not.toHaveBeenCalled();
      expect(customLogger.info).toHaveBeenCalledWith('Document extraction skipped for JSON file', {
        documentId: 'd1',
      });
    });

    it('triggers async extraction for non-JSON files', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const waitUntilCalls = [];
      const ctx = { waitUntil: vi.fn((p) => waitUntilCalls.push(p)) };
      const formData = new FormData();
      formData.append('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        ctx,
        user,
        '/api/files/upload'
      );
      expect(ctx.waitUntil).toHaveBeenCalled();
      expect(mocks.extractDocumentText).toHaveBeenCalled();
      await waitUntilCalls[0];
    });

    it('logs extraction skipped when extract returns skipped=true', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const waitUntilCalls = [];
      const ctx = { waitUntil: vi.fn((p) => waitUntilCalls.push(p)) };
      const formData = new FormData();
      formData.append('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));
      mocks.extractDocumentText.mockResolvedValueOnce({
        skipped: true,
        reason: 'unsupported type',
      });
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        ctx,
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      await waitUntilCalls[0];
      expect(customLogger.info).toHaveBeenCalledWith(
        'Document extraction skipped',
        expect.objectContaining({ documentId: 'd1', reason: 'unsupported type' })
      );
    });

    it('logs extraction complete on success', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const waitUntilCalls = [];
      const ctx = { waitUntil: vi.fn((p) => waitUntilCalls.push(p)) };
      const formData = new FormData();
      formData.append('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));
      mocks.extractDocumentText.mockResolvedValueOnce({ skipped: false });
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        ctx,
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      await waitUntilCalls[0];
      expect(customLogger.info).toHaveBeenCalledWith('Document extraction complete', {
        documentId: 'd1',
      });
    });

    it('logs extraction error on failure', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const waitUntilCalls = [];
      const ctx = { waitUntil: vi.fn((p) => waitUntilCalls.push(p)) };
      const formData = new FormData();
      formData.append('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));
      mocks.extractDocumentText.mockRejectedValueOnce(new Error('parse failed'));
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        ctx,
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      await waitUntilCalls[0];
      expect(customLogger.error).toHaveBeenCalledWith(
        'Failed to process document extraction',
        expect.objectContaining({ documentId: 'd1' })
      );
    });

    it('handles null extractResult in waitUntil for optional chaining', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const waitUntilCalls = [];
      const ctx = { waitUntil: vi.fn((p) => waitUntilCalls.push(p)) };
      const formData = new FormData();
      formData.append('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));
      mocks.extractDocumentText.mockResolvedValueOnce(null);
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        ctx,
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      await waitUntilCalls[0];
      expect(customLogger.info).toHaveBeenCalledWith('Document extraction complete', {
        documentId: 'd1',
      });
      expect(customLogger.error).not.toHaveBeenCalled();
    });

    it('handles null extraction rejection in waitUntil for optional chaining', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const waitUntilCalls = [];
      const ctx = { waitUntil: vi.fn((p) => waitUntilCalls.push(p)) };
      const formData = new FormData();
      formData.append('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));
      mocks.extractDocumentText.mockRejectedValueOnce(null);
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        ctx,
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      await waitUntilCalls[0];
      expect(customLogger.error).toHaveBeenCalledWith('Failed to process document extraction', {
        documentId: 'd1',
        error: null,
      });
    });

    it('uses default reason when extraction skip has no reason', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const waitUntilCalls = [];
      const ctx = { waitUntil: vi.fn((p) => waitUntilCalls.push(p)) };
      const formData = new FormData();
      formData.append('file', new File(['hello'], 'test.txt', { type: 'text/plain' }));
      mocks.extractDocumentText.mockResolvedValueOnce({ skipped: true });
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        ctx,
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      await waitUntilCalls[0];
      expect(customLogger.info).toHaveBeenCalledWith(
        'Document extraction skipped',
        expect.objectContaining({ reason: 'unsupported type' })
      );
    });

    it('returns 504 on R2 upload timeout', async () => {
      mocks.uploadFileToR2.mockRejectedValueOnce(new Error('R2 upload timed out'));
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(504);
    });

    it('returns 500 on general upload failure', async () => {
      mocks.uploadFileToR2.mockRejectedValueOnce(new Error('network error'));
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(500);
    });

    it('returns 500 when upload error has no message', async () => {
      mocks.uploadFileToR2.mockRejectedValueOnce({});
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(500);
    });

    it('includes chat_id in metadata when provided', async () => {
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      formData.append('chat_id', 'chat-1');
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.storeFileMetadata).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ chatId: 'chat-1' })
      );
    });

    it('passes null chat_id when not provided', async () => {
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.storeFileMetadata).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ chatId: null })
      );
    });

    it('logs audit event on successful upload', async () => {
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'file_uploaded',
          resource_type: 'file',
          resource_id: 'd1',
        })
      );
    });

    it('sets created_at as unix timestamp', async () => {
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const before = Math.floor(Date.now() / 1000);
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      const after = Math.floor(Date.now() / 1000);
      const body = await res.json();
      expect(body.created_at).toBeGreaterThanOrEqual(before);
      expect(body.created_at).toBeLessThanOrEqual(after);
    });
  });

  // ── GET /api/files/:id ────────────────────────────────────────────────────

  describe('GET /api/files/:id', () => {
    it('returns document metadata', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.txt', content_type: 'text/plain', user_id: 'u1' },
      });
      const res = await filesRouter(makeReq('/api/files/d1'), env, {}, user, '/api/files/d1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.filename).toBe('a.txt');
    });

    it('does not treat /api/files/search as a document ID', async () => {
      const res = await filesRouter(
        makeReq('/api/files/search'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documents).toBeDefined();
    });

    it('returns error from requireOwnedDocument', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        error: new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
      });
      const res = await filesRouter(makeReq('/api/files/d99'), env, {}, user, '/api/files/d99');
      expect(res.status).toBe(404);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.requireOwnedDocument.mockRejectedValueOnce(new Error('db fail'));
      const res = await filesRouter(makeReq('/api/files/d1'), env, {}, user, '/api/files/d1');
      expect(res.status).toBe(500);
    });

    it('returns 500 when error has no message', async () => {
      mocks.requireOwnedDocument.mockRejectedValueOnce({});
      const res = await filesRouter(makeReq('/api/files/d1'), env, {}, user, '/api/files/d1');
      expect(res.status).toBe(500);
    });
  });

  // ── DELETE /api/files/:id ─────────────────────────────────────────────────

  describe('DELETE /api/files/:id', () => {
    it('returns 403 when file.delete authorization denied with reason', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: false, reason: 'no_delete' });
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('no_delete');
    });

    it('returns 403 with default message when authorization reason is missing', async () => {
      mocks.authorize.mockResolvedValueOnce({ allow: false });
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Forbidden');
    });

    it('returns 200 on successful delete', async () => {
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 when document not found', async () => {
      mocks.deleteDocument.mockRejectedValueOnce(new Error('Document not found'));
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(res.status).toBe(404);
    });

    it('returns 500 on unexpected delete error', async () => {
      mocks.deleteDocument.mockRejectedValueOnce(new Error('db error'));
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(res.status).toBe(500);
    });

    it('returns 500 when delete error has no message', async () => {
      mocks.deleteDocument.mockRejectedValueOnce({});
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(res.status).toBe(500);
    });

    it('logs audit event on successful delete', async () => {
      await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'file_deleted',
          resource_type: 'file',
          resource_id: 'd1',
        })
      );
    });
  });

  // ── GET /api/files/search ─────────────────────────────────────────────────

  describe('GET /api/files/search', () => {
    it('returns 200 with empty results for no query', async () => {
      const res = await filesRouter(
        makeReq('/api/files/search'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documents).toEqual([]);
      expect(body.query).toBe('');
    });

    it('returns 200 with empty results for empty query', async () => {
      const res = await filesRouter(
        makeReq('/api/files/search?q='),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.query).toBe('');
    });

    it('trims search query', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      const res = await filesRouter(
        makeReq('/api/files/search?q=%20hello%20'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const body = await res.json();
      expect(body.query).toBe('hello');
    });

    it('returns 400 when query exceeds 200 characters', async () => {
      const longQuery = 'a'.repeat(201);
      const res = await filesRouter(
        makeReq(`/api/files/search?q=${longQuery}`),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(400);
    });

    it('returns 429 when search rate limit exceeded', async () => {
      const resetAt = Date.now() + 45_000;
      mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, resetAt });
      const res = await filesRouter(
        makeReq('/api/files/search?q=report'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe('Too many file searches');
      expect(body.details.retry_after).toBeGreaterThanOrEqual(44);
      expect(body.details.retry_after).toBeLessThanOrEqual(45);
      expect(mocks.db.all).not.toHaveBeenCalled();
    });

    it('calls checkRateLimit with correct search params', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files/search?q=test'), env, {}, user, '/api/files/search');
      expect(mocks.checkRateLimit).toHaveBeenCalledWith(env, {
        action: 'file-search',
        subject: 'u1',
        limit: 100,
        windowSeconds: 3600,
      });
    });

    it('returns documents matching query', async () => {
      mocks.db.all.mockResolvedValueOnce([{ id: 'd1', filename: 'report.txt' }]);
      const res = await filesRouter(
        makeReq('/api/files/search?q=report'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documents).toHaveLength(1);
      expect(body.query).toBe('report');
    });

    it('uses default limit of 20', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files/search?q=test'), env, {}, user, '/api/files/search');
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[2]).toBe(20);
    });

    it('uses default offset of 0', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files/search?q=test'), env, {}, user, '/api/files/search');
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[3]).toBe(0);
    });

    it('enforces minimum limit of 1', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(
        makeReq('/api/files/search?q=test&limit=0'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[2]).toBe(1);
    });

    it('enforces maximum limit of 100', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(
        makeReq('/api/files/search?q=test&limit=999'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[2]).toBe(100);
    });

    it('clamps negative offset to 0', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(
        makeReq('/api/files/search?q=test&offset=-5'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[3]).toBe(0);
    });

    it('parses positive offset', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(
        makeReq('/api/files/search?q=test&offset=10'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[3]).toBe(10);
    });

    it('returns empty results when documents table is missing', async () => {
      mocks.db.all.mockRejectedValueOnce(new Error('no such table: documents'));
      const res = await filesRouter(
        makeReq('/api/files/search?q=test'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documents).toEqual([]);
    });

    it('returns 500 on unexpected search error', async () => {
      mocks.db.all.mockRejectedValueOnce(new Error('db fail'));
      const res = await filesRouter(
        makeReq('/api/files/search?q=test'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(500);
    });

    it('returns 500 when search error has no message', async () => {
      mocks.db.all.mockRejectedValueOnce({});
      const res = await filesRouter(
        makeReq('/api/files/search?q=test'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(500);
    });

    it('uses case-insensitive LIKE pattern', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files/search?q=TeSt'), env, {}, user, '/api/files/search');
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[1]).toBe('%TeSt%');
    });
  });

  // ── GET /api/files/:id/blob ───────────────────────────────────────────────

  describe('GET /api/files/:id/blob', () => {
    it('returns 429 when download rate limit exceeded', async () => {
      const resetAt = Date.now() + 45_000;
      mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, resetAt });
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        env,
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe('Too many file downloads');
      expect(body.details.retry_after).toBeGreaterThanOrEqual(44);
      expect(body.details.retry_after).toBeLessThanOrEqual(45);
    });

    it('calls checkRateLimit with correct download params for blob', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.txt', content_type: 'text/plain', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({
          body: new ReadableStream(),
          httpMetadata: {},
        }),
      };
      await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(mocks.checkRateLimit).toHaveBeenCalledWith(
        { FILES: mockFiles },
        {
          action: 'file-download',
          subject: 'u1',
          limit: 100,
          windowSeconds: 3600,
        }
      );
    });

    it('returns 500 when FILES binding is missing', async () => {
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        {},
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(500);
    });

    it('returns 404 when R2 object is missing', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', r2_key: 'k1' },
      });
      const mockFiles = { get: vi.fn().mockResolvedValue(null) };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(404);
    });

    it('returns 404 when R2 object has no body', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', r2_key: 'k1' },
      });
      const mockFiles = { get: vi.fn().mockResolvedValue({ body: null }) };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(404);
    });

    it('returns 200 with correct headers', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.txt', content_type: 'text/plain', r2_key: 'k1' },
      });
      const stream = new ReadableStream();
      const mockFiles = {
        get: vi.fn().mockResolvedValue({
          body: stream,
          httpMetadata: { contentType: 'text/plain' },
        }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/plain');
      expect(res.headers.get('Content-Disposition')).toContain('a.txt');
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600');
    });

    it('uses default filename when doc.filename is missing', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', content_type: 'text/plain', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({ body: new ReadableStream(), httpMetadata: {} }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.headers.get('Content-Disposition')).toContain('file');
    });

    it('sanitizes quotes in filename', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'fi"le.txt', content_type: 'text/plain', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({ body: new ReadableStream(), httpMetadata: {} }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      const header = res.headers.get('Content-Disposition');
      expect(header).not.toContain('"fi"le"');
      expect(header).toContain('fi_le.txt');
    });

    it('sanitizes backslashes in filename', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'fi\\le.txt', content_type: 'text/plain', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({ body: new ReadableStream(), httpMetadata: {} }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.headers.get('Content-Disposition')).toContain('fi_le.txt');
    });

    it('falls back to object content type when doc content type is missing', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.bin', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({
          body: new ReadableStream(),
          httpMetadata: { contentType: 'application/octet-stream' },
        }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('falls back to application/octet-stream when both content types are missing', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.bin', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({ body: new ReadableStream(), httpMetadata: {} }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('returns 500 on unexpected error', async () => {
      mocks.requireOwnedDocument.mockRejectedValueOnce(new Error('db fail'));
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        env,
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(500);
    });

    it('returns 500 when blob error has no message', async () => {
      mocks.requireOwnedDocument.mockRejectedValueOnce({});
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        env,
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(500);
    });
  });

  // ── GET /api/files/:id/process/status ─────────────────────────────────────

  describe('GET /api/files/:id/process/status', () => {
    it('returns pending for extraction_status 0', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          extraction_status: 0,
          created_at: 1,
          updated_at: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.extraction.status).toBe('pending');
    });

    it('returns done for extraction_status 1', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          extraction_status: 1,
          created_at: 1,
          updated_at: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      const body = await res.json();
      expect(body.extraction.status).toBe('done');
    });

    it('returns failed for extraction_status -1', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          extraction_status: -1,
          extraction_error: 'bad encoding',
          created_at: 1,
          updated_at: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      const body = await res.json();
      expect(body.extraction.status).toBe('failed');
      expect(body.extraction.error).toBe('bad encoding');
    });

    it('returns null error when extraction_error is missing', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          extraction_status: -1,
          created_at: 1,
          updated_at: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      const body = await res.json();
      expect(body.extraction.error).toBeNull();
    });

    it('returns 500 on unexpected error', async () => {
      mocks.requireOwnedDocument.mockRejectedValueOnce(new Error('db fail'));
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      expect(res.status).toBe(500);
    });

    it('returns 500 when status error has no message', async () => {
      mocks.requireOwnedDocument.mockRejectedValueOnce({});
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      expect(res.status).toBe(500);
    });
  });

  // ── GET /api/files/:id/content ────────────────────────────────────────────

  describe('GET /api/files/:id/content', () => {
    it('returns parsed JSON content', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'data.json',
          content_type: 'application/json',
          text_excerpt: '{"key":"val"}',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.content).toEqual({ key: 'val' });
      expect(body.extracted).toBe(true);
    });

    it('returns empty JSON object when text_excerpt is missing for JSON', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'data.json',
          content_type: 'application/json',
          text_excerpt: null,
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content).toEqual({});
    });

    it('returns parse error for malformed JSON', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'bad.json',
          content_type: 'application/json',
          text_excerpt: '{bad}',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content.error).toMatch(/parse/i);
    });

    it('returns plain text content for text/plain', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          content_type: 'text/plain',
          text_excerpt: 'hello',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content).toBe('hello');
    });

    it('returns fallback text when text_excerpt is missing for text file', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          content_type: 'text/plain',
          text_excerpt: null,
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content).toBe('[No text content extracted]');
    });

    it('returns text content for text/html', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.html',
          content_type: 'text/html',
          text_excerpt: '<p>hi</p>',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content).toBe('<p>hi</p>');
    });

    it('returns binary metadata for image/png', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'img.png',
          content_type: 'image/png',
          text_excerpt: null,
          extraction_status: 0,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content.filename).toBe('img.png');
      expect(body.content.type).toBe('image/png');
      expect(body.content.status).toBe('pending');
      expect(body.content.note).toMatch(/Binary file/i);
    });

    it('returns extracted status for binary when extraction_status is 1', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'img.png',
          content_type: 'image/png',
          text_excerpt: null,
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content.status).toBe('extracted');
      expect(body.extracted).toBe(true);
    });

    it('returns 500 on unexpected error', async () => {
      mocks.requireOwnedDocument.mockRejectedValueOnce(new Error('db fail'));
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      expect(res.status).toBe(500);
    });

    it('returns 500 when content error has no message', async () => {
      mocks.requireOwnedDocument.mockRejectedValueOnce({});
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      expect(res.status).toBe(500);
    });
  });

  // ── Mutation coverage: POST /api/files/upload deep assertions ───────────

  describe('POST /api/files/upload mutation coverage', () => {
    it('returns exact response body on successful upload', async () => {
      mocks.storeFileMetadata.mockResolvedValueOnce('doc-123');
      mocks.uploadFileToR2.mockResolvedValueOnce({
        r2Key: 'key-1',
        r2Url: 'https://r2.example.com/key-1',
      });
      const formData = new FormData();
      formData.append('file', new File(['{"a":1}'], 'data.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({
        id: 'doc-123',
        filename: 'data.json',
        content_type: 'application/json',
        file_size: 7,
        r2_key: 'key-1',
        r2_url: 'https://r2.example.com/key-1',
        extraction_status: 0,
      });
      expect(typeof body.created_at).toBe('number');
    });

    it('calls resolveContentType with filename and file.type', async () => {
      const formData = new FormData();
      const file = new File(['x'], 'test.txt', { type: 'text/plain' });
      formData.append('file', file);
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.resolveContentType).toHaveBeenCalledWith('test.txt', 'text/plain');
    });

    it('calls validateFile with correct args', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const formData = new FormData();
      const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });
      formData.append('file', file);
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.validateFile).toHaveBeenCalledWith('test.txt', 'text/plain', 11);
    });

    it('calls uploadFileToR2 with correct args', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const formData = new FormData();
      const file = new File(['abc'], 'test.txt', { type: 'text/plain' });
      formData.append('file', file);
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.uploadFileToR2).toHaveBeenCalledWith(
        env,
        'u1',
        'test.txt',
        'text/plain',
        expect.any(ArrayBuffer)
      );
    });

    it('calls storeFileMetadata with correct metadata object', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      mocks.uploadFileToR2.mockResolvedValueOnce({
        r2Key: 'key-2',
        r2Url: 'https://r2.example.com/key-2',
      });
      const formData = new FormData();
      formData.append('file', new File(['x'], 'test.txt', { type: 'text/plain' }));
      formData.append('chat_id', 'chat-99');
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.storeFileMetadata).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'u1',
          chatId: 'chat-99',
          filename: 'test.txt',
          contentType: 'text/plain',
          fileSize: 1,
          r2Key: 'key-2',
          r2Url: 'https://r2.example.com/key-2',
        })
      );
    });

    it('calls logAuditEvent with exact metadata on upload', async () => {
      mocks.resolveContentType.mockReturnValueOnce('text/plain');
      const formData = new FormData();
      formData.append('file', new File(['xyz'], 'test.txt', { type: 'text/plain' }));
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actor_id: 'u1',
          action: 'file_uploaded',
          resource_type: 'file',
          resource_id: 'd1',
          metadata: { filename: 'test.txt', contentType: 'text/plain', fileSize: 3 },
        })
      );
    });

    it('returns 500 when req.formData throws', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const req = {
        url: 'https://example.com/api/files/upload',
        method: 'POST',
        headers: new Headers(),
        async formData() {
          throw new Error('multipart parse error');
        },
      };
      const res = await filesRouter(req, env, {}, user, '/api/files/upload', {
        logger: customLogger,
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('File upload failed', {
        error: 'multipart parse error',
      });
    });

    it('returns 500 when file.arrayBuffer throws', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const formData = new FormData();
      const badFile = new File(['x'], 'bad.txt', { type: 'text/plain' });
      badFile.arrayBuffer = async () => {
        throw new Error('read error');
      };
      formData.append('file', badFile);
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('File upload failed', {
        error: 'read error',
      });
    });

    it('returns 504 when upload times out', async () => {
      mocks.uploadFileToR2.mockRejectedValueOnce(new Error('R2 upload timed out'));
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      expect(res.status).toBe(504);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('File upload failed', {
        error: 'R2 upload timed out',
      });
    });

    it('logs correct error when upload fails with plain object', async () => {
      mocks.uploadFileToR2.mockRejectedValueOnce({ message: 'network down' });
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('File upload failed', {
        error: 'network down',
      });
    });

    it('logs correct error when upload fails with object lacking message', async () => {
      mocks.uploadFileToR2.mockRejectedValueOnce(null);
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('File upload failed', { error: null });
    });

    it('calls authorize with correct upload action', async () => {
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.authorize).toHaveBeenCalledWith(env, user, {
        action: 'file.upload',
        resource: 'file',
      });
    });

    it('calls checkRateLimit with correct params', async () => {
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(mocks.checkRateLimit).toHaveBeenCalledWith(env, {
        action: 'file-upload',
        subject: 'u1',
        limit: 10,
        windowSeconds: 3600,
      });
    });

    it('returns exact 429 body with retry_after', async () => {
      const resetAt = Date.now() + 45_000;
      mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, resetAt });
      const formData = new FormData();
      formData.append('file', new File(['{}'], 'x.json', { type: 'application/json' }));
      const res = await filesRouter(
        makeMultipartReq('/api/files/upload', formData),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe('Too many file uploads');
      expect(body.details.retry_after).toBeGreaterThanOrEqual(44);
      expect(body.details.retry_after).toBeLessThanOrEqual(45);
    });
  });

  // ── Mutation coverage: GET /api/files deep assertions ─────────────────────

  describe('GET /api/files mutation coverage', () => {
    it('returns exact response body', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([
        { id: 'd1', filename: 'a.txt' },
        { id: 'd2', filename: 'b.txt' },
      ]);
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        documents: [
          { id: 'd1', filename: 'a.txt' },
          { id: 'd2', filename: 'b.txt' },
        ],
      });
    });

    it('handles NaN limit by passing NaN to listUserDocuments', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files?limit=abc'), env, {}, user, '/api/files');
      const [, , limitArg] = mocks.listUserDocuments.mock.calls[0];
      expect(Number.isNaN(limitArg)).toBe(true);
    });

    it('handles NaN offset by passing NaN to listUserDocuments', async () => {
      mocks.listUserDocuments.mockResolvedValueOnce([]);
      await filesRouter(makeReq('/api/files?offset=abc'), env, {}, user, '/api/files');
      const [, , , offsetArg] = mocks.listUserDocuments.mock.calls[0];
      expect(Number.isNaN(offsetArg)).toBe(true);
    });

    it('logs exact error message on list failure', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.listUserDocuments.mockRejectedValueOnce(new Error('disk full'));
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files', {
        logger: customLogger,
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('File list failed', {
        error: 'disk full',
      });
    });

    it('logs object error on list failure without message', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.listUserDocuments.mockRejectedValueOnce(null);
      const res = await filesRouter(makeReq('/api/files'), env, {}, user, '/api/files', {
        logger: customLogger,
      });
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('File list failed', { error: null });
    });
  });

  // ── Mutation coverage: GET /api/files/:id deep assertions ─────────────────

  describe('GET /api/files/:id mutation coverage', () => {
    it('returns exact document response body', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.txt', content_type: 'text/plain', user_id: 'u1' },
      });
      const res = await filesRouter(makeReq('/api/files/d1'), env, {}, user, '/api/files/d1');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'a.txt',
        content_type: 'text/plain',
        user_id: 'u1',
      });
    });

    it('logs exact error when get document fails', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.requireOwnedDocument.mockRejectedValueOnce(new Error('timeout'));
      const res = await filesRouter(makeReq('/api/files/d1'), env, {}, user, '/api/files/d1', {
        logger: customLogger,
      });
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('Get document failed', { error: 'timeout' });
    });

    it('logs object error when get document fails without message', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.requireOwnedDocument.mockRejectedValueOnce(null);
      const res = await filesRouter(makeReq('/api/files/d1'), env, {}, user, '/api/files/d1', {
        logger: customLogger,
      });
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('Get document failed', { error: null });
    });
  });

  // ── Mutation coverage: DELETE /api/files/:id deep assertions ──────────────

  describe('DELETE /api/files/:id mutation coverage', () => {
    it('returns exact success body', async () => {
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });
    });

    it('calls authorize with exact delete action', async () => {
      await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(mocks.authorize).toHaveBeenCalledWith(env, user, {
        action: 'file.delete',
        resource: 'file',
        resourceId: 'd1',
      });
    });

    it('calls deleteDocument with correct args', async () => {
      await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(mocks.deleteDocument).toHaveBeenCalledWith(env, expect.anything(), 'd1', 'u1');
    });

    it('logs audit event with exact delete metadata', async () => {
      await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actor_id: 'u1',
          action: 'file_deleted',
          resource_type: 'file',
          resource_id: 'd1',
        })
      );
    });

    it('logs exact error on unexpected delete failure', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.deleteDocument.mockRejectedValueOnce(new Error('FK violation'));
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('Delete document failed', {
        error: 'FK violation',
      });
    });

    it('logs object error on delete failure without message', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.deleteDocument.mockRejectedValueOnce({});
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('Delete document failed', { error: {} });
    });

    it('returns exact 404 body on document not found', async () => {
      mocks.deleteDocument.mockRejectedValueOnce(new Error('Document not found'));
      const res = await filesRouter(
        new Request('https://example.com/api/files/d1', { method: 'DELETE' }),
        env,
        {},
        user,
        '/api/files/d1'
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not found');
    });
  });

  // ── Mutation coverage: GET /api/files/search deep assertions ──────────────

  describe('GET /api/files/search mutation coverage', () => {
    it('returns exact response body with results', async () => {
      mocks.db.all.mockResolvedValueOnce([{ id: 'd1', filename: 'report.pdf' }]);
      const res = await filesRouter(
        makeReq('/api/files/search?q=report'),
        env,
        {},
        user,
        '/api/files/search'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        documents: [{ id: 'd1', filename: 'report.pdf' }],
        query: 'report',
        limit: 20,
        offset: 0,
      });
    });

    it('returns exact empty response body', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      const res = await filesRouter(
        makeReq('/api/files/search?q=xyz'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const body = await res.json();
      expect(body).toMatchObject({
        documents: [],
        query: 'xyz',
        limit: 20,
        offset: 0,
      });
    });

    it('handles NaN limit by clamping to 1', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(
        makeReq('/api/files/search?q=test&limit=abc'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[2]).toBeNaN(); // Math.max(NaN, 1) = NaN
    });

    it('handles NaN offset by clamping to 0', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(
        makeReq('/api/files/search?q=test&offset=abc'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const [, params] = mocks.db.all.mock.calls[0];
      expect(params[3]).toBeNaN(); // Math.max(NaN, 0) = NaN
    });

    it('logs exact error on search failure', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.db.all.mockRejectedValueOnce(new Error('query timeout'));
      const res = await filesRouter(
        makeReq('/api/files/search?q=test'),
        env,
        {},
        user,
        '/api/files/search',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('Document search failed', {
        error: 'query timeout',
      });
    });

    it('logs object error on search failure without message', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.db.all.mockRejectedValueOnce(null);
      const res = await filesRouter(
        makeReq('/api/files/search?q=test'),
        env,
        {},
        user,
        '/api/files/search',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('Document search failed', { error: null });
    });

    it('passes exact SQL params to db.all', async () => {
      mocks.db.all.mockResolvedValueOnce([]);
      await filesRouter(
        makeReq('/api/files/search?q=hello&limit=5&offset=10'),
        env,
        {},
        user,
        '/api/files/search'
      );
      const [sql, params] = mocks.db.all.mock.calls[0];
      expect(sql).toContain('SELECT');
      expect(sql).toContain('FROM documents');
      expect(params).toEqual(['u1', '%hello%', 5, 10]);
    });
  });

  // ── Mutation coverage: GET /api/files/:id/blob deep assertions ────────────

  describe('GET /api/files/:id/blob mutation coverage', () => {
    it('sets exact Content-Disposition header', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'report.pdf', content_type: 'application/pdf', r2_key: 'k1' },
      });
      const stream = new ReadableStream();
      const mockFiles = {
        get: vi.fn().mockResolvedValue({
          body: stream,
          httpMetadata: { contentType: 'application/pdf' },
        }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Disposition')).toBe('inline; filename="report.pdf"');
    });

    it('calls env.FILES.get with r2_key', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'a.txt', content_type: 'text/plain', r2_key: 'k2' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({
          body: new ReadableStream(),
          httpMetadata: {},
        }),
      };
      await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(mockFiles.get).toHaveBeenCalledWith('k2');
    });

    it('returns exact 404 body when R2 object missing', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', r2_key: 'k1' },
      });
      const mockFiles = { get: vi.fn().mockResolvedValue(null) };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('File not found');
    });

    it('returns exact 404 body when R2 body missing', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', r2_key: 'k1' },
      });
      const mockFiles = { get: vi.fn().mockResolvedValue({ body: null }) };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('File not found');
    });

    it('returns exact 500 body when blob fetch fails', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.requireOwnedDocument.mockRejectedValueOnce(new Error('connection lost'));
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        env,
        {},
        user,
        '/api/files/d1/blob',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('Get file blob failed', {
        error: 'connection lost',
      });
    });

    it('logs object error when blob fetch fails without message', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.requireOwnedDocument.mockRejectedValueOnce(null);
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        env,
        {},
        user,
        '/api/files/d1/blob',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('Get file blob failed', { error: null });
    });

    it('returns exact fallback headers when content types are missing', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'data.bin', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({
          body: new ReadableStream(),
          httpMetadata: {},
        }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('returns fallback when httpMetadata is absent for optional chaining', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: { id: 'd1', filename: 'data.bin', r2_key: 'k1' },
      });
      const mockFiles = {
        get: vi.fn().mockResolvedValue({
          body: new ReadableStream(),
        }),
      };
      const res = await filesRouter(
        makeReq('/api/files/d1/blob'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/d1/blob'
      );
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    });
  });

  // ── Mutation coverage: GET /api/files/:id/process/status deep assertions ──

  describe('GET /api/files/:id/process/status mutation coverage', () => {
    it('returns exact pending body', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          extraction_status: 0,
          created_at: 123,
          updated_at: 456,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'a.txt',
        extraction: { status: 'pending', error: null },
        created_at: 123,
        updated_at: 456,
      });
    });

    it('returns exact done body', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          extraction_status: 1,
          created_at: 1,
          updated_at: 2,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'a.txt',
        extraction: { status: 'done', error: null },
        created_at: 1,
        updated_at: 2,
      });
    });

    it('returns exact failed body with error', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          extraction_status: -1,
          extraction_error: 'corrupt',
          created_at: 1,
          updated_at: 2,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status'
      );
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'a.txt',
        extraction: { status: 'failed', error: 'corrupt' },
        created_at: 1,
        updated_at: 2,
      });
    });

    it('logs exact error on status failure', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.requireOwnedDocument.mockRejectedValueOnce(new Error('timeout'));
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('Get process status failed', {
        error: 'timeout',
      });
    });

    it('logs object error on status failure without message', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.requireOwnedDocument.mockRejectedValueOnce(null);
      const res = await filesRouter(
        makeReq('/api/files/d1/process/status'),
        env,
        {},
        user,
        '/api/files/d1/process/status',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('Get process status failed', { error: null });
    });
  });

  // ── Mutation coverage: GET /api/files/:id/content deep assertions ─────────

  describe('GET /api/files/:id/content mutation coverage', () => {
    it('returns 429 when download rate limit exceeded', async () => {
      const resetAt = Date.now() + 45_000;
      mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, resetAt });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe('Too many file downloads');
      expect(body.details.retry_after).toBeGreaterThanOrEqual(44);
      expect(body.details.retry_after).toBeLessThanOrEqual(45);
    });

    it('calls checkRateLimit with correct download params for content', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          content_type: 'text/plain',
          text_excerpt: 'hello',
          extraction_status: 1,
        },
      });
      await filesRouter(makeReq('/api/files/d1/content'), env, {}, user, '/api/files/d1/content');
      expect(mocks.checkRateLimit).toHaveBeenCalledWith(env, {
        action: 'file-download',
        subject: 'u1',
        limit: 100,
        windowSeconds: 3600,
      });
    });

    it('returns exact JSON content body', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'data.json',
          content_type: 'application/json',
          text_excerpt: '{"a":1}',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'data.json',
        type: 'application/json',
        content: { a: 1 },
        extracted: true,
      });
    });

    it('returns exact text content body', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          content_type: 'text/plain',
          text_excerpt: 'hello world',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'a.txt',
        type: 'text/plain',
        content: 'hello world',
        extracted: true,
      });
    });

    it('returns exact binary metadata body for pending extraction', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'img.png',
          content_type: 'image/png',
          text_excerpt: null,
          extraction_status: 0,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'img.png',
        type: 'image/png',
        content: {
          filename: 'img.png',
          type: 'image/png',
          status: 'pending',
          note: 'Binary file - text excerpt not available',
        },
        extracted: false,
      });
    });

    it('returns exact binary metadata body for extracted status', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'img.png',
          content_type: 'image/png',
          text_excerpt: null,
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'img.png',
        type: 'image/png',
        content: {
          filename: 'img.png',
          type: 'image/png',
          status: 'extracted',
          note: 'Binary file - text excerpt not available',
        },
        extracted: true,
      });
    });

    it('returns exact JSON parse error body', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'bad.json',
          content_type: 'application/json',
          text_excerpt: 'not-json',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body).toEqual({
        id: 'd1',
        filename: 'bad.json',
        type: 'application/json',
        content: { error: 'Failed to parse JSON content' },
        extracted: true,
      });
    });

    it('returns binary body when content_type is null', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'unknown',
          content_type: null,
          text_excerpt: 'something',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content).toEqual({
        filename: 'unknown',
        type: null,
        status: 'extracted',
        note: 'Binary file - text excerpt not available',
      });
    });

    it('returns binary body when content_type is undefined', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'unknown',
          content_type: undefined,
          text_excerpt: 'something',
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content).toEqual({
        filename: 'unknown',
        type: undefined,
        status: 'extracted',
        note: 'Binary file - text excerpt not available',
      });
    });

    it('returns exact empty JSON body when text_excerpt is null', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'data.json',
          content_type: 'application/json',
          text_excerpt: null,
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content).toEqual({});
    });

    it('returns exact fallback text body when text_excerpt is null', async () => {
      mocks.requireOwnedDocument.mockResolvedValueOnce({
        doc: {
          id: 'd1',
          filename: 'a.txt',
          content_type: 'text/plain',
          text_excerpt: null,
          extraction_status: 1,
        },
      });
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content'
      );
      const body = await res.json();
      expect(body.content).toBe('[No text content extracted]');
    });

    it('logs exact error on content failure', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.requireOwnedDocument.mockRejectedValueOnce(new Error('db crash'));
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
      expect(customLogger.error).toHaveBeenCalledWith('Get file content failed', {
        error: 'db crash',
      });
    });

    it('logs object error on content failure without message', async () => {
      const customLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      mocks.requireOwnedDocument.mockRejectedValueOnce(null);
      const res = await filesRouter(
        makeReq('/api/files/d1/content'),
        env,
        {},
        user,
        '/api/files/d1/content',
        { logger: customLogger }
      );
      expect(res.status).toBe(500);
      expect(customLogger.error).toHaveBeenCalledWith('Get file content failed', { error: null });
    });
  });

  // ── Mutation coverage: GET /api/files/health deep assertions ──────────────

  describe('GET /api/files/health mutation coverage', () => {
    it('returns exact success body', async () => {
      const mockFiles = { list: vi.fn().mockResolvedValue({ objects: [] }) };
      const res = await filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, message: 'R2 reachable' });
    });

    it('returns exact 500 body when FILES binding missing', async () => {
      const res = await filesRouter(
        makeReq('/api/files/health'),
        {},
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
    });

    it('returns exact 503 body with error message', async () => {
      const mockFiles = { list: vi.fn().mockRejectedValue(new Error('connection refused')) };
      const res = await filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
    });

    it('returns exact 503 body with fallback message', async () => {
      const mockFiles = { list: vi.fn().mockRejectedValue({}) };
      const res = await filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
    });

    it('returns exact 503 body on timeout', async () => {
      vi.useFakeTimers();
      const mockFiles = { list: vi.fn().mockReturnValue(new Promise(() => {})) };
      const promise = filesRouter(
        makeReq('/api/files/health'),
        { FILES: mockFiles },
        {},
        user,
        '/api/files/health'
      );
      vi.advanceTimersByTime(3100);
      const res = await promise;
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('An error occurred. Please try again later.');
    });
  });

  // ── Mutation coverage: route matching edge cases ──────────────────────────

  describe('route matching edge cases', () => {
    it('rejects /api/files/search/extra as non-file path', async () => {
      const res = await filesRouter(
        makeReq('/api/files/search/extra'),
        env,
        {},
        user,
        '/api/files/search/extra'
      );
      expect(res).toBeNull();
    });

    it('rejects /api/files/upload/extra as non-file path', async () => {
      const res = await filesRouter(
        makeReq('/api/files/upload/extra'),
        env,
        {},
        user,
        '/api/files/upload/extra'
      );
      expect(res).toBeNull();
    });

    it('rejects path with trailing slash on document ID', async () => {
      const res = await filesRouter(makeReq('/api/files/d1/'), env, {}, user, '/api/files/d1/');
      expect(res).toBeNull();
    });
  });

  // ── Unmatched methods ─────────────────────────────────────────────────────

  describe('unmatched methods on valid paths', () => {
    it('returns null for POST on /api/files', async () => {
      const res = await filesRouter(
        new Request('https://example.com/api/files', { method: 'POST' }),
        env,
        {},
        user,
        '/api/files'
      );
      expect(res).toBeNull();
    });

    it('returns null for PUT on /api/files/upload', async () => {
      const res = await filesRouter(
        new Request('https://example.com/api/files/upload', { method: 'PUT' }),
        env,
        {},
        user,
        '/api/files/upload'
      );
      expect(res).toBeNull();
    });
  });
});
