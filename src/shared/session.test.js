import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeRefreshToken,
  createRefreshToken,
  generateOpaqueToken,
  revokeRefreshToken,
  sha256Hex,
} from './session.js';

describe('shared/session', () => {
  let env;

  beforeEach(() => {
    env = {
      SESSIONS: {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  it('generates opaque tokens', () => {
    expect(generateOpaqueToken()).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('creates refresh tokens with two-key pattern', async () => {
    expect((await createRefreshToken(env, 'u1')).token).toBeTruthy();
    expect(env.SESSIONS.put).toHaveBeenCalledTimes(2);
    expect(env.SESSIONS.put).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^refresh:/),
      '1',
      expect.any(Object)
    );
    expect(env.SESSIONS.put).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^refresh-data:/),
      expect.stringMatching(/"u1"/),
      expect.any(Object)
    );
  });

  it('consumeRefreshToken deletes gate first then reads data', async () => {
    const { token } = await createRefreshToken(env, 'u1');
    const tokenHash = await sha256Hex(token);
    const storedData = JSON.parse(env.SESSIONS.put.mock.calls[1][1]);

    env.SESSIONS.get.mockResolvedValueOnce(storedData);

    const result = await consumeRefreshToken(env, token);

    // Gate deleted first
    expect(env.SESSIONS.delete).toHaveBeenNthCalledWith(1, `refresh:${tokenHash}`);
    // Then data read from separate key
    expect(env.SESSIONS.get).toHaveBeenCalledWith(`refresh-data:${tokenHash}`, 'json');
    expect(result).toMatchObject({ userId: 'u1' });
  });

  it('consumeRefreshToken returns null for missing gate', async () => {
    env.SESSIONS.get.mockResolvedValueOnce(null);
    // Gate already deleted — data key would also be missing
    env.SESSIONS.get.mockResolvedValueOnce(null);

    await expect(consumeRefreshToken(env, 'fake-token')).resolves.toBeNull();
  });

  it('revokeRefreshToken deletes both keys', async () => {
    env.SESSIONS.delete.mockClear();
    await revokeRefreshToken(env, 'some-token');
    const tokenHash = await sha256Hex('some-token');
    expect(env.SESSIONS.delete).toHaveBeenCalledTimes(2);
    expect(env.SESSIONS.delete).toHaveBeenCalledWith(`refresh:${tokenHash}`);
    expect(env.SESSIONS.delete).toHaveBeenCalledWith(`refresh-data:${tokenHash}`);
  });
  it('embeds sessionVersion in refresh token data', async () => {
    env.SESSIONS.get.mockResolvedValueOnce('3'); // session-version
    await createRefreshToken(env, 'u1');
    const dataPut = env.SESSIONS.put.mock.calls[1];
    const storedData = JSON.parse(dataPut[1]);
    expect(storedData.sessionVersion).toBe(3);
  });

  it('consumeRefreshToken rejects token when session version was bumped', async () => {
    // Create token with version 0 (default)
    const { token } = await createRefreshToken(env, 'u1');
    const storedData = JSON.parse(env.SESSIONS.put.mock.calls[1][1]);

    // Simulate password reset: bump session-version from 0 to 1
    env.SESSIONS.get
      .mockResolvedValueOnce(storedData) // refresh-data read
      .mockResolvedValueOnce('1'); // session-version now 1

    const result = await consumeRefreshToken(env, token);
    expect(result).toBeNull(); // rejected - version mismatch
  });

  it('consumeRefreshToken accepts token when session version matches', async () => {
    env.SESSIONS.get.mockResolvedValueOnce('2'); // session-version at creation
    const { token } = await createRefreshToken(env, 'u1');
    const storedData = JSON.parse(env.SESSIONS.put.mock.calls[1][1]);

    env.SESSIONS.get
      .mockResolvedValueOnce(storedData) // refresh-data read
      .mockResolvedValueOnce('2'); // session-version still 2

    const result = await consumeRefreshToken(env, token);
    expect(result).toMatchObject({ userId: 'u1', sessionVersion: 2 });
  });

  it('consumeRefreshToken accepts token when sessionVersion is undefined (legacy)', async () => {
    // Tokens created before sessionVersion was added have no version field.
    // They should still work (no version check applied).
    const legacyData = { userId: 'u1', expiresAt: Math.floor(Date.now() / 1000) + 9999 };
    env.SESSIONS.get.mockResolvedValueOnce(legacyData);

    const result = await consumeRefreshToken(env, 'legacy-token');
    expect(result).toMatchObject({ userId: 'u1' });
  });
});
