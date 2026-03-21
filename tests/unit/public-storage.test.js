// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readStoredJson,
  readStoredString,
  removeStoredValue,
  writeStoredJson,
  writeStoredString,
} from '../../public/js/shared/utils/storage.js';

describe('storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('reads and writes JSON values safely', () => {
    expect(writeStoredJson(localStorage, 'json-key', { ok: true })).toBe(true);
    expect(readStoredJson(localStorage, 'json-key')).toEqual({ ok: true });
    expect(readStoredJson(localStorage, 'missing', { fallback: true })).toEqual({ fallback: true });
  });

  it('reads and writes string values safely', () => {
    expect(writeStoredString(sessionStorage, 'string-key', 123)).toBe(true);
    expect(readStoredString(sessionStorage, 'string-key')).toBe('123');
    expect(readStoredString(sessionStorage, 'missing', 'fallback')).toBe('fallback');
  });

  it('removes stored values', () => {
    localStorage.setItem('remove-me', 'x');
    expect(removeStoredValue(localStorage, 'remove-me')).toBe(true);
    expect(localStorage.getItem('remove-me')).toBeNull();
  });
});


