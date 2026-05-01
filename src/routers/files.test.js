import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    all: vi.fn(),
    first: vi.fn(),
    run: vi.fn(),
  },
  authorize: vi.fn(),
  uploadFileToR2: vi.fn(),
  storeFileMetadata: vi.fn(),
  deleteDocument: vi.fn(),
  logAuditEvent: vi.fn(),
  extractDocumentText: vi.fn(),
}));

vi.mock('../db.js', () => ({
  createDB: () => mocks.db,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: (...args) => mocks.authorize(...args),
  logAuditEvent: (...args) => mocks.logAuditEvent(...args),
}));

vi.mock('../services/uploads.js', () => ({
  validateFile: () => ({ valid: true }),
  resolveContentType: () => 'application/json',
  uploadFileToR2: (...args) => mocks.uploadFileToR2(...args),
  storeFileMetadata: (...args) => mocks.storeFileMetadata(...args),
  getFileMetadata: vi.fn(),
  listUserDocuments: vi.fn(),
  deleteDocument: (...args) => mocks.deleteDocument(...args),
}));

vi.mock('../services/extraction.js', () => ({
  extractDocumentText: (...args) => mocks.extractDocumentText(...args),
}));

import { filesRouter } from './files.js';

function makeReq(path, method, body) {
  return {
    url: `https://example.com${path}`,
    method,
    headers: new Headers(),
    async formData() {
      if (body instanceof FormData) return body;
      const formData = new FormData();
      return formData;
    },
  };
}

describe('filesRouter', () => {
  const user = { sub: 'u1', role: 'member', email: 'u@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ allow: true, code: 'ok' });
    mocks.db.run.mockResolvedValue({ success: true });
    mocks.db.first.mockResolvedValue({ id: 'd1', user_id: 'u1', r2_key: 'r2-key' });
    mocks.uploadFileToR2.mockResolvedValue({
      r2Key: 'r2-key',
      r2Url: 'https://example.invalid/r2-key',
    });
    mocks.storeFileMetadata.mockResolvedValue('d1');
    mocks.deleteDocument.mockResolvedValue(true);
    mocks.logAuditEvent.mockResolvedValue(undefined);
  });

  it('allows file upload when file.upload is granted', async () => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([JSON.stringify({ ok: true })], 'sample.json', { type: 'application/json' })
    );

    const req = makeReq('/api/files/upload', 'POST', formData);

    const res = await filesRouter(req, { DB: {}, FILES: {} }, {}, user, '/api/files/upload');

    expect(res.status).toBe(201);
    expect(mocks.authorize).toHaveBeenCalledWith({ DB: {}, FILES: {} }, user, {
      action: 'file.upload',
      resource: 'file',
    });
    expect(mocks.storeFileMetadata).toHaveBeenCalled();
  });

  it('denies file delete when file.delete is missing', async () => {
    mocks.authorize.mockImplementation(async (_env, _user, options = {}) => {
      if (options.action === 'file.delete') {
        return {
          allow: false,
          code: 'forbidden',
          reason: 'missing_permission',
          action: 'file.delete',
        };
      }
      return { allow: true, code: 'ok', action: options.action };
    });

    const res = await filesRouter(
      makeReq('/api/files/d1', 'DELETE'),
      { DB: {}, FILES: {} },
      {},
      user,
      '/api/files/d1'
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'missing_permission' });
    expect(mocks.deleteDocument).not.toHaveBeenCalled();
  });
});
