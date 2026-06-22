import { describe, expect, it, vi, beforeEach } from 'vitest';
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

vi.mock('../utils/logger.js', () => ({
  createRootLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('validateFile', () => {
  it('accepts valid text file', () => {
    const result = validateFile('test.txt', 'text/plain', 1024);
    expect(result.valid).toBe(true);
  });

  it('accepts valid image', () => {
    const result = validateFile('photo.png', 'image/png', 1024);
    expect(result.valid).toBe(true);
  });

  it('accepts valid PDF', () => {
    const result = validateFile('doc.pdf', 'application/pdf', 1024);
    expect(result.valid).toBe(true);
  });

  it('rejects file size over 50MB', () => {
    const result = validateFile('big.txt', 'text/plain', 51 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds 50MB');
  });

  it('rejects unsupported content type', () => {
    const result = validateFile('file.exe', 'application/octet-stream', 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
  });

  it('rejects unknown file type with empty contentType', () => {
    const result = validateFile('file', '', 1024);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid filename', () => {
    const result = validateFile('', 'text/plain', 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid filename');
  });

  it('rejects filename over 255 chars', () => {
    const result = validateFile('a'.repeat(256), 'text/plain', 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid filename');
  });

  it('accepts exactly 50MB', () => {
    const result = validateFile('file.txt', 'text/plain', 50 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });

  it('accepts text-like types', () => {
    expect(validateFile('data.csv', 'application/csv', 1024).valid).toBe(true);
    expect(validateFile('data.json', 'application/json', 1024).valid).toBe(true);
    expect(validateFile('data.xml', 'application/xml', 1024).valid).toBe(true);
    expect(validateFile('data.yaml', 'application/yaml', 1024).valid).toBe(true);
    expect(validateFile('script.js', 'application/javascript', 1024).valid).toBe(true);
    expect(validateFile('script.ts', 'application/typescript', 1024).valid).toBe(true);
    expect(validateFile('data.json5', 'application/json5', 1024).valid).toBe(true);
    expect(validateFile('data.ndjson', 'application/ndjson', 1024).valid).toBe(true);
  });

  it('normalizes content type to lowercase', () => {
    expect(validateFile('photo.PNG', 'IMAGE/PNG', 1024).valid).toBe(true);
  });

  it('accepts json5 alias types', () => {
    expect(validateFile('data.json5', 'application/x-json5', 1024).valid).toBe(true);
  });

  it('accepts ndjson alias types', () => {
    expect(validateFile('data.ndjson', 'application/x-ndjson', 1024).valid).toBe(true);
  });

  it('accepts yaml alias types', () => {
    expect(validateFile('data.yml', 'application/x-yaml', 1024).valid).toBe(true);
  });

  it('accepts xml alias types', () => {
    expect(validateFile('data.xml', 'application/x-xml', 1024).valid).toBe(true);
  });

  it('accepts iif type', () => {
    expect(validateFile('data.iif', 'application/x-iif', 1024).valid).toBe(true);
  });

  it('rejects zero-byte file', () => {
    expect(validateFile('empty.txt', 'text/plain', 0).valid).toBe(true);
  });

  it('handles null contentType', () => {
    const result = validateFile('file.txt', null, 1024);
    expect(result.valid).toBe(false);
  });
});

describe('inferContentTypeFromFilename', () => {
  it('infers from filename', () => {
    expect(inferContentTypeFromFilename('file.txt')).toBe('text/plain');
    expect(inferContentTypeFromFilename('image.png')).toBe('image/png');
  });
});

describe('resolveContentType', () => {
  it('returns explicit content type when provided', () => {
    expect(resolveContentType('file.txt', 'text/html')).toBe('text/html');
  });

  it('returns explicit with whitespace trimmed', () => {
    expect(resolveContentType('file.txt', '  text/html  ')).toBe('text/html');
  });

  it('infers from filename when contentType is empty', () => {
    expect(resolveContentType('file.txt', '')).toBe('text/plain');
    expect(resolveContentType('image.png', '')).toBe('image/png');
  });

  it('returns octet-stream when nothing can be inferred', () => {
    expect(resolveContentType('file.unknown', '')).toBe('application/octet-stream');
    expect(resolveContentType('file', '')).toBe('application/octet-stream');
  });

  it('handles null contentType', () => {
    expect(resolveContentType('file.txt', null)).toBe('text/plain');
    expect(resolveContentType('file.unknown', null)).toBe('application/octet-stream');
  });
});

describe('uploadFileToR2', () => {
  const mockPut = vi.fn();
  const env = { FILES: { put: mockPut } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads file successfully', async () => {
    mockPut.mockResolvedValue({ id: 'obj-1' });
    const buffer = new ArrayBuffer(8);
    const result = await uploadFileToR2(env, 'user-1', 'test.txt', 'text/plain', buffer);
    expect(result.r2Key).toMatch(/^\/user\/user-1\/files\/.*\.txt$/);
    expect(result.r2Url).toContain(result.r2Key);
    expect(result.objectId).toBe('obj-1');
  });

  it('throws when R2 binding is missing', async () => {
    await expect(
      uploadFileToR2({}, 'user-1', 'test.txt', 'text/plain', new ArrayBuffer(8))
    ).rejects.toThrow('R2 binding not configured');
  });

  it('throws on R2 put failure', async () => {
    mockPut.mockRejectedValue(new Error('network error'));
    await expect(
      uploadFileToR2(env, 'user-1', 'test.txt', 'text/plain', new ArrayBuffer(8))
    ).rejects.toThrow('R2 upload failed');
  });

  it('uses correct extension based on content type', async () => {
    mockPut.mockResolvedValue({ id: 'obj-1' });
    const tests = [
      ['image/png', 'png'],
      ['application/pdf', 'pdf'],
      ['application/json', 'json'],
      ['text/plain', 'txt'],
      ['text/markdown', 'md'],
      ['text/csv', 'csv'],
      ['text/tsv', 'tsv'],
      ['application/json5', 'json5'],
      ['application/x-ndjson', 'ndjson'],
      ['image/jpeg', 'jpg'],
      ['image/webp', 'webp'],
    ];
    for (const [contentType, expectedExt] of tests) {
      const result = await uploadFileToR2(env, 'u1', 'file', contentType, new ArrayBuffer(4));
      expect(result.r2Key).toMatch(new RegExp(`\\.${expectedExt}$`));
    }
  });

  it('falls back to bin extension for unknown types', async () => {
    mockPut.mockResolvedValue({ id: 'obj-1' });
    const result = await uploadFileToR2(
      env,
      'u1',
      'file',
      'application/unknown',
      new ArrayBuffer(4)
    );
    expect(result.r2Key).toMatch(/\.bin$/);
  });

  it('falls back to txt for generic text types', async () => {
    mockPut.mockResolvedValue({ id: 'obj-1' });
    const result = await uploadFileToR2(env, 'u1', 'file', 'text/x-custom', new ArrayBuffer(4));
    expect(result.r2Key).toMatch(/\.txt$/);
  });
});

describe('deleteFileFromR2', () => {
  it('deletes file successfully', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const env = { FILES: { delete: mockDelete } };
    await deleteFileFromR2(env, 'key-1');
    expect(mockDelete).toHaveBeenCalledWith('key-1');
  });

  it('returns silently when R2 binding is missing', async () => {
    await expect(deleteFileFromR2({}, 'key-1')).resolves.toBeUndefined();
  });

  it('returns silently when delete fails', async () => {
    const mockDelete = vi.fn().mockRejectedValue(new Error('fail'));
    const env = { FILES: { delete: mockDelete } };
    await expect(deleteFileFromR2(env, 'key-1')).resolves.toBeUndefined();
  });
});

describe('storeFileMetadata', () => {
  it('stores metadata and returns documentId', async () => {
    const dbRun = vi.fn().mockResolvedValue({ meta: { last_row_id: 1 } });
    const db = { run: dbRun };
    const id = await storeFileMetadata(db, {
      userId: 'u1',
      chatId: 'c1',
      filename: 'test.txt',
      contentType: 'text/plain',
      fileSize: 1024,
      r2Key: '/user/u1/files/test.txt',
      r2Url: 'https://r2.example.com/user/u1/files/test.txt',
    });
    expect(id).toBeTruthy();
    expect(dbRun).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO documents'),
      expect.arrayContaining(['u1', 'c1', 'test.txt'])
    );
  });

  it('stores metadata without chatId', async () => {
    const dbRun = vi.fn().mockResolvedValue({ meta: {} });
    const db = { run: dbRun };
    const id = await storeFileMetadata(db, {
      userId: 'u1',
      filename: 'test.txt',
      contentType: 'text/plain',
      fileSize: 1024,
      r2Key: 'key',
      r2Url: 'url',
    });
    expect(id).toBeTruthy();
    expect(dbRun).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([null]));
  });
});

describe('getFileMetadata', () => {
  it('returns document via db.first', async () => {
    const doc = { id: 'd1', filename: 'test.txt' };
    const db = { first: vi.fn().mockResolvedValue(doc) };
    const result = await getFileMetadata(db, 'd1');
    expect(db.first).toHaveBeenCalledWith('SELECT * FROM documents WHERE id = ?', ['d1']);
    expect(result).toEqual(doc);
  });
});

describe('getOwnedDocument', () => {
  it('returns owned document', async () => {
    const doc = { id: 'd1', user_id: 'u1' };
    const db = { first: vi.fn().mockResolvedValue(doc) };
    const result = await getOwnedDocument(db, 'd1', 'u1');
    expect(db.first).toHaveBeenCalledWith('SELECT * FROM documents WHERE id = ? AND user_id = ?', [
      'd1',
      'u1',
    ]);
    expect(result).toEqual(doc);
  });
});

describe('requireOwnedDocument', () => {
  it('returns doc when found', async () => {
    const doc = { id: 'd1', user_id: 'u1' };
    const db = { first: vi.fn().mockResolvedValue(doc) };
    const req = new Request('https://example.com');
    const result = await requireOwnedDocument(req, db, 'd1', 'u1');
    expect(result.doc).toEqual(doc);
    expect(result.error).toBeUndefined();
  });

  it('returns error when not found', async () => {
    const db = { first: vi.fn().mockResolvedValue(null) };
    const req = new Request('https://example.com');
    const result = await requireOwnedDocument(req, db, 'd1', 'u1');
    expect(result.error).toBeTruthy();
    expect(result.error.status).toBe(404);
    expect(result.doc).toBeUndefined();
  });
});

describe('listUserDocuments', () => {
  it('lists documents with pagination', async () => {
    const docs = { results: [{ id: 'd1' }, { id: 'd2' }] };
    const db = { all: vi.fn().mockResolvedValue(docs) };
    const result = await listUserDocuments(db, 'u1', 10, 0);
    expect(db.all).toHaveBeenCalledWith(expect.stringContaining('LIMIT ? OFFSET ?'), ['u1', 10, 0]);
    expect(result).toEqual(docs);
  });

  it('uses default limit and offset', async () => {
    const db = { all: vi.fn().mockResolvedValue({ results: [] }) };
    await listUserDocuments(db, 'u1');
    expect(db.all).toHaveBeenCalledWith(expect.any(String), ['u1', 20, 0]);
  });
});

describe('deleteDocument', () => {
  it('deletes document and R2 file', async () => {
    const doc = { id: 'd1', r2_key: 'key-1', user_id: 'u1' };
    const db = {
      first: vi.fn().mockResolvedValue(doc),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    };
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const env = { FILES: { delete: mockDelete } };
    const result = await deleteDocument(env, db, 'd1', 'u1');
    expect(result).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith('key-1');
    expect(db.run).toHaveBeenCalledWith('DELETE FROM documents WHERE id = ? AND user_id = ?', [
      'd1',
      'u1',
    ]);
  });

  it('throws when document not found', async () => {
    const db = { first: vi.fn().mockResolvedValue(null) };
    await expect(deleteDocument({}, db, 'd1', 'u1')).rejects.toThrow('Document not found');
  });
});
