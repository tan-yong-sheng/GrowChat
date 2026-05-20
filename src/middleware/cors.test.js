// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateOrigin } from './cors.js';

describe('cors middleware', () => {
  it('allows requests without Origin header', () => {
    const req = new Request('https://example.com/api/test');
    const result = validateOrigin(req, {
      ALLOWED_ORIGINS: 'https://allowed.com',
    });
    expect(result).toBeNull();
  });

  it('allows requests when ALLOWED_ORIGINS is empty', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://any.com' },
    });
    const result = validateOrigin(req, { ALLOWED_ORIGINS: '' });
    expect(result).toBeNull();
  });

  it('allows requests when ALLOWED_ORIGINS is not set', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://any.com' },
    });
    const result = validateOrigin(req, {});
    expect(result).toBeNull();
  });

  it('allows requests from allowed origins', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://allowed.com' },
    });
    const result = validateOrigin(req, {
      ALLOWED_ORIGINS: 'https://allowed.com',
    });
    expect(result).toBeNull();
  });

  it('allows requests from multiple allowed origins', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://allowed2.com' },
    });
    const result = validateOrigin(req, {
      ALLOWED_ORIGINS: 'https://allowed.com,https://allowed2.com',
    });
    expect(result).toBeNull();
  });

  it('rejects requests from disallowed origins', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://evil.com' },
    });
    const result = validateOrigin(req, {
      ALLOWED_ORIGINS: 'https://allowed.com',
    });
    expect(result).not.toBeNull();
    expect(result.status).toBe(403);
  });

  it('handles whitespace in ALLOWED_ORIGINS', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://allowed.com' },
    });
    const result = validateOrigin(req, {
      ALLOWED_ORIGINS: ' https://allowed.com , https://other.com ',
    });
    expect(result).toBeNull();
  });

  it('trims empty entries from ALLOWED_ORIGINS', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://evil.com' },
    });
    const result = validateOrigin(req, { ALLOWED_ORIGINS: ',' });
    expect(result).toBeNull(); // Empty after filtering
  });

  it('allows all origins when wildcard is configured', () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Origin: 'https://evil.com' },
    });
    const result = validateOrigin(req, { ALLOWED_ORIGINS: '*' });
    expect(result).toBeNull();
  });
});
