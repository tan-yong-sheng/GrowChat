import { describe, expect, it } from 'vitest';
import { inferContentType, MIME_MAP } from './mime-types.js';

describe('MIME_MAP', () => {
  it('is a plain object with exactly 21 entries', () => {
    expect(Object.keys(MIME_MAP)).toHaveLength(21);
    expect(Object.keys(MIME_MAP).every((k) => typeof k === 'string')).toBe(true);
  });

  it('contains all expected image mappings', () => {
    expect(MIME_MAP.png).toBe('image/png');
    expect(MIME_MAP.jpg).toBe('image/jpeg');
    expect(MIME_MAP.jpeg).toBe('image/jpeg');
    expect(MIME_MAP.webp).toBe('image/webp');
    expect(MIME_MAP.gif).toBe('image/gif');
  });

  it('contains all expected document/text mappings', () => {
    expect(MIME_MAP.pdf).toBe('application/pdf');
    expect(MIME_MAP.txt).toBe('text/plain');
    expect(MIME_MAP.md).toBe('text/markdown');
    expect(MIME_MAP.csv).toBe('text/csv');
    expect(MIME_MAP.tsv).toBe('text/tsv');
    expect(MIME_MAP.html).toBe('text/html');
    expect(MIME_MAP.css).toBe('text/css');
  });

  it('contains all expected data format mappings', () => {
    expect(MIME_MAP.json).toBe('application/json');
    expect(MIME_MAP.json5).toBe('application/json5');
    expect(MIME_MAP.ndjson).toBe('application/x-ndjson');
    expect(MIME_MAP.yml).toBe('application/yaml');
    expect(MIME_MAP.yaml).toBe('application/yaml');
    expect(MIME_MAP.xml).toBe('application/xml');
  });

  it('contains all expected code/script mappings', () => {
    expect(MIME_MAP.js).toBe('application/javascript');
    expect(MIME_MAP.ts).toBe('application/typescript');
    expect(MIME_MAP.py).toBe('text/x-python');
  });
});

