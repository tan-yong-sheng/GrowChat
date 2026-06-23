/**
 * Tests for src/services/uploads.js
 * Targets mutation coverage: branches, comparisons, logical ops, error messages,
 * template literals, defaults, and object property access.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  validateFile,
  inferContentTypeFromFilename,
  resolveContentType,
  uploadFileToR2,
  deleteFileFromR2,
  storeFileMetadata,
  getFileMetadata,
  getOwnedDocument,
  requireOwnedDocument,
  listUserDocuments,
  deleteDocument,
} from './uploads.js';

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  createRootLogger: () => loggerMocks,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/* ─────────── validateFile ─────────── */

describe('validateFile', () => {
  it('accepts valid image file', () => {
    const result = validateFile('photo.jpg', 'image/jpeg', 1024);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts valid pdf file', () => {
    expect(validateFile('doc.pdf', 'application/pdf', 1024).valid).toBe(true);
  });

  it('accepts valid text file', () => {
    expect(validateFile('data.csv', 'text/csv', 512).valid).toBe(true);
  });

  it('accepts valid json file', () => {
    expect(validateFile('config.json', 'application/json', 256).valid).toBe(true);
  });

  it('accepts x-iif alias type', () => {
    expect(validateFile('data.iif', 'application/x-iif', 256).valid).toBe(true);
  });

  it('accepts valid yaml file', () => {
    expect(validateFile('config.yaml', 'application/x-yaml', 256).valid).toBe(true);
  });

  it('accepts application/xml type', () => {
    expect(validateFile('data.xml', 'application/xml', 256).valid).toBe(true);
  });

  it('accepts x-xml alias type', () => {
    expect(validateFile('data.xml', 'application/x-xml', 256).valid).toBe(true);
  });

  it('accepts application/yaml type', () => {
    expect(validateFile('data.yaml', 'application/yaml', 256).valid).toBe(true);
  });

  it('accepts valid js file', () => {
    expect(validateFile('index.js', 'application/javascript', 512).valid).toBe(true);
  });

  it('accepts x-javascript alias type', () => {
    expect(validateFile('legacy.js', 'application/x-javascript', 256).valid).toBe(true);
  });

  it('accepts valid ts file', () => {
    expect(validateFile('types.ts', 'application/typescript', 256).valid).toBe(true);
  });

  it('accepts text/* types automatically', () => {
    expect(validateFile('readme.txt', 'text/plain', 100).valid).toBe(true);
    expect(validateFile('doc.md', 'text/markdown', 100).valid).toBe(true);
    expect(validateFile('data.xml', 'text/xml', 100).valid).toBe(true);
    expect(validateFile('script.js', 'text/javascript', 100).valid).toBe(true);
  });

  it('rejects file exceeding 50MB with exact message', () => {
    const maxSize = 50 * 1024 * 1024;
    const result = validateFile('large.bin', 'image/jpeg', maxSize + 1);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('File size 50.00MB exceeds 50MB limit');
  });

  it('accepts file exactly at 50MB', () => {
    const maxSize = 50 * 1024 * 1024;
    const result = validateFile('large.jpg', 'image/jpeg', maxSize);
    expect(result.valid).toBe(true);
  });

  it('rejects unsupported content type with exact message', () => {
    const result = validateFile('video.mp4', 'video/mp4', 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'File type video/mp4 not supported. Supported: text/code, images, pdf'
    );
  });

  it('rejects application/octet-stream with exact message', () => {
    const result = validateFile('binary.exe', 'application/octet-stream', 512);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'File type application/octet-stream not supported. Supported: text/code, images, pdf'
    );
  });

  it('rejects audio files with exact message', () => {
    const result = validateFile('song.mp3', 'audio/mpeg', 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'File type audio/mpeg not supported. Supported: text/code, images, pdf'
    );
  });

  it('rejects empty/blank filename', () => {
    expect(validateFile('', 'image/jpeg', 100).valid).toBe(false);
    expect(validateFile(null, 'image/jpeg', 100).valid).toBe(false);
    expect(validateFile(undefined, 'image/jpeg', 100).valid).toBe(false);
  });

  it('rejects filename over 255 chars with exact message', () => {
    const longName = 'a'.repeat(256) + '.jpg';
    const result = validateFile(longName, 'image/jpeg', 100);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid filename');
  });

  it('accepts filename at exactly 255 chars', () => {
    const name = 'a'.repeat(251) + '.jpg';
    const result = validateFile(name, 'image/jpeg', 100);
    expect(result.valid).toBe(true);
  });

  it('handles null/undefined/empty contentType gracefully', () => {
    expect(validateFile('photo.jpg', null, 100).valid).toBe(false);
    expect(validateFile('photo.jpg', undefined, 100).valid).toBe(false);
    expect(validateFile('photo.jpg', '', 100).valid).toBe(false);
  });

  it('reports exact error for unknown type', () => {
    expect(validateFile('file', '', 1024).error).toBe(
      'File type unknown not supported. Supported: text/code, images, pdf'
    );
    expect(validateFile('file', null, 1024).error).toBe(
      'File type unknown not supported. Supported: text/code, images, pdf'
    );
  });

  it('is case-insensitive for content type', () => {
    expect(validateFile('photo.jpg', 'IMAGE/JPEG', 100).valid).toBe(true);
    expect(validateFile('photo.jpg', 'Image/Png', 100).valid).toBe(true);
  });
});

