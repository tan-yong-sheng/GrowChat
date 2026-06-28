import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockParseDocument = vi.fn();

vi.mock('./parsers/index.js', () => ({
  parseDocument: (...args) => mockParseDocument(...args),
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  createRootLogger: () => mockLogger,
}));

import { extractDocumentText } from './extraction.js';

describe('extractDocumentText', () => {
  let db;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger.error.mockClear();
    db = {
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    };
  });

  it('extracts text successfully and updates document status', async () => {
    mockParseDocument.mockResolvedValue({ text: 'Hello world' });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd1',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(8),
    });

    expect(result).toEqual({
      extractedText: 'Hello world',
      excerptLength: 11,
    });
    expect(db.run).toHaveBeenCalledTimes(1);
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = 1, text_excerpt = ?, updated_at = unixepoch()\n     WHERE id = ?',
      ['Hello world', 'd1']
    );
    expect(mockParseDocument).toHaveBeenCalledWith(
      {},
      {
        contentType: 'text/plain',
        buffer: expect.any(ArrayBuffer),
      }
    );
  });

  it('truncates excerpt to 500 characters for long text', async () => {
    const longText = 'a'.repeat(1000);
    mockParseDocument.mockResolvedValue({ text: longText });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd2',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(8),
    });

    expect(result).toEqual({
      extractedText: longText,
      excerptLength: 500,
    });
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = 1, text_excerpt = ?, updated_at = unixepoch()\n     WHERE id = ?',
      [longText.slice(0, 500), 'd2']
    );
  });

  it('handles text exactly 500 characters without truncation', async () => {
    const exact500 = 'b'.repeat(500);
    mockParseDocument.mockResolvedValue({ text: exact500 });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd3',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(4),
    });

    expect(result.excerptLength).toBe(500);
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = 1, text_excerpt = ?, updated_at = unixepoch()\n     WHERE id = ?',
      [exact500, 'd3']
    );
  });

  it('skips extraction with explicit reason', async () => {
    mockParseDocument.mockResolvedValue({ skipped: true, reason: 'Unsupported format' });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd4',
      contentType: 'application/octet-stream',
      buffer: new ArrayBuffer(8),
    });

    expect(result).toEqual({
      extractedText: '',
      excerptLength: 0,
      skipped: true,
      reason: 'Unsupported format',
    });
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = -1, extraction_error = ?, updated_at = unixepoch()\n     WHERE id = ?',
      ['Unsupported format', 'd4']
    );
  });

  it('skips extraction with default reason when none provided', async () => {
    mockParseDocument.mockResolvedValue({ skipped: true });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd5',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(8),
    });

    expect(result).toEqual({
      extractedText: '',
      excerptLength: 0,
      skipped: true,
      reason: 'Document extraction skipped',
    });
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = -1, extraction_error = ?, updated_at = unixepoch()\n     WHERE id = ?',
      ['Document extraction skipped', 'd5']
    );
  });

  it('uses default reason when reason is empty string', async () => {
    mockParseDocument.mockResolvedValue({ skipped: true, reason: '' });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd6',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(8),
    });

    expect(result.reason).toBe('Document extraction skipped');
  });

  it('uses default reason when reason is null', async () => {
    mockParseDocument.mockResolvedValue({ skipped: true, reason: null });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd7',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(8),
    });

    expect(result.reason).toBe('Document extraction skipped');
  });

  it('treats skipped: false as normal text path', async () => {
    mockParseDocument.mockResolvedValue({ skipped: false, text: 'not skipped' });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd8',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(8),
    });

    expect(result.extractedText).toBe('not skipped');
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('extraction_status = 1'),
      expect.anything()
    );
  });

  it('treats skipped: undefined as normal text path', async () => {
    mockParseDocument.mockResolvedValue({ skipped: undefined, text: 'valid text' });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd9',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(8),
    });

    expect(result.extractedText).toBe('valid text');
  });

  it('treats skipped: 0 as normal text path', async () => {
    mockParseDocument.mockResolvedValue({ skipped: 0, text: 'zero skipped' });

    const result = await extractDocumentText({
      env: {},
      db,
      documentId: 'd10',
      contentType: 'text/plain',
      buffer: new ArrayBuffer(8),
    });

    expect(result.extractedText).toBe('zero skipped');
  });

  it('throws when extracted text is empty string', async () => {
    mockParseDocument.mockResolvedValue({ text: '' });

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd11',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('Document extraction resulted in empty text');

    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = -1, extraction_error = ? WHERE id = ?',
      ['Document extraction resulted in empty text', 'd11']
    );
  });

  it('throws when extracted text is whitespace only', async () => {
    mockParseDocument.mockResolvedValue({ text: '   \n\t  ' });

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd12',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('Document extraction resulted in empty text');
  });

  it('throws when parseDocument returns null', async () => {
    mockParseDocument.mockResolvedValue(null);

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd13',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('Document extraction resulted in empty text');
  });

  it('throws when parseDocument returns undefined', async () => {
    mockParseDocument.mockResolvedValue(undefined);

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd14',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('Document extraction resulted in empty text');
  });

  it('throws when parseDocument returns object without text property', async () => {
    mockParseDocument.mockResolvedValue({ other: 'field', meta: true });

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd15',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('Document extraction resulted in empty text');
  });

  it('throws when parseDocument returns object with null text', async () => {
    mockParseDocument.mockResolvedValue({ text: null });

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd16',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('Document extraction resulted in empty text');
  });

  it('forwards error and marks extraction failed when parseDocument throws Error', async () => {
    mockParseDocument.mockRejectedValue(new Error('parse error'));

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd17',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('parse error');

    expect(mockLogger.error).toHaveBeenCalledWith('Document extraction failed', {
      documentId: 'd17',
      error: 'parse error',
    });
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = -1, extraction_error = ? WHERE id = ?',
      ['parse error', 'd17']
    );
  });

  it('handles non-Error string throw from parseDocument', async () => {
    mockParseDocument.mockRejectedValue('string error');

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd18',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toBe('string error');

    expect(mockLogger.error).toHaveBeenCalledWith('Document extraction failed', {
      documentId: 'd18',
      error: 'string error',
    });
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = -1, extraction_error = ? WHERE id = ?',
      [undefined, 'd18']
    );
  });

  it('handles non-Error number throw from parseDocument', async () => {
    mockParseDocument.mockRejectedValue(42);

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd19',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toBe(42);

    expect(mockLogger.error).toHaveBeenCalledWith('Document extraction failed', {
      documentId: 'd19',
      error: 42,
    });
  });

  it('handles object throw from parseDocument', async () => {
    mockParseDocument.mockRejectedValue({ custom: 'error' });

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd20',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toEqual({ custom: 'error' });

    expect(mockLogger.error).toHaveBeenCalledWith('Document extraction failed', {
      documentId: 'd20',
      error: { custom: 'error' },
    });
  });

  it('handles null throw from parseDocument by propagating TypeError from err.message access', async () => {
    mockParseDocument.mockRejectedValue(null);

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd21',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow(TypeError);

    expect(mockLogger.error).toHaveBeenCalledWith('Document extraction failed', {
      documentId: 'd21',
      error: null,
    });
    expect(db.run).not.toHaveBeenCalled();
  });

  it('handles undefined throw from parseDocument by propagating TypeError from err.message access', async () => {
    mockParseDocument.mockRejectedValue(undefined);

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd22',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow(TypeError);

    expect(mockLogger.error).toHaveBeenCalledWith('Document extraction failed', {
      documentId: 'd22',
      error: undefined,
    });
    expect(db.run).not.toHaveBeenCalled();
  });

  it('handles db.run failure during markExtractionSuccess and then calls markExtractionFailed', async () => {
    mockParseDocument.mockResolvedValue({ text: 'Hello world' });
    db.run.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd23',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('DB write failed');

    expect(mockLogger.error).toHaveBeenCalledWith('Document extraction failed', {
      documentId: 'd23',
      error: 'DB write failed',
    });
    expect(db.run).toHaveBeenCalledTimes(2);
    expect(db.run).toHaveBeenNthCalledWith(
      1,
      'UPDATE documents SET extraction_status = 1, text_excerpt = ?, updated_at = unixepoch()\n     WHERE id = ?',
      ['Hello world', 'd23']
    );
    expect(db.run).toHaveBeenNthCalledWith(
      2,
      'UPDATE documents SET extraction_status = -1, extraction_error = ? WHERE id = ?',
      ['DB write failed', 'd23']
    );
  });

  it('handles db.run failure during markExtractionFailed', async () => {
    mockParseDocument.mockRejectedValue(new Error('parse error'));
    db.run.mockRejectedValueOnce(new Error('DB persist failed'));

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd24',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('DB persist failed');

    expect(db.run).toHaveBeenCalledTimes(1);
    // markExtractionFailed is called with the ORIGINAL error message, not the DB failure
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE documents SET extraction_status = -1, extraction_error = ? WHERE id = ?',
      ['parse error', 'd24']
    );
  });

  it('handles db.run failure during handleSkippedExtraction', async () => {
    mockParseDocument.mockResolvedValue({ skipped: true, reason: 'Unsupported' });
    db.run.mockRejectedValueOnce(new Error('DB skip failed'));

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd25',
        contentType: 'application/pdf',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toThrow('DB skip failed');
  });

  it('handles empty buffer', async () => {
    mockParseDocument.mockResolvedValue({ text: '' });

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd26',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(0),
      })
    ).rejects.toThrow('Document extraction resulted in empty text');
  });

  it('handles false throw from parseDocument', async () => {
    mockParseDocument.mockRejectedValue(false);

    await expect(
      extractDocumentText({
        env: {},
        db,
        documentId: 'd27',
        contentType: 'text/plain',
        buffer: new ArrayBuffer(8),
      })
    ).rejects.toBe(false);

    expect(mockLogger.error).toHaveBeenCalledWith('Document extraction failed', {
      documentId: 'd27',
      error: false,
    });
  });
});
