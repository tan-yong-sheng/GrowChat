import { describe, expect, it, vi } from 'vitest';
import {
  validateFile,
  uploadFileToR2,
  deleteFileFromR2,
  storeFileMetadata,
  getFileMetadata,
  getOwnedDocument,
  requireOwnedDocument,
  listUserDocuments,
  deleteDocument,
  resolveContentType,
  inferContentTypeFromFilename,
} from './uploads.js';

describe('validateFile', () => {
  it('accepts valid image file', () => {
    const result = validateFile({
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid PDF file', () => {
    const result = validateFile({
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      fileSize: 1024,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid text file', () => {
    const result = validateFile({
      filename: 'notes.txt',
      contentType: 'text/plain',
      fileSize: 512,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts text-like application types', () => {
    expect(
      validateFile({ filename: 'f.json', contentType: 'application/json', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.yaml', contentType: 'application/yaml', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.js', contentType: 'application/javascript', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.ts', contentType: 'application/typescript', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.xml', contentType: 'application/xml', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.csv', contentType: 'application/csv', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.ndjson', contentType: 'application/x-ndjson', fileSize: 100 })
        .valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.json5', contentType: 'application/json5', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.x-json5', contentType: 'application/x-json5', fileSize: 100 })
        .valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.ndjson2', contentType: 'application/ndjson', fileSize: 100 })
        .valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.iif', contentType: 'application/x-iif', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.yaml2', contentType: 'application/x-yaml', fileSize: 100 }).valid
    ).toBe(true);
    expect(
      validateFile({ filename: 'f.js2', contentType: 'application/x-javascript', fileSize: 100 })
        .valid
    ).toBe(true);
    expect(validateFile({ filename: 'f.tsv', contentType: 'text/tsv', fileSize: 100 }).valid).toBe(
      true
    );
  });

  it('rejects files exceeding 50MB limit', () => {
    const fiftyOneMB = 51 * 1024 * 1024;
    const result = validateFile({
      filename: 'big.pdf',
      contentType: 'application/pdf',
      fileSize: fiftyOneMB,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds 50MB limit');
  });

  it('accepts file at exactly 50MB', () => {
    const exactly50MB = 50 * 1024 * 1024;
    const result = validateFile({
      filename: 'exact.pdf',
      contentType: 'application/pdf',
      fileSize: exactly50MB,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects unsupported content type', () => {
    const result = validateFile({
      filename: 'f.exe',
      contentType: 'application/x-msdownload',
      fileSize: 100,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
  });

  it('rejects unknown/empty content type', () => {
    const result = validateFile({ filename: 'f', contentType: '', fileSize: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unknown');
  });

  it('rejects null content type', () => {
    const result = validateFile({ filename: 'f', contentType: null, fileSize: 100 });
    expect(result.valid).toBe(false);
  });

  it('rejects empty filename', () => {
    const result = validateFile({ filename: '', contentType: 'text/plain', fileSize: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid filename');
  });

  it('rejects null filename', () => {
    const result = validateFile({ filename: null, contentType: 'text/plain', fileSize: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid filename');
  });

  it('rejects filename over 255 chars', () => {
    const longName = 'a'.repeat(256);
    const result = validateFile({ filename: longName, contentType: 'text/plain', fileSize: 100 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid filename');
  });

  it('accepts filename at exactly 255 chars', () => {
    const name255 = 'a'.repeat(255);
    const result = validateFile({ filename: name255, contentType: 'text/plain', fileSize: 100 });
    expect(result.valid).toBe(true);
  });

  it('performs case-insensitive content type check', () => {
    const result = validateFile({ filename: 'f.JPG', contentType: 'Image/JPEG', fileSize: 100 });
    expect(result.valid).toBe(true);
  });

  it('rejects video content type', () => {
    const result = validateFile({ filename: 'f.mp4', contentType: 'video/mp4', fileSize: 100 });
    expect(result.valid).toBe(false);
  });
});

describe('resolveContentType', () => {
  it('uses explicit content type when provided', () => {
    expect(resolveContentType('file.txt', 'application/json')).toBe('application/json');
  });

  it('falls back to inferred type from filename', () => {
    const result = resolveContentType('file.json', '');
    expect(result).toBe('application/json');
  });

  it('falls back to application/octet-stream when no type available', () => {
    const result = resolveContentType('file.xyz', '');
    expect(result).toBe('application/octet-stream');
  });

  it('trims whitespace from explicit content type', () => {
    expect(resolveContentType('f.txt', '  text/plain  ')).toBe('text/plain');
  });

  it('uses explicit type even when whitespace-only inferred would differ', () => {
    expect(resolveContentType('f.json', 'text/html')).toBe('text/html');
  });
});

describe('uploadFileToR2', () => {
  it('uploads file and returns r2Key and r2Url', async () => {
    const mockPut = vi.fn().mockResolvedValue({ id: 'obj-1' });
    const env = { FILES: { put: mockPut } };

    const result = await uploadFileToR2({
      env: env,
      userId: 'user-1',
      filename: 'test.txt',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(10),
    });

    expect(result.r2Key).toContain('/user/user-1/files/');
    expect(result.r2Key).toContain('.txt');
    expect(result.r2Url).toContain(result.r2Key);
    expect(result.objectId).toBe('obj-1');
    expect(mockPut).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(ArrayBuffer),
      expect.objectContaining({
        httpMetadata: expect.objectContaining({ contentType: 'text/plain' }),
      })
    );
  });

  it('throws if R2 binding is missing', async () => {
    const env = {};
    await expect(
      uploadFileToR2({
        env: env,
        userId: 'u1',
        filename: 'f.txt',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(0),
      })
    ).rejects.toThrow('R2 binding not configured');
  });

  it('throws if R2 put fails', async () => {
    const env = { FILES: { put: vi.fn().mockRejectedValue(new Error('R2 error')) } };
    await expect(
      uploadFileToR2({
        env: env,
        userId: 'u1',
        filename: 'f.txt',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(0),
      })
    ).rejects.toThrow('R2 upload failed');
  });

  it('generates correct extension for content types', async () => {
    const mockPut = vi.fn().mockResolvedValue({ id: 'obj-2' });
    const env = { FILES: { put: mockPut } };

    await uploadFileToR2({
      env: env,
      userId: 'u1',
      filename: 'f.pdf',
      contentType: 'application/pdf',
      buffer: new ArrayBuffer(0),
    });
    expect(mockPut.mock.calls[0][0]).toMatch(/\.pdf$/);

    await uploadFileToR2({
      env: env,
      userId: 'u1',
      filename: 'f.png',
      contentType: 'image/png',
      buffer: new ArrayBuffer(0),
    });
    expect(mockPut.mock.calls[1][0]).toMatch(/\.png$/);

    await uploadFileToR2({
      env: env,
      userId: 'u1',
      filename: 'f.jpg',
      contentType: 'image/jpeg',
      buffer: new ArrayBuffer(0),
    });
    expect(mockPut.mock.calls[2][0]).toMatch(/\.jpg$/);
  });

  it('falls back to bin extension for unknown content types', async () => {
    const mockPut = vi.fn().mockResolvedValue({ id: 'obj-3' });
    const env = { FILES: { put: mockPut } };

    await uploadFileToR2({
      env: env,
      userId: 'u1',
      filename: 'f.abc',
      contentType: 'application/x-unknown',
      buffer: new ArrayBuffer(0),
    });
    expect(mockPut.mock.calls[0][0]).toMatch(/\.bin$/);
  });
});

describe('deleteFileFromR2', () => {
  it('deletes from R2 successfully', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const env = { FILES: { delete: mockDelete } };

    await deleteFileFromR2(env, '/user/u1/files/abc.txt');
    expect(mockDelete).toHaveBeenCalledWith('/user/u1/files/abc.txt');
  });

  it('does nothing if FILES binding is missing', async () => {
    const env = {};
    await expect(deleteFileFromR2(env, '/key')).resolves.toBeUndefined();
  });

  it('handles R2 delete errors gracefully', async () => {
    const env = { FILES: { delete: vi.fn().mockRejectedValue(new Error('fail')) } };
    await expect(deleteFileFromR2(env, '/key')).resolves.toBeUndefined();
  });
});

describe('storeFileMetadata', () => {
  it('stores metadata and returns document ID', async () => {
    const mockRun = vi.fn().mockResolvedValue({ success: true });
    const db = { run: mockRun };

    const docId = await storeFileMetadata(db, {
      userId: 'u1',
      chatId: 'c1',
      filename: 'test.txt',
      contentType: 'text/plain',
      fileSize: 100,
      r2Key: '/key',
      r2Url: 'https://r2.example.com/key',
    });

    expect(docId).toBeDefined();
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO documents'),
      expect.arrayContaining([
        'u1',
        'c1',
        'test.txt',
        'text/plain',
        100,
        '/key',
        'https://r2.example.com/key',
      ])
    );
  });

  it('stores null chatId when not provided', async () => {
    const mockRun = vi.fn().mockResolvedValue({ success: true });
    const db = { run: mockRun };

    await storeFileMetadata(db, {
      userId: 'u1',
      filename: 'test.txt',
      contentType: 'text/plain',
      fileSize: 100,
      r2Key: '/key',
      r2Url: 'https://r2.example.com/key',
    });

    expect(mockRun).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([null]));
  });
});

describe('getFileMetadata', () => {
  it('queries D1 for document by ID', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ id: 'doc-1', filename: 'test.txt' });
    const db = { first: mockFirst };

    const result = await getFileMetadata(db, 'doc-1');
    expect(result).toEqual({ id: 'doc-1', filename: 'test.txt' });
    expect(mockFirst).toHaveBeenCalledWith(expect.any(String), ['doc-1']);
  });
});

describe('getOwnedDocument', () => {
  it('queries for document with user ownership', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ id: 'doc-1', user_id: 'u1' });
    const db = { first: mockFirst };

    const result = await getOwnedDocument({ db, documentId: 'doc-1', userId: 'u1' });
    expect(result).toEqual({ id: 'doc-1', user_id: 'u1' });
    expect(mockFirst).toHaveBeenCalledWith(expect.any(String), ['doc-1', 'u1']);
  });
});

describe('requireOwnedDocument', () => {
  it('returns doc when owned document found', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ id: 'doc-1', user_id: 'u1' });
    const db = { first: mockFirst };
    const req = { headers: new Headers() };

    const result = await requireOwnedDocument({
      req: req,
      db: db,
      documentId: 'doc-1',
      userId: 'u1',
    });
    expect(result.doc).toEqual({ id: 'doc-1', user_id: 'u1' });
  });

  it('returns error when document not found', async () => {
    const mockFirst = vi.fn().mockResolvedValue(null);
    const db = { first: mockFirst };
    const req = { headers: new Headers(), method: 'GET', url: 'http://localhost/api/test' };

    const result = await requireOwnedDocument({
      req: req,
      db: db,
      documentId: 'doc-1',
      userId: 'u1',
    });
    expect(result.error).toBeDefined();
    expect(result.error.status).toBe(404);
  });
});

describe('listUserDocuments', () => {
  it('queries with default limit and offset', async () => {
    const mockAll = vi.fn().mockResolvedValue([]);
    const db = { all: mockAll };

    await listUserDocuments({ db, userId: 'u1' });
    expect(mockAll).toHaveBeenCalledWith(expect.any(String), ['u1', 20, 0]);
  });

  it('queries with custom limit and offset', async () => {
    const mockAll = vi.fn().mockResolvedValue([]);
    const db = { all: mockAll };

    await listUserDocuments({ db: db, userId: 'u1', limit: 50, offset: 10 });
    expect(mockAll).toHaveBeenCalledWith(expect.any(String), ['u1', 50, 10]);
  });
});

describe('deleteDocument', () => {
  it('deletes owned document from R2 and D1', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ id: 'doc-1', user_id: 'u1', r2_key: '/key' });
    const mockRun = vi.fn().mockResolvedValue({ success: true });
    const mockR2Delete = vi.fn().mockResolvedValue(undefined);
    const db = { first: mockFirst, run: mockRun };
    const env = { FILES: { delete: mockR2Delete } };

    const result = await deleteDocument({ env: env, db: db, documentId: 'doc-1', userId: 'u1' });
    expect(result).toBe(true);
    expect(mockR2Delete).toHaveBeenCalledWith('/key');
    expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM documents'), [
      'doc-1',
      'u1',
    ]);
  });

  it('throws when document not found or not owned', async () => {
    const mockFirst = vi.fn().mockResolvedValue(null);
    const db = { first: mockFirst };
    const env = { FILES: { delete: vi.fn() } };

    await expect(
      deleteDocument({ env: env, db: db, documentId: 'doc-1', userId: 'u1' })
    ).rejects.toThrow('Document not found');
    expect(env.FILES.delete).not.toHaveBeenCalled();
  });
});

describe('inferContentTypeFromFilename', () => {
  it('delegates to inferContentType', () => {
    expect(inferContentTypeFromFilename('file.json')).toBe('application/json');
    expect(inferContentTypeFromFilename('file.txt')).toBe('text/plain');
    expect(inferContentTypeFromFilename('file.pdf')).toBe('application/pdf');
  });
});
