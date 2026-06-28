import { describe, expect, it } from 'vitest';
import { inferContentType, MIME_MAP } from './mime-types.js';

describe('mime-types', () => {
  describe('MIME_MAP', () => {
    it('is a non-empty object', () => {
      expect(MIME_MAP).toBeDefined();
      expect(Object.keys(MIME_MAP).length).toBeGreaterThan(0);
    });

    it('contains common image types', () => {
      expect(MIME_MAP.png).toBe('image/png');
      expect(MIME_MAP.jpg).toBe('image/jpeg');
      expect(MIME_MAP.jpeg).toBe('image/jpeg');
      expect(MIME_MAP.webp).toBe('image/webp');
      expect(MIME_MAP.gif).toBe('image/gif');
    });

    it('contains document types', () => {
      expect(MIME_MAP.pdf).toBe('application/pdf');
      expect(MIME_MAP.txt).toBe('text/plain');
      expect(MIME_MAP.md).toBe('text/markdown');
      expect(MIME_MAP.csv).toBe('text/csv');
      expect(MIME_MAP.tsv).toBe('text/tsv');
    });

    it('contains data/config types', () => {
      expect(MIME_MAP.json).toBe('application/json');
      expect(MIME_MAP.json5).toBe('application/json5');
      expect(MIME_MAP.ndjson).toBe('application/x-ndjson');
      expect(MIME_MAP.yml).toBe('application/yaml');
      expect(MIME_MAP.yaml).toBe('application/yaml');
      expect(MIME_MAP.xml).toBe('application/xml');
    });

    it('contains code types', () => {
      expect(MIME_MAP.js).toBe('application/javascript');
      expect(MIME_MAP.ts).toBe('application/typescript');
      expect(MIME_MAP.html).toBe('text/html');
      expect(MIME_MAP.css).toBe('text/css');
      expect(MIME_MAP.py).toBe('text/x-python');
    });
  });

  describe('inferContentType', () => {
    it('infers type from filename with extension', () => {
      expect(inferContentType('photo.png')).toBe('image/png');
      expect(inferContentType('document.pdf')).toBe('application/pdf');
      expect(inferContentType('data.json')).toBe('application/json');
    });

    it('infers type from bare extension (no dot)', () => {
      expect(inferContentType('png')).toBe('image/png');
      expect(inferContentType('json')).toBe('application/json');
    });

    it('handles multi-dot filenames (uses last segment)', () => {
      expect(inferContentType('archive.tar.gz')).toBe(''); // .gz not in map
      expect(inferContentType('photo.backup.png')).toBe('image/png');
    });

    it('is case-insensitive', () => {
      expect(inferContentType('photo.PNG')).toBe('image/png');
      expect(inferContentType('Photo.JpG')).toBe('image/jpeg');
      expect(inferContentType('DATA.JSON')).toBe('application/json');
    });

    it('returns empty string for unknown extension', () => {
      expect(inferContentType('file.xyz')).toBe('');
    });

    it('returns empty string for empty string input', () => {
      expect(inferContentType('')).toBe('');
    });

    it('returns empty string for null', () => {
      expect(inferContentType(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(inferContentType(undefined)).toBe('');
    });

    it('handles filename with only a dot', () => {
      expect(inferContentType('.')).toBe('');
    });

    it('handles filename ending with dot', () => {
      expect(inferContentType('file.')).toBe('');
    });

    it('handles numeric filename with extension', () => {
      expect(inferContentType('123.json')).toBe('application/json');
    });

    it('handles whitespace-padded extension via bare extension', () => {
      // " png" -> ext " png" not in map (whitespace matters in keys)
      expect(inferContentType(' png')).toBe('');
    });
  });
});
