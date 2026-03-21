import { describe, expect, it } from 'vitest';
import { hashPassword, signJWT, verifyJWT, verifyPassword } from './auth.js';

describe('shared/auth', () => {
  it('signs and verifies jwt payloads', async () => {
    const token = await signJWT({ sub: 'u1', email: 'user@example.com' }, 'secret', 60);
    const payload = await verifyJWT(token, 'secret');

    expect(payload.sub).toBe('u1');
    expect(payload.email).toBe('user@example.com');
  });

  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('password123');

    expect(hash.startsWith('pbkdf2:')).toBe(true);
    await expect(verifyPassword('password123', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });
});