describe('inferContentType', () => {
  describe('from filename with extension', () => {
    it('infers image types from filenames', () => {
      expect(inferContentType('photo.png')).toBe('image/png');
      expect(inferContentType('photo.jpg')).toBe('image/jpeg');
      expect(inferContentType('photo.jpeg')).toBe('image/jpeg');
      expect(inferContentType('photo.webp')).toBe('image/webp');
      expect(inferContentType('photo.gif')).toBe('image/gif');
    });

    it('infers document types from filenames', () => {
      expect(inferContentType('document.pdf')).toBe('application/pdf');
      expect(inferContentType('document.txt')).toBe('text/plain');
      expect(inferContentType('document.md')).toBe('text/markdown');
      expect(inferContentType('document.csv')).toBe('text/csv');
      expect(inferContentType('document.tsv')).toBe('text/tsv');
      expect(inferContentType('document.html')).toBe('text/html');
      expect(inferContentType('document.css')).toBe('text/css');
    });

    it('infers data format types from filenames', () => {
      expect(inferContentType('data.json')).toBe('application/json');
      expect(inferContentType('data.json5')).toBe('application/json5');
      expect(inferContentType('data.ndjson')).toBe('application/x-ndjson');
      expect(inferContentType('data.yml')).toBe('application/yaml');
      expect(inferContentType('data.yaml')).toBe('application/yaml');
      expect(inferContentType('data.xml')).toBe('application/xml');
    });

    it('infers code/script types from filenames', () => {
      expect(inferContentType('script.js')).toBe('application/javascript');
      expect(inferContentType('script.ts')).toBe('application/typescript');
      expect(inferContentType('script.py')).toBe('text/x-python');
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase extensions', () => {
      expect(inferContentType('PHOTO.PNG')).toBe('image/png');
      expect(inferContentType('Document.PDF')).toBe('application/pdf');
      expect(inferContentType('Data.JSON')).toBe('application/json');
    });

    it('handles mixed case extensions', () => {
      expect(inferContentType('photo.Png')).toBe('image/png');
      expect(inferContentType('photo.pNg')).toBe('image/png');
      expect(inferContentType('photo.JpEg')).toBe('image/jpeg');
      expect(inferContentType('photo.YmL')).toBe('application/yaml');
    });

    it('handles uppercase within the name body', () => {
      expect(inferContentType('MyPhoto.PNG')).toBe('image/png');
      expect(inferContentType('MyDocument.PDF')).toBe('application/pdf');
    });
  });

  describe('unknown extensions', () => {
    it('returns empty string for unknown extensions', () => {
      expect(inferContentType('file.unknown')).toBe('');
      expect(inferContentType('file.xyz')).toBe('');
      expect(inferContentType('file.exe')).toBe('');
      expect(inferContentType('file.dll')).toBe('');
      expect(inferContentType('file.doc')).toBe('');
      expect(inferContentType('file.docx')).toBe('');
    });

    it('returns empty string when no extension is provided but name is not in map', () => {
      expect(inferContentType('readme')).toBe('');
      expect(inferContentType('Makefile')).toBe('');
      expect(inferContentType('Dockerfile')).toBe('');
    });
  });

  describe('falsy and edge-case inputs', () => {
    it('returns empty string for null', () => {
      expect(inferContentType(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(inferContentType(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(inferContentType('')).toBe('');
    });

    it('returns empty string for numeric zero', () => {
      expect(inferContentType(0)).toBe('');
    });

    it('returns empty string for false', () => {
      expect(inferContentType(false)).toBe('');
    });

    it('returns empty string for NaN', () => {
      expect(inferContentType(NaN)).toBe('');
    });
  });

  describe('truthy non-string inputs', () => {
    it('returns empty string for positive numbers', () => {
      expect(inferContentType(123)).toBe('');
    });

    it('returns empty string for negative numbers', () => {
      expect(inferContentType(-456)).toBe('');
    });

    it('returns empty string for true', () => {
      expect(inferContentType(true)).toBe('');
    });
  });

  describe('extension-only input', () => {
    it('infers from bare extension strings', () => {
      expect(inferContentType('png')).toBe('image/png');
      expect(inferContentType('pdf')).toBe('application/pdf');
      expect(inferContentType('json')).toBe('application/json');
      expect(inferContentType('html')).toBe('text/html');
      expect(inferContentType('css')).toBe('text/css');
      expect(inferContentType('js')).toBe('application/javascript');
      expect(inferContentType('ts')).toBe('application/typescript');
      expect(inferContentType('py')).toBe('text/x-python');
      expect(inferContentType('xml')).toBe('application/xml');
    });
  });

  describe('filenames with multiple dots', () => {
    it('uses the last segment after the final dot', () => {
      expect(inferContentType('my.file.name.pdf')).toBe('application/pdf');
      expect(inferContentType('archive.tar.gz')).toBe('');
      expect(inferContentType('some.min.js')).toBe('application/javascript');
      expect(inferContentType('bundle.prod.css')).toBe('text/css');
      expect(inferContentType('data.backup.json')).toBe('application/json');
    });

    it('handles filenames starting with a dot', () => {
      expect(inferContentType('.gitignore')).toBe('');
      expect(inferContentType('.eslintrc.json')).toBe('application/json');
      expect(inferContentType('.babelrc.js')).toBe('application/javascript');
    });

    it('handles filenames ending with a dot', () => {
      expect(inferContentType('file.')).toBe('');
      expect(inferContentType('archive.tar.')).toBe('');
    });
  });

  describe('filenames with unusual characters', () => {
    it('handles filenames with spaces', () => {
      expect(inferContentType('my photo.png')).toBe('image/png');
      expect(inferContentType('my document.pdf')).toBe('application/pdf');
    });

    it('handles filenames with hyphens and underscores', () => {
      expect(inferContentType('my-photo.png')).toBe('image/png');
      expect(inferContentType('my_photo.pdf')).toBe('application/pdf');
    });

    it('handles filenames with numbers', () => {
      expect(inferContentType('photo123.png')).toBe('image/png');
      expect(inferContentType('123.pdf')).toBe('application/pdf');
    });

    it('handles trailing whitespace', () => {
      // Trailing space becomes part of the extension segment
      expect(inferContentType('photo.png ')).toBe('');
    });

    it('ignores leading whitespace for extension', () => {
      // Leading space is in first segment; last segment is still 'png'
      expect(inferContentType(' photo.png')).toBe('image/png');
    });
  });

  describe('path-like inputs', () => {
    it('handles relative paths', () => {
      expect(inferContentType('./images/photo.png')).toBe('image/png');
      expect(inferContentType('../docs/readme.md')).toBe('text/markdown');
    });

    it('handles URL-like paths', () => {
      expect(inferContentType('https://example.com/file.pdf')).toBe('application/pdf');
      expect(inferContentType('http://example.com/image.png')).toBe('image/png');
    });
  });
});
