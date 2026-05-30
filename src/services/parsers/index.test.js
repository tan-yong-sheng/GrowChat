import { describe, expect, it } from 'vitest';
import {
  listDocumentParsers,
  selectDocumentParser,
  parseDocument,
  isTextLikeContentType,
} from './index.js';

describe('parsers', () => {
  describe('listDocumentParsers', () => {
    it('returns all registered parsers', () => {
      const parsers = listDocumentParsers();
      expect(parsers).toHaveLength(3);
      const ids = parsers.map((p) => p.id).sort();
      expect(ids).toEqual(['image', 'pdf', 'text']);
    });

    it('each parser has id, label, and accepts', () => {
      const parsers = listDocumentParsers();
      for (const p of parsers) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('label');
        expect(p).toHaveProperty('accepts');
      }
    });
  });

  describe('selectDocumentParser', () => {
    it('selects text parser for text/plain', () => {
      const parser = selectDocumentParser('text/plain');
      expect(parser?.id).toBe('text');
    });

    it('selects text parser for application/json', () => {
      const parser = selectDocumentParser('application/json');
      expect(parser?.id).toBe('text');
    });

    it('selects image parser for image/png', () => {
      const parser = selectDocumentParser('image/png');
      expect(parser?.id).toBe('image');
    });

    it('selects pdf parser for application/pdf', () => {
      const parser = selectDocumentParser('application/pdf');
      expect(parser?.id).toBe('pdf');
    });

    it('returns null for unknown content type', () => {
      expect(selectDocumentParser('application/unknown')).toBeNull();
    });

    it('returns null for empty content type', () => {
      expect(selectDocumentParser('')).toBeNull();
    });

    it('returns null for null content type', () => {
      expect(selectDocumentParser(null)).toBeNull();
    });
  });

  describe('parseDocument', () => {
    it('parses text content', async () => {
      const buffer = new TextEncoder().encode('hello world');
      const result = await parseDocument(null, {
        contentType: 'text/plain',
        buffer,
        filename: 'test.txt',
      });
      expect(result.text).toBe('hello world');
    });

    it('skips image content', async () => {
      const result = await parseDocument(null, {
        contentType: 'image/png',
        buffer: new Uint8Array(0),
        filename: 'test.png',
      });
      expect(result.skipped).toBe(true);
    });

    it('skips pdf content', async () => {
      const result = await parseDocument(null, {
        contentType: 'application/pdf',
        buffer: new Uint8Array(0),
        filename: 'test.pdf',
      });
      expect(result.skipped).toBe(true);
    });

    it('skips unsupported content types', async () => {
      const result = await parseDocument(null, {
        contentType: 'application/unknown',
        buffer: new Uint8Array(0),
        filename: 'test.xyz',
      });
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('Unsupported');
    });
  });

  describe('isTextLikeContentType', () => {
    it('returns true for text/* types', () => {
      expect(isTextLikeContentType('text/plain')).toBe(true);
      expect(isTextLikeContentType('text/csv')).toBe(true);
      expect(isTextLikeContentType('text/html')).toBe(true);
    });

    it('returns true for known application types', () => {
      expect(isTextLikeContentType('application/json')).toBe(true);
      expect(isTextLikeContentType('application/xml')).toBe(true);
      expect(isTextLikeContentType('application/javascript')).toBe(true);
    });

    it('returns false for non-text types', () => {
      expect(isTextLikeContentType('image/png')).toBe(false);
      expect(isTextLikeContentType('application/pdf')).toBe(false);
      expect(isTextLikeContentType('video/mp4')).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(isTextLikeContentType('')).toBe(false);
      expect(isTextLikeContentType(null)).toBe(false);
      expect(isTextLikeContentType(undefined)).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isTextLikeContentType('Text/Plain')).toBe(true);
      expect(isTextLikeContentType('APPLICATION/JSON')).toBe(true);
    });
  });
});
