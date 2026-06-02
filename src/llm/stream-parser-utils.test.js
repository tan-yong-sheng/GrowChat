import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REASONING_TAGS,
  getPotentialStartIndex,
  looksLikeIncompleteJson,
  extractTextFromGoogle,
  extractTextFromAnthropic,
} from './stream-parser-utils.js';

describe('stream-parser-utils', () => {
  describe('DEFAULT_REASONING_TAGS', () => {
    it('is a non-empty array of strings', () => {
      expect(Array.isArray(DEFAULT_REASONING_TAGS)).toBe(true);
      expect(DEFAULT_REASONING_TAGS.length).toBeGreaterThan(0);
      for (const tag of DEFAULT_REASONING_TAGS) {
        expect(typeof tag).toBe('string');
        expect(tag.length).toBeGreaterThan(0);
      }
    });

    it('contains standard reasoning tag names', () => {
      expect(DEFAULT_REASONING_TAGS).toContain('think');
      expect(DEFAULT_REASONING_TAGS).toContain('thinking');
      expect(DEFAULT_REASONING_TAGS).toContain('reasoning');
    });
  });

  describe('getPotentialStartIndex', () => {
    it('returns direct match index when found', () => {
      expect(getPotentialStartIndex('hello<think>', '<think>')).toBe(5);
    });

    it('returns 0 when match is at start', () => {
      expect(getPotentialStartIndex('<think>rest', '<think>')).toBe(0);
    });

    it('returns null when no match and no partial match', () => {
      expect(getPotentialStartIndex('hello world', '<think>')).toBeNull();
    });

    it('returns partial match index when text ends with prefix of searchedText', () => {
      // text ends with "<thi" which is a prefix of "<think>"
      expect(getPotentialStartIndex('hello<thi', '<think>')).toBe(5);
    });

    it('returns partial match at end of string', () => {
      expect(getPotentialStartIndex('some text<', '<think>')).toBe(9);
    });

    it('returns null for empty searchedText', () => {
      expect(getPotentialStartIndex('hello', '')).toBeNull();
    });

    it('returns 0 when text itself is a prefix of searchedText', () => {
      expect(getPotentialStartIndex('<th', '<think>')).toBe(0);
    });

    it('prefers direct match over partial match', () => {
      const text = '<th<think>';
      // Direct match at index 3, partial match at index 0
      expect(getPotentialStartIndex(text, '<think>')).toBe(3);
    });

    it('handles single character partial match', () => {
      expect(getPotentialStartIndex('a<', '<think>')).toBe(1);
    });
  });

  describe('looksLikeIncompleteJson', () => {
    it('returns false for empty string', () => {
      expect(looksLikeIncompleteJson('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(looksLikeIncompleteJson(null)).toBe(false);
      expect(looksLikeIncompleteJson(undefined)).toBe(false);
    });

    it('returns true for incomplete object (unclosed brace)', () => {
      expect(looksLikeIncompleteJson('{"key":')).toBe(true);
    });

    it('returns true for incomplete array (unclosed bracket)', () => {
      expect(looksLikeIncompleteJson('[1, 2')).toBe(true);
    });

    it('returns true for unclosed string', () => {
      expect(looksLikeIncompleteJson('"hello')).toBe(true);
    });

    it('returns false for complete JSON object', () => {
      expect(looksLikeIncompleteJson('{"key": "value"}')).toBe(false);
    });

    it('returns false for complete JSON array', () => {
      expect(looksLikeIncompleteJson('[1, 2, 3]')).toBe(false);
    });

    it('returns false for simple string', () => {
      expect(looksLikeIncompleteJson('"hello"')).toBe(false);
    });

    it('returns false for complete nested JSON', () => {
      expect(looksLikeIncompleteJson('{"a": {"b": 1}}')).toBe(false);
    });

    it('handles escaped quotes inside strings', () => {
      expect(looksLikeIncompleteJson('"he\\"llo"')).toBe(false);
    });

    it('handles escaped backslash before quote', () => {
      expect(looksLikeIncompleteJson('"path\\\\\\"file"')).toBe(false);
    });

    it('returns true for nested incomplete object', () => {
      expect(looksLikeIncompleteJson('{"a": {"b":')).toBe(true);
    });

    it('returns false for number', () => {
      expect(looksLikeIncompleteJson('42')).toBe(false);
    });

    it('handles deeply nested structures', () => {
      expect(looksLikeIncompleteJson('{"a": [{"b": 1}]}')).toBe(false);
      expect(looksLikeIncompleteJson('{"a": [{"b":')).toBe(true);
    });

    it('handles string with escaped characters correctly', () => {
      // Escaped quote inside a string, then incomplete
      expect(looksLikeIncompleteJson('"hello\\" world')).toBe(true);
    });

    it('handles object inside array closing correctly', () => {
      expect(looksLikeIncompleteJson('[{"x": 1},')).toBe(true);
    });
  });

  describe('extractTextFromGoogle', () => {
    it('extracts text from Google candidate parts', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello ' }, { text: 'World' }],
            },
          },
        ],
      };
      expect(extractTextFromGoogle(parsed)).toBe('Hello World');
    });

    it('returns empty string for no candidates', () => {
      expect(extractTextFromGoogle({})).toBe('');
      expect(extractTextFromGoogle(null)).toBe('');
      expect(extractTextFromGoogle(undefined)).toBe('');
    });

    it('returns empty string for empty candidates array', () => {
      expect(extractTextFromGoogle({ candidates: [] })).toBe('');
    });

    it('skips non-text parts', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello' }, { functionCall: { name: 'test' } }, { text: ' World' }],
            },
          },
        ],
      };
      expect(extractTextFromGoogle(parsed)).toBe('Hello World');
    });

    it('handles null parts gracefully', () => {
      const parsed = {
        candidates: [{ content: { parts: [null, { text: 'ok' }] } }],
      };
      expect(extractTextFromGoogle(parsed)).toBe('ok');
    });

    it('returns empty string when parts is not an array', () => {
      expect(extractTextFromGoogle({ candidates: [{ content: { parts: 'not-array' } }] })).toBe('');
      expect(extractTextFromGoogle({ candidates: [{ content: {} }] })).toBe('');
    });
  });

  describe('extractTextFromAnthropic', () => {
    it('extracts text from content_block_delta', () => {
      const parsed = {
        type: 'content_block_delta',
        delta: { text: 'Hello' },
      };
      expect(extractTextFromAnthropic(parsed)).toBe('Hello');
    });

    it('returns empty string for message_start', () => {
      expect(extractTextFromAnthropic({ type: 'message_start' })).toBe('');
    });

    it('returns empty string for message_delta', () => {
      expect(extractTextFromAnthropic({ type: 'message_delta' })).toBe('');
    });

    it('returns empty string for message_stop', () => {
      expect(extractTextFromAnthropic({ type: 'message_stop' })).toBe('');
    });

    it('returns empty string for unknown type', () => {
      expect(extractTextFromAnthropic({ type: 'unknown' })).toBe('');
    });

    it('returns empty string for null/undefined', () => {
      expect(extractTextFromAnthropic(null)).toBe('');
      expect(extractTextFromAnthropic(undefined)).toBe('');
    });

    it('handles missing delta text gracefully', () => {
      expect(extractTextFromAnthropic({ type: 'content_block_delta' })).toBe('');
      expect(extractTextFromAnthropic({ type: 'content_block_delta', delta: {} })).toBe('');
    });
  });
});
