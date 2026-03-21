import { describe, expect, it } from 'vitest';
import { getJwtSecret } from './jwt-secret.js';

describe('shared/jwt-secret', () => {
  it('prefers configured JWT secret', () => {
    const secret = getJwtSecret({ JWT_SECRET: 'configured' }, new Request('https://example.com/api/auth/login'));
    expect(secret).toBe('configured');
  });

  it('generates a reusable dev secret on localhost', () => {
    const req = new Request('https://localhost/api/auth/login');
    const first = getJwtSecret({}, req);
    const second = getJwtSecret({}, req);

    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });

  it('returns null outside localhost when not configured', () => {
    const secret = getJwtSecret({}, new Request('https://example.com/api/auth/login'));
    expect(secret).toBeNull();
  });
});
