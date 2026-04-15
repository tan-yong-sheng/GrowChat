import { describe, expect, it } from 'vitest';
import { hashPassword, signJWT, verifyJWT, verifyPassword } from './auth.js';

describe('shared/auth', () => {
  it('signs and verifies jwt payloads', async () => {
    const token = await signJWT({ sub: 'u1', email: 'user@example.com' }, 'secret', 60);
    const payload = await verifyJWT(token, 'secret');

    expect(payload.sub).toBe('u1');
    expect(payload.email).toBe('user@example.com');
  });

  it('rejects jwt signed with wrong secret', async () => {
    const token = await signJWT({ sub: 'u1' }, 'correct-secret', 60);
    await expect(verifyJWT(token, 'wrong-secret')).rejects.toThrow('Invalid signature');
  });

  it('rejects jwt with tampered signature (constant-time comparison)', async () => {
    const token = await signJWT({ sub: 'u1' }, 'secret', 60);
    const [header, body, signature] = token.split('.');
    // Tamper with first character of signature to keep valid base64url
    const firstChar = signature[0];
    const tamperedFirst = firstChar === 'A' ? 'B' : 'A';
    const tampered = `${header}.${body}.${tamperedFirst}${signature.slice(1)}`;
    await expect(verifyJWT(tampered, 'secret')).rejects.toThrow('Invalid signature');
  });

  it('rejects expired jwt', async () => {
    const token = await signJWT({ sub: 'u1' }, 'secret', 1);
    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(verifyJWT(token, 'secret')).rejects.toThrow('Token expired');
  });

  it('rejects jwt with invalid format', async () => {
    await expect(verifyJWT('not-a-jwt', 'secret')).rejects.toThrow('Invalid token');
    await expect(verifyJWT('a.b', 'secret')).rejects.toThrow('Invalid token');
  });

  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('password123');

    expect(hash.startsWith('pbkdf2:')).toBe(true);
    await expect(verifyPassword('password123', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });
});
