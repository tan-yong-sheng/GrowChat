import { describe, expect, it } from 'vitest';
import {
  parseJsonBody,
  parsePagination,
  parsePositiveInt,
  requirePlainObject,
  requireString,
  validateEmail,
} from './request.js';

describe('request validation', () => {
  it('validates primitive fields', () => {
    expect(requireString(' hi ', 'bad')).toBe('hi');
    expect(requireString('hi', 'bad', { trim: false })).toBe('hi');
    expect(() => requireString('', 'bad')).toThrow('bad');
    expect(requirePlainObject({ a: 1 }, 'bad')).toEqual({ a: 1 });
    expect(() => requirePlainObject([], 'bad')).toThrow('bad');
    expect(validateEmail('user@example.com')).toBe('user@example.com');
  });

  it('parses pagination', () => {
    const url = new URL('https://example.com/?limit=10&offset=5');
    expect(parsePagination(url)).toEqual({ limit: 10, offset: 5 });
    expect(() => parsePositiveInt('x', 'bad')).toThrow('bad');
  });

  it('throws for invalid json bodies', async () => {
    const req = new Request('https://example.com', { method: 'POST', body: '{' });
    await expect(parseJsonBody(req)).rejects.toThrow('Invalid JSON body');
  });
});
