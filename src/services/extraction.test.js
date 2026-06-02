import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseDocument: vi.fn(),
}));

vi.mock('./parsers/index.js', () => ({
  parseDocument: (...args) => mocks.parseDocument(...args),
}));

import { extractDocumentText } from './extraction.js';

describe('extractDocumentText', () => {
  let db;
  let env;

  beforeEach(() => {
    db = { run: vi.fn().mockResolvedValue({ success: true }) };
    env = {};
    vi.clearAllMocks();
  });

  it('extracts text and stores excerpt on success', async () => {
    mocks.parseDocument.mockResolvedValue({
      text: 'Hello world this is a document with enough text to exceed the preview length',
    });

    const result = await extractDocumentText(env, db, 'doc-1', 'text/plain', new ArrayBuffer(0));

    expect(result.extractedText).toBe(
      'Hello world this is a document with enough text to exceed the preview length'
    );
    expect(result.excerptLength).toBe(
      'Hello world this is a document with enough text to exceed the preview length'.length
    );
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('extraction_status = 1'),
      expect.arrayContaining(['doc-1'])
    );
  });

  it('stores first 500 chars as excerpt', async () => {
    const longText = 'x'.repeat(800);
    mocks.parseDocument.mockResolvedValue({ text: longText });

    const result = await extractDocumentText(env, db, 'doc-2', 'text/plain', new ArrayBuffer(0));

    expect(result.excerptLength).toBe(500);
    expect(result.extractedText).toBe(longText);
    expect(db.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['x'.repeat(500), 'doc-2'])
    );
  });

  it('handles skipped extraction result', async () => {
    mocks.parseDocument.mockResolvedValue({
      skipped: true,
      reason: 'Image extraction not supported',
    });

    const result = await extractDocumentText(env, db, 'doc-3', 'image/png', new ArrayBuffer(0));

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Image extraction not supported');
    expect(result.extractedText).toBe('');
    expect(result.excerptLength).toBe(0);
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('extraction_status = -1'),
      expect.arrayContaining(['Image extraction not supported', 'doc-3'])
    );
  });

  it('uses default reason when skipped without reason', async () => {
    mocks.parseDocument.mockResolvedValue({ skipped: true });

    const result = await extractDocumentText(env, db, 'doc-4', 'image/png', new ArrayBuffer(0));

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Document extraction skipped');
  });

  it('throws and marks as failed when extraction returns empty text', async () => {
    mocks.parseDocument.mockResolvedValue({ text: '' });

    await expect(
      extractDocumentText(env, db, 'doc-5', 'text/plain', new ArrayBuffer(0))
    ).rejects.toThrow('Document extraction resulted in empty text');

    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('extraction_status = -1'),
      expect.arrayContaining(['Document extraction resulted in empty text', 'doc-5'])
    );
  });

  it('throws and marks as failed when extraction returns whitespace-only text', async () => {
    mocks.parseDocument.mockResolvedValue({ text: '   \n\t  ' });

    await expect(
      extractDocumentText(env, db, 'doc-6', 'text/plain', new ArrayBuffer(0))
    ).rejects.toThrow('Document extraction resulted in empty text');
  });

  it('throws and marks as failed on parser error', async () => {
    mocks.parseDocument.mockRejectedValue(new Error('Parser crashed'));

    await expect(
      extractDocumentText(env, db, 'doc-7', 'text/plain', new ArrayBuffer(0))
    ).rejects.toThrow('Parser crashed');

    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('extraction_status = -1'),
      expect.arrayContaining(['Parser crashed', 'doc-7'])
    );
  });

  it('handles null text from parser as empty text error', async () => {
    mocks.parseDocument.mockResolvedValue({ text: null });

    await expect(
      extractDocumentText(env, db, 'doc-8', 'text/plain', new ArrayBuffer(0))
    ).rejects.toThrow('Document extraction resulted in empty text');
  });
});