/* ─────────── inferContentTypeFromFilename ─────────── */

describe('inferContentTypeFromFilename', () => {
  it('infers image types', () => {
    expect(inferContentTypeFromFilename('photo.png')).toBe('image/png');
    expect(inferContentTypeFromFilename('photo.jpg')).toBe('image/jpeg');
    expect(inferContentTypeFromFilename('photo.jpeg')).toBe('image/jpeg');
    expect(inferContentTypeFromFilename('photo.webp')).toBe('image/webp');
  });

  it('infers pdf', () => {
    expect(inferContentTypeFromFilename('doc.pdf')).toBe('application/pdf');
  });

  it('infers text types', () => {
    expect(inferContentTypeFromFilename('readme.txt')).toBe('text/plain');
    expect(inferContentTypeFromFilename('readme.md')).toBe('text/markdown');
    expect(inferContentTypeFromFilename('data.csv')).toBe('text/csv');
  });

  it('infers code types', () => {
    expect(inferContentTypeFromFilename('index.js')).toBe('application/javascript');
    expect(inferContentTypeFromFilename('index.ts')).toBe('application/typescript');
  });

  it('returns empty string for unknown extension', () => {
    expect(inferContentTypeFromFilename('file.xyz')).toBe('');
    expect(inferContentTypeFromFilename('file.noext')).toBe('');
  });

  it('handles filename with no extension', () => {
    expect(inferContentTypeFromFilename('Makefile')).toBe('');
    expect(inferContentTypeFromFilename('README')).toBe('');
  });
});

/* ─────────── resolveContentType ─────────── */

describe('resolveContentType', () => {
  it('uses explicit content type when provided', () => {
    expect(resolveContentType('doc.pdf', 'text/plain')).toBe('text/plain');
    expect(resolveContentType('doc.pdf', 'image/png')).toBe('image/png');
  });

  it('trims explicit content type whitespace', () => {
    expect(resolveContentType('doc.pdf', '  text/plain  ')).toBe('text/plain');
  });

  it('falls back to inferred type when contentType is empty', () => {
    expect(resolveContentType('photo.png', '')).toBe('image/png');
    expect(resolveContentType('doc.pdf', '  ')).toBe('application/pdf');
    expect(resolveContentType('script.js', null)).toBe('application/javascript');
  });

  it('falls back to inferred type when contentType is undefined', () => {
    expect(resolveContentType('data.csv', undefined)).toBe('text/csv');
  });

  it('falls back to octet-stream for unknown extension', () => {
    expect(resolveContentType('file.xyz', '')).toBe('application/octet-stream');
    expect(resolveContentType('file.xyz', null)).toBe('application/octet-stream');
  });
});

/* ─────────── uploadFileToR2 ─────────── */

