import { describe, expect, it } from 'vitest';
import { getJwtSecret } from './jwt-secret.js';

describe('jwt-secret (re-export)', () => {
  it('re-exports getJwtSecret from shared/jwt-secret', () => {
    expect(getJwtSecret).toBeInstanceOf(Function);
  });

  it('rejects short configured secrets', () => {
    expect(() => getJwtSecret({ JWT_SECRET: 'short' }, { url: 'https://example.com' })).toThrow(
      'JWT_SECRET must be at least 32 bytes'
    );
  });

  it('rejects missing secret on non-localhost', () => {
    expect(() => getJwtSecret({}, { url: 'https://example.com' })).toThrow(
      'JWT_SECRET environment variable is required for non-localhost deployments'
    );
  });

  it('generates a reusable dev secret on localhost', () => {
    const req = { url: 'http://localhost/api/auth/login' };
    const first = getJwtSecret({}, req);
    const second = getJwtSecret({}, req);

    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });
});
