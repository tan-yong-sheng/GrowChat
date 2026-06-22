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
    it('contains expected tag names', () => {
      expect(DEFAULT_REASONING_TAGS).toEqual([
        'think',
        'thinking',
        'thought',
        'thoughts',
        'reason',
        'reasoning',
      ]);
    });
  });

  describe('getPotentialStartIndex', () => {
    it('returns direct index when text contains searchedText', () => {
      expect(getPotentialStartIndex('hello world', 'world')).toBe(6);
      expect(getPotentialStartIndex('hello world', 'hello')).toBe(0);
    });

    it('returns null when searchedText is empty', () => {
      expect(getPotentialStartIndex('hello world', '')).toBeNull();
    });

    it('returns potential start index for partial match at end', () => {
      expect(getPotentialStartIndex('hello wor', 'world')).toBe(6);
    });

    it('returns null when no potential match exists', () => {
      expect(getPotentialStartIndex('abc', 'xyz')).toBeNull();
    });

    it('handles single character potential match', () => {
      expect(getPotentialStartIndex('a', 'abc')).toBe(0);
    });

    it('prefers earliest potential match', () => {
      // 'th' matches start of 'thought' at index 0, but we need to verify
      expect(getPotentialStartIndex('th', 'think')).toBe(0);
    });

    it('handles exact match', () => {
      expect(getPotentialStartIndex('reasoning', 'reasoning')).toBe(0);
    });

    it('returns null for complete mismatch', () => {
      expect(getPotentialStartIndex('completely different', 'xyz')).toBeNull();
    });
  });

  describe('looksLikeIncompleteJson', () => {
    it('returns false for valid JSON strings', () => {
      expect(looksLikeIncompleteJson('{"key": "value"}')).toBe(false);
      expect(looksLikeIncompleteJson('[1, 2, 3]')).toBe(false);
      expect(looksLikeIncompleteJson('"string"')).toBe(false);
      expect(looksLikeIncompleteJson('true')).toBe(false);
    });

    it('returns true for incomplete objects', () => {
      expect(looksLikeIncompleteJson('{"key":')).toBe(true);
      expect(looksLikeIncompleteJson('{"key')).toBe(true);
    });

    it('returns true for incomplete arrays', () => {
      expect(looksLikeIncompleteJson('[1, 2,')).toBe(true);
      expect(looksLikeIncompleteJson('[')).toBe(true);
    });

    it('returns true for unclosed strings', () => {
      expect(looksLikeIncompleteJson('{"key": "value}')).toBe(true);
    });

    it('handles escaped quotes correctly', () => {
      expect(looksLikeIncompleteJson('{"key": "val\\"ue"}')).toBe(false);
      expect(looksLikeIncompleteJson('{"key": "val\\"ue}')).toBe(true);
    });

    it('returns false for empty string', () => {
      expect(looksLikeIncompleteJson('')).toBe(false);
    });

    it('returns false for non-string values (coerced)', () => {
      expect(looksLikeIncompleteJson(null)).toBe(false);
      expect(looksLikeIncompleteJson(undefined)).toBe(false);
      expect(looksLikeIncompleteJson(42)).toBe(false);
    });

    it('handles nested structures', () => {
      expect(looksLikeIncompleteJson('{"a": {"b": [1, 2]}}')).toBe(false);
      expect(looksLikeIncompleteJson('{"a": {"b": [1, 2')).toBe(true);
    });

    it('returns true for string with only opening brace', () => {
      expect(looksLikeIncompleteJson('{')).toBe(true);
    });

    it('returns false for string with matching braces in strings', () => {
      expect(looksLikeIncompleteJson('{"a": "{not real}"}')).toBe(false);
    });
  });

  describe('extractTextFromGoogle', () => {
    it('returns empty string when no candidates', () => {
      expect(extractTextFromGoogle({})).toBe('');
      expect(extractTextFromGoogle(null)).toBe('');
    });

    it('returns empty string when no parts array', () => {
      expect(extractTextFromGoogle({ candidates: [{}] })).toBe('');
      expect(extractTextFromGoogle({ candidates: [{ content: {} }] })).toBe('');
    });

    it('extracts text from part.text fields', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello' }, { text: 'World' }],
            },
          },
        ],
      };
      expect(extractTextFromGoogle(parsed)).toBe('HelloWorld');
    });

    it('skips non-text parts', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello' }, { functionCall: {} }, { text: 'World' }],
            },
          },
        ],
      };
      expect(extractTextFromGoogle(parsed)).toBe('HelloWorld');
    });

    it('handles null/undefined parts', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello' }, null, undefined, { text: 'World' }],
            },
          },
        ],
      };
      expect(extractTextFromGoogle(parsed)).toBe('HelloWorld');
    });

    it('returns empty string for non-string text values', () => {
      const parsed = {
        candidates: [
          {
            content: {
              parts: [{ text: 123 }, { text: false }],
            },
          },
        ],
      };
      expect(extractTextFromGoogle(parsed)).toBe('');
    });
  });

  describe('extractTextFromAnthropic', () => {
    it('returns empty string for content_block_delta without text', () => {
      expect(extractTextFromAnthropic({ type: 'content_block_delta', delta: {} })).toBe('');
    });

    it('extracts text from content_block_delta', () => {
      const parsed = {
        type: 'content_block_delta',
        delta: { text: 'Hello world' },
      };
      expect(extractTextFromAnthropic(parsed)).toBe('Hello world');
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

    it('returns empty string for unknown types', () => {
      expect(extractTextFromAnthropic({ type: 'ping' })).toBe('');
      expect(extractTextFromAnthropic({})).toBe('');
      expect(extractTextFromAnthropic(null)).toBe('');
    });

    it('handles content_block_delta with partial text', () => {
      expect(extractTextFromAnthropic({ type: 'content_block_delta', delta: { text: '' } })).toBe(
        ''
      );
    });
  });
});