describe('uploadFileToR2', () => {
  it('uploads file to R2 and returns key/url/objectId', async () => {
    const mockFiles = {
      put: vi.fn().mockResolvedValue({ id: 'r2-obj-id' }),
    };
    const mockEnv = { FILES: mockFiles };
    const buffer = new ArrayBuffer(1024);

    const result = await uploadFileToR2(mockEnv, 'user-1', 'doc.pdf', 'application/pdf', buffer);

    expect(result.r2Key).toMatch(
      /^\/user\/user-1\/files\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/
    );
    expect(result.r2Url).toBe('https://r2.example.com' + result.r2Key);
    expect(result.objectId).toBe('r2-obj-id');
    expect(mockFiles.put).toHaveBeenCalledOnce();
  });

  it('clears timeout after successful upload', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const mockFiles = {
      put: vi.fn().mockResolvedValue({ id: 'obj' }),
    };
    const mockEnv = { FILES: mockFiles };

    await uploadFileToR2(mockEnv, 'user-1', 'f.txt', 'text/plain', new ArrayBuffer(4));
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('throws when FILES binding is missing', async () => {
    const mockEnv = {};
    const buffer = new ArrayBuffer(1024);

    await expect(
      uploadFileToR2(mockEnv, 'user-1', 'doc.pdf', 'application/pdf', buffer)
    ).rejects.toThrow('R2 binding not configured');
  });

  it('includes correct httpMetadata and customMetadata on R2 put', async () => {
    const mockFiles = {
      put: vi.fn().mockResolvedValue({ id: 'obj-1' }),
    };
    const mockEnv = { FILES: mockFiles };
    const buffer = new ArrayBuffer(512);

    await uploadFileToR2(mockEnv, 'user-1', 'photo.jpg', 'image/jpeg', buffer);

    const [, bufferArg, options] = mockFiles.put.mock.calls[0];
    expect(bufferArg).toBe(buffer);
    expect(options.httpMetadata.contentType).toBe('image/jpeg');
    expect(options.httpMetadata.cacheControl).toBe('max-age=86400');
    expect(options.customMetadata.originalFilename).toBe('photo.jpg');
    expect(options.customMetadata.userId).toBe('user-1');
    expect(typeof options.customMetadata.uploadedAt).toBe('string');
  });

  it('re-throws R2 errors with exact message and cause', async () => {
    const mockFiles = {
      put: vi.fn().mockRejectedValue(new Error('R2 network error')),
    };
    const mockEnv = { FILES: mockFiles };
    const buffer = new ArrayBuffer(512);

    const err = await uploadFileToR2(mockEnv, 'user-1', 'doc.pdf', 'application/pdf', buffer).catch(
      (e) => e
    );

    expect(err.message).toBe('R2 upload failed: R2 network error');
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause.message).toBe('R2 network error');
  });

  it('logs exact error on R2 put failure', async () => {
    const mockFiles = {
      put: vi.fn().mockRejectedValue(new Error('network down')),
    };
    const mockEnv = { FILES: mockFiles };

    try {
      await uploadFileToR2(mockEnv, 'user-1', 'f.txt', 'text/plain', new ArrayBuffer(8));
    } catch {
      // expected
    }

    expect(loggerMocks.error).toHaveBeenCalledWith('R2 upload failed', {
      error: 'network down',
    });
  });

  it('handles undefined rejection without crashing', async () => {
    const mockFiles = {
      put: vi.fn().mockRejectedValue(undefined),
    };
    const mockEnv = { FILES: mockFiles };

    try {
      await uploadFileToR2(mockEnv, 'user-1', 'f.txt', 'text/plain', new ArrayBuffer(8));
    } catch {
      // expected
    }

    expect(loggerMocks.error).toHaveBeenCalledWith('R2 upload failed', {
      error: undefined,
    });
  });

  it('picks correct extension for each known content type', async () => {
    const cases = [
      ['application/pdf', 'pdf'],
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
      ['text/plain', 'txt'],
      ['text/markdown', 'md'],
      ['text/csv', 'csv'],
      ['text/tsv', 'tsv'],
      ['application/json', 'json'],
      ['application/json5', 'json5'],
      ['application/x-json5', 'json5'],
      ['application/x-ndjson', 'ndjson'],
      ['application/ndjson', 'ndjson'],
    ];

    for (const [contentType, expectedExt] of cases) {
      const mockFiles = {
        put: vi.fn().mockResolvedValue({ id: 'obj' }),
      };
      const result = await uploadFileToR2(
        { FILES: mockFiles },
        'u1',
        'file',
        contentType,
        new ArrayBuffer(4)
      );
      expect(result.r2Key).toMatch(new RegExp('\\.' + expectedExt + '$'));
    }
  });

  it('falls back to bin for unknown content type', async () => {
    const mockFiles = {
      put: vi.fn().mockResolvedValue({ id: 'obj' }),
    };
    const result = await uploadFileToR2(
      { FILES: mockFiles },
      'u1',
      'file',
      'application/unknown',
      new ArrayBuffer(4)
    );
    expect(result.r2Key).toMatch(/\.bin$/);
  });

  it('falls back to txt for generic text types', async () => {
    const mockFiles = {
      put: vi.fn().mockResolvedValue({ id: 'obj' }),
    };
    const result = await uploadFileToR2(
      { FILES: mockFiles },
      'u1',
      'file',
      'text/x-custom',
      new ArrayBuffer(4)
    );
    expect(result.r2Key).toMatch(/\.txt$/);
  });

  it('normalizes uppercase content type for extension mapping', async () => {
    const mockFiles = {
      put: vi.fn().mockResolvedValue({ id: 'obj' }),
    };
    const result = await uploadFileToR2(
      { FILES: mockFiles },
      'u1',
      'file',
      'IMAGE/PNG',
      new ArrayBuffer(4)
    );
    expect(result.r2Key).toMatch(/\.png$/);
  });

  it('times out slow R2 uploads', async () => {
    vi.useFakeTimers();
    try {
      const mockFiles = {
        put: vi.fn().mockImplementation(() => new Promise(() => {})),
      };
      const mockEnv = { FILES: mockFiles };
      const buffer = new ArrayBuffer(512);

      const promise = uploadFileToR2(mockEnv, 'user-1', 'doc.pdf', 'application/pdf', buffer);

      vi.advanceTimersByTime(16_000);

      const err = await promise.catch((e) => e);
      expect(err.message).toBe('R2 upload failed: R2 upload timed out');
      expect(err.cause).toBeInstanceOf(Error);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ─────────── deleteFileFromR2 ─────────── */

describe('deleteFileFromR2', () => {
  it('deletes file from R2', async () => {
    const mockFiles = {
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const mockEnv = { FILES: mockFiles };

    await deleteFileFromR2(mockEnv, '/user/user-1/files/doc-id.pdf');
    expect(mockFiles.delete).toHaveBeenCalledWith('/user/user-1/files/doc-id.pdf');
  });

  it('returns early when FILES binding missing', async () => {
    const mockEnv = {};
    await deleteFileFromR2(mockEnv, 'key-1');
    expect(loggerMocks.error).not.toHaveBeenCalled();
  });

  it('logs error when delete fails without throwing', async () => {
    const mockFiles = {
      delete: vi.fn().mockRejectedValue(new Error('delete failed')),
    };
    const mockEnv = { FILES: mockFiles };

    await deleteFileFromR2(mockEnv, 'key-1');

    expect(loggerMocks.error).toHaveBeenCalledWith('Failed to delete R2 object', {
      r2Key: 'key-1',
      error: 'delete failed',
    });
  });

  it('handles undefined rejection in delete without crashing', async () => {
    const mockFiles = {
      delete: vi.fn().mockRejectedValue(undefined),
    };
    const mockEnv = { FILES: mockFiles };

    await deleteFileFromR2(mockEnv, 'key-1');

    expect(loggerMocks.error).toHaveBeenCalledWith('Failed to delete R2 object', {
      r2Key: 'key-1',
      error: undefined,
    });
  });
});

/* ─────────── storeFileMetadata ─────────── */

describe('storeFileMetadata', () => {
  it('inserts document and returns UUID documentId', async () => {
    const mockDb = { run: vi.fn().mockResolvedValue(undefined) };
    const metadata = {
      userId: 'user-1',
      chatId: 'chat-1',
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      fileSize: 1024,
      r2Key: '/user/user-1/files/doc-id.pdf',
      r2Url: 'https://r2.example.com/user/user-1/files/doc-id.pdf',
    };

    const result = await storeFileMetadata(mockDb, metadata);

    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(mockDb.run).toHaveBeenCalledOnce();
    const [sql, params] = mockDb.run.mock.calls[0];
    expect(sql).toContain('INSERT INTO documents');
    expect(params[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(params.slice(1)).toEqual([
      'user-1',
      'chat-1',
      'doc.pdf',
      'application/pdf',
      1024,
      '/user/user-1/files/doc-id.pdf',
      'https://r2.example.com/user/user-1/files/doc-id.pdf',
    ]);
  });

  it('passes null chatId when omitted', async () => {
    const mockDb = { run: vi.fn().mockResolvedValue(undefined) };
    const metadata = {
      userId: 'user-1',
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      fileSize: 1024,
      r2Key: 'key',
      r2Url: 'url',
    };

    await storeFileMetadata(mockDb, metadata);
    const [, params] = mockDb.run.mock.calls[0];
    expect(params[2]).toBeNull();
    expect(params.slice(1, 2)).toEqual(['user-1']);
    expect(params.slice(3)).toEqual(['doc.pdf', 'application/pdf', 1024, 'key', 'url']);
  });
});

/* ─────────── getFileMetadata ─────────── */

describe('getFileMetadata', () => {
  it('returns document by id', async () => {
    const doc = { id: 'doc-1', filename: 'doc.pdf' };
    const mockDb = { first: vi.fn().mockResolvedValue(doc) };

    const result = await getFileMetadata(mockDb, 'doc-1');

    expect(result).toEqual(doc);
    expect(mockDb.first).toHaveBeenCalledWith('SELECT * FROM documents WHERE id = ?', ['doc-1']);
  });

  it('returns undefined when not found', async () => {
    const mockDb = { first: vi.fn().mockResolvedValue(undefined) };
    const result = await getFileMetadata(mockDb, 'nonexistent');
    expect(result).toBeUndefined();
  });
});

/* ─────────── getOwnedDocument ─────────── */

describe('getOwnedDocument', () => {
  it('returns document owned by user', async () => {
    const doc = { id: 'doc-1', user_id: 'user-1' };
    const mockDb = { first: vi.fn().mockResolvedValue(doc) };

    const result = await getOwnedDocument(mockDb, 'doc-1', 'user-1');

    expect(result).toEqual(doc);
    expect(mockDb.first).toHaveBeenCalledWith(
      'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      ['doc-1', 'user-1']
    );
  });

  it('returns undefined when doc belongs to different user', async () => {
    const mockDb = { first: vi.fn().mockResolvedValue(undefined) };
    const result = await getOwnedDocument(mockDb, 'doc-1', 'other-user');
    expect(result).toBeUndefined();
  });
});

/* ─────────── requireOwnedDocument ─────────── */

describe('requireOwnedDocument', () => {
  it('returns doc when owned', async () => {
    const doc = { id: 'doc-1', user_id: 'user-1' };
    const mockDb = { first: vi.fn().mockResolvedValue(doc) };
    const req = new Request('https://example.com/api/files/doc-1');

    const result = await requireOwnedDocument(req, mockDb, 'doc-1', 'user-1');

    expect(result.error).toBeUndefined();
    expect(result.doc).toEqual(doc);
  });

  it('returns 404 error when not found', async () => {
    const mockDb = { first: vi.fn().mockResolvedValue(undefined) };
    const req = new Request('https://example.com/api/files/doc-1');

    const result = await requireOwnedDocument(req, mockDb, 'doc-1', 'user-1');

    expect(result.error).toBeDefined();
    const json = await result.error.json();
    expect(result.error.status).toBe(404);
    expect(json.error).toBe('Document not found');
  });
});

/* ─────────── listUserDocuments ─────────── */

describe('listUserDocuments', () => {
  it('returns paginated documents for user', async () => {
    const docs = [
      { id: 'doc-1', filename: 'a.pdf' },
      { id: 'doc-2', filename: 'b.pdf' },
    ];
    const mockDb = { all: vi.fn().mockResolvedValue(docs) };

    const result = await listUserDocuments(mockDb, 'user-1', 20, 0);

    expect(result).toEqual(docs);
    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toContain('WHERE user_id = ?');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql).toContain('LIMIT ? OFFSET ?');
    expect(params).toEqual(['user-1', 20, 0]);
  });

  it('uses default limit and offset', async () => {
    const mockDb = { all: vi.fn().mockResolvedValue([]) };

    await listUserDocuments(mockDb, 'user-1');

    const [, params] = mockDb.all.mock.calls[0];
    expect(params).toEqual(['user-1', 20, 0]);
  });
});

/* ─────────── deleteDocument ─────────── */

describe('deleteDocument', () => {
  it('deletes from both R2 and D1 when owned', async () => {
    const doc = { id: 'doc-1', r2_key: '/user/user-1/files/doc-id.pdf' };
    const mockDb = {
      first: vi.fn().mockResolvedValue(doc),
      run: vi.fn().mockResolvedValue(undefined),
    };
    const mockFiles = { delete: vi.fn().mockResolvedValue(undefined) };
    const mockEnv = { FILES: mockFiles };

    const result = await deleteDocument(mockEnv, mockDb, 'doc-1', 'user-1');

    expect(result).toBe(true);
    expect(mockFiles.delete).toHaveBeenCalledWith('/user/user-1/files/doc-id.pdf');
    expect(mockDb.run).toHaveBeenCalledWith('DELETE FROM documents WHERE id = ? AND user_id = ?', [
      'doc-1',
      'user-1',
    ]);
  });

  it('throws exact message when document not found', async () => {
    const mockDb = { first: vi.fn().mockResolvedValue(undefined) };
    const mockEnv = { FILES: { delete: vi.fn() } };

    await expect(deleteDocument(mockEnv, mockDb, 'doc-1', 'user-1')).rejects.toThrow(
      'Document not found'
    );
  });
});
