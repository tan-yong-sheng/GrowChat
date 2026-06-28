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
    const result = validateFile('photo.jpg', 'image/jpeg', 1024);
    expect(result.valid).toBe(true);
  });

  it('accepts valid PDF file', () => {
    const result = validateFile('doc.pdf', 'application/pdf', 1024);
    expect(result.valid).toBe(true);
  });

  it('accepts valid text file', () => {
    const result = validateFile('notes.txt', 'text/plain', 512);
    expect(result.valid).toBe(true);
  });

  it('accepts text-like application types', () => {
    expect(validateFile('f.json', 'application/json', 100).valid).toBe(true);
    expect(validateFile('f.yaml', 'application/yaml', 100).valid).toBe(true);
    expect(validateFile('f.js', 'application/javascript', 100).valid).toBe(true);
    expect(validateFile('f.ts', 'application/typescript', 100).valid).toBe(true);
    expect(validateFile('f.xml', 'application/xml', 100).valid).toBe(true);
    expect(validateFile('f.csv', 'application/csv', 100).valid).toBe(true);
    expect(validateFile('f.ndjson', 'application/x-ndjson', 100).valid).toBe(true);
    expect(validateFile('f.json5', 'application/json5', 100).valid).toBe(true);
    expect(validateFile('f.x-json5', 'application/x-json5', 100).valid).toBe(true);
    expect(validateFile('f.ndjson2', 'application/ndjson', 100).valid).toBe(true);
    expect(validateFile('f.iif', 'application/x-iif', 100).valid).toBe(true);
    expect(validateFile('f.yaml2', 'application/x-yaml', 100).valid).toBe(true);
    expect(validateFile('f.js2', 'application/x-javascript', 100).valid).toBe(true);
    expect(validateFile('f.tsv', 'text/tsv', 100).valid).toBe(true);
  });

  it('rejects files exceeding 50MB limit', () => {
    const fiftyOneMB = 51 * 1024 * 1024;
    const result = validateFile('big.pdf', 'application/pdf', fiftyOneMB);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds 50MB limit');
  });

  it('accepts file at exactly 50MB', () => {
    const exactly50MB = 50 * 1024 * 1024;
    const result = validateFile('exact.pdf', 'application/pdf', exactly50MB);
    expect(result.valid).toBe(true);
  });

  it('rejects unsupported content type', () => {
    const result = validateFile('f.exe', 'application/x-msdownload', 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
  });

  it('rejects unknown/empty content type', () => {
    const result = validateFile('f', '', 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unknown');
  });

  it('rejects null content type', () => {
    const result = validateFile('f', null, 100);
    expect(result.valid).toBe(false);
  });

  it('rejects empty filename', () => {
    const result = validateFile('', 'text/plain', 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid filename');
  });

  it('rejects null filename', () => {
    const result = validateFile(null, 'text/plain', 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid filename');
  });

  it('rejects filename over 255 chars', () => {
    const longName = 'a'.repeat(256);
    const result = validateFile(longName, 'text/plain', 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid filename');
  });

  it('accepts filename at exactly 255 chars', () => {
    const name255 = 'a'.repeat(255);
    const result = validateFile(name255, 'text/plain', 100);
    expect(result.valid).toBe(true);
  });

  it('performs case-insensitive content type check', () => {
    const result = validateFile('f.JPG', 'Image/JPEG', 100);
    expect(result.valid).toBe(true);
  });

  it('rejects video content type', () => {
    const result = validateFile('f.mp4', 'video/mp4', 100);
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

    const result = await uploadFileToR2(
      env,
      'user-1',
      'test.txt',
      'text/plain',
      new ArrayBuffer(10)
    );

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
      uploadFileToR2(env, 'u1', 'f.txt', 'text/plain', new ArrayBuffer(0))
    ).rejects.toThrow('R2 binding not configured');
  });

  it('throws if R2 put fails', async () => {
    const env = { FILES: { put: vi.fn().mockRejectedValue(new Error('R2 error')) } };
    await expect(
      uploadFileToR2(env, 'u1', 'f.txt', 'text/plain', new ArrayBuffer(0))
    ).rejects.toThrow('R2 upload failed');
  });

  it('generates correct extension for content types', async () => {
    const mockPut = vi.fn().mockResolvedValue({ id: 'obj-2' });
    const env = { FILES: { put: mockPut } };

    await uploadFileToR2(env, 'u1', 'f.pdf', 'application/pdf', new ArrayBuffer(0));
    expect(mockPut.mock.calls[0][0]).toMatch(/\.pdf$/);

    await uploadFileToR2(env, 'u1', 'f.png', 'image/png', new ArrayBuffer(0));
    expect(mockPut.mock.calls[1][0]).toMatch(/\.png$/);

    await uploadFileToR2(env, 'u1', 'f.jpg', 'image/jpeg', new ArrayBuffer(0));
    expect(mockPut.mock.calls[2][0]).toMatch(/\.jpg$/);
  });

  it('falls back to bin extension for unknown content types', async () => {
    const mockPut = vi.fn().mockResolvedValue({ id: 'obj-3' });
    const env = { FILES: { put: mockPut } };

    await uploadFileToR2(env, 'u1', 'f.abc', 'application/x-unknown', new ArrayBuffer(0));
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

    const result = await getOwnedDocument(db, 'doc-1', 'u1');
    expect(result).toEqual({ id: 'doc-1', user_id: 'u1' });
    expect(mockFirst).toHaveBeenCalledWith(expect.any(String), ['doc-1', 'u1']);
  });
});

describe('requireOwnedDocument', () => {
  it('returns doc when owned document found', async () => {
    const mockFirst = vi.fn().mockResolvedValue({ id: 'doc-1', user_id: 'u1' });
    const db = { first: mockFirst };
    const req = { headers: new Headers() };

    const result = await requireOwnedDocument(req, db, 'doc-1', 'u1');
    expect(result.doc).toEqual({ id: 'doc-1', user_id: 'u1' });
  });

  it('returns error when document not found', async () => {
    const mockFirst = vi.fn().mockResolvedValue(null);
    const db = { first: mockFirst };
    const req = { headers: new Headers(), method: 'GET', url: 'http://localhost/api/test' };

    const result = await requireOwnedDocument(req, db, 'doc-1', 'u1');
    expect(result.error).toBeDefined();
    expect(result.error.status).toBe(404);
  });
});

describe('listUserDocuments', () => {
  it('queries with default limit and offset', async () => {
    const mockAll = vi.fn().mockResolvedValue([]);
    const db = { all: mockAll };

    await listUserDocuments(db, 'u1');
    expect(mockAll).toHaveBeenCalledWith(expect.any(String), ['u1', 20, 0]);
  });

  it('queries with custom limit and offset', async () => {
    const mockAll = vi.fn().mockResolvedValue([]);
    const db = { all: mockAll };

    await listUserDocuments(db, 'u1', 50, 10);
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

    const result = await deleteDocument(env, db, 'doc-1', 'u1');
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

    await expect(deleteDocument(env, db, 'doc-1', 'u1')).rejects.toThrow('Document not found');
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
