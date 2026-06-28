import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bumpSessionVersion,
  consumeRefreshToken,
  createRefreshToken,
  generateOpaqueToken,
  revokeRefreshToken,
  revokeRefreshTokenForLogout,
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
    env.SESSIONS.get.mockResolvedValueOnce({ userId: 'u1', expiresAt: 9999999999 });
    await revokeRefreshToken(env, 'some-token');
    const tokenHash = await sha256Hex('some-token');
    expect(env.SESSIONS.delete).toHaveBeenCalledTimes(2);
    expect(env.SESSIONS.delete).toHaveBeenCalledWith(`refresh:${tokenHash}`);
    expect(env.SESSIONS.delete).toHaveBeenCalledWith(`refresh-data:${tokenHash}`);
  });

  it('revokeRefreshToken returns the userId from the stored data', async () => {
    env.SESSIONS.get.mockResolvedValueOnce({ userId: 'u42', expiresAt: 9999999999 });
    const userId = await revokeRefreshToken(env, 'some-token');
    expect(userId).toBe('u42');
  });

  it('revokeRefreshToken returns null when token data is missing', async () => {
    env.SESSIONS.get.mockResolvedValueOnce(null);
    const userId = await revokeRefreshToken(env, 'ghost-token');
    expect(userId).toBeNull();
  });

  it('revokeRefreshToken returns null when SESSIONS KV is missing', async () => {
    const userId = await revokeRefreshToken({}, 'some-token');
    expect(userId).toBeNull();
  });

  it('revokeRefreshToken swallows KV delete errors and still returns userId', async () => {
    env.SESSIONS.get.mockResolvedValueOnce({ userId: 'u1', expiresAt: 9999999999 });
    env.SESSIONS.delete.mockRejectedValueOnce(new Error('KV down'));
    const userId = await revokeRefreshToken(env, 'some-token');
    expect(userId).toBe('u1');
  });

  it('revokeRefreshToken attempts both deletes independently when first delete fails', async () => {
    env.SESSIONS.get.mockResolvedValueOnce({ userId: 'u1', expiresAt: 9999999999 });
    env.SESSIONS.delete
      .mockRejectedValueOnce(new Error('KV down on refresh key'))
      .mockResolvedValueOnce(undefined);
    const tokenHash = await sha256Hex('some-token');

    await revokeRefreshToken(env, 'some-token');

    expect(env.SESSIONS.delete).toHaveBeenCalledTimes(2);
    expect(env.SESSIONS.delete).toHaveBeenNthCalledWith(1, `refresh:${tokenHash}`);
    expect(env.SESSIONS.delete).toHaveBeenNthCalledWith(2, `refresh-data:${tokenHash}`);
  });

  it('revokeRefreshTokenForLogout bumps session version before deleting keys', async () => {
    env.SESSIONS.get.mockResolvedValueOnce({ userId: 'u1', expiresAt: 9999999999 });
    env.SESSIONS.get.mockResolvedValueOnce('2');
    const tokenHash = await sha256Hex('some-token');

    const userId = await revokeRefreshTokenForLogout(env, 'some-token');

    expect(userId).toBe('u1');
    // Version bump must happen before the deletes.
    const bumpOrder = env.SESSIONS.put.mock.invocationCallOrder[0];
    const firstDeleteOrder = env.SESSIONS.delete.mock.invocationCallOrder[0];
    expect(bumpOrder).toBeLessThan(firstDeleteOrder);
    expect(env.SESSIONS.put).toHaveBeenCalledWith('session-version:u1', '3', expect.any(Object));
    expect(env.SESSIONS.delete).toHaveBeenCalledWith(`refresh:${tokenHash}`);
    expect(env.SESSIONS.delete).toHaveBeenCalledWith(`refresh-data:${tokenHash}`);
  });

  it('revokeRefreshTokenForLogout still bumps before deletes when deletes fail', async () => {
    env.SESSIONS.get.mockResolvedValueOnce({ userId: 'u1', expiresAt: 9999999999 });
    env.SESSIONS.get.mockResolvedValueOnce('2');
    env.SESSIONS.delete.mockRejectedValue(new Error('KV down'));

    const userId = await revokeRefreshTokenForLogout(env, 'some-token');

    expect(userId).toBe('u1');
    expect(env.SESSIONS.put).toHaveBeenCalledWith('session-version:u1', '3', expect.any(Object));
    // Bump must still precede delete attempts even when KV deletes throw.
    const bumpOrder = env.SESSIONS.put.mock.invocationCallOrder[0];
    const firstDeleteOrder = env.SESSIONS.delete.mock.invocationCallOrder[0];
    expect(bumpOrder).toBeLessThan(firstDeleteOrder);
  });

  it('revokeRefreshTokenForLogout returns null and does not bump when token data is missing', async () => {
    env.SESSIONS.get.mockResolvedValueOnce(null);
    const userId = await revokeRefreshTokenForLogout(env, 'ghost-token');
    expect(userId).toBeNull();
    expect(env.SESSIONS.put).not.toHaveBeenCalled();
  });

  it('bumpSessionVersion increments an existing counter', async () => {
    env.SESSIONS.get.mockResolvedValueOnce('3');
    await bumpSessionVersion(env, 'u1');
    expect(env.SESSIONS.put).toHaveBeenCalledWith(
      'session-version:u1',
      '4',
      expect.objectContaining({ expirationTtl: expect.any(Number) })
    );
  });

  it('bumpSessionVersion starts from 0 when no counter exists', async () => {
    env.SESSIONS.get.mockResolvedValueOnce(null);
    await bumpSessionVersion(env, 'u1');
    expect(env.SESSIONS.put).toHaveBeenCalledWith('session-version:u1', '1', expect.any(Object));
  });

  it('bumpSessionVersion treats non-numeric counters as 0', async () => {
    env.SESSIONS.get.mockResolvedValueOnce('not-a-number');
    await bumpSessionVersion(env, 'u1');
    expect(env.SESSIONS.put).toHaveBeenCalledWith('session-version:u1', '1', expect.any(Object));
  });

  it('bumpSessionVersion treats negative counters as 0 and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    env.SESSIONS.get.mockResolvedValueOnce('-5');
    await bumpSessionVersion(env, 'u1');
    expect(env.SESSIONS.put).toHaveBeenCalledWith('session-version:u1', '1', expect.any(Object));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('bumpSessionVersion treats fractional counters as 0 and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    env.SESSIONS.get.mockResolvedValueOnce('1.5');
    await bumpSessionVersion(env, 'u1');
    expect(env.SESSIONS.put).toHaveBeenCalledWith('session-version:u1', '1', expect.any(Object));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('bumpSessionVersion accepts large but safe integer counters', async () => {
    env.SESSIONS.get.mockResolvedValueOnce('9007199254740991'); // Number.MAX_SAFE_INTEGER
    await bumpSessionVersion(env, 'u1');
    expect(env.SESSIONS.put).toHaveBeenCalledWith(
      'session-version:u1',
      '9007199254740992',
      expect.any(Object)
    );
  });

  it('bumpSessionVersion treats unsafe integer counters as 0 and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    env.SESSIONS.get.mockResolvedValueOnce('9007199254740993'); // Number.MAX_SAFE_INTEGER + 2
    await bumpSessionVersion(env, 'u1');
    expect(env.SESSIONS.put).toHaveBeenCalledWith('session-version:u1', '1', expect.any(Object));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('bumpSessionVersion is a no-op when SESSIONS KV is missing', async () => {
    await expect(bumpSessionVersion({}, 'u1')).resolves.toBeUndefined();
    expect(env.SESSIONS.get).not.toHaveBeenCalled();
    expect(env.SESSIONS.put).not.toHaveBeenCalled();
  });

  it('bumpSessionVersion swallows KV errors so callers do not fail', async () => {
    env.SESSIONS.get.mockRejectedValueOnce(new Error('KV down'));
    await expect(bumpSessionVersion(env, 'u1')).resolves.toBeUndefined();
  });
  it('embeds sessionVersion in refresh token data', async () => {
    env.SESSIONS.get.mockResolvedValueOnce('3'); // session-version
    await createRefreshToken(env, 'u1');
    const dataPut = env.SESSIONS.put.mock.calls[1];
    const storedData = JSON.parse(dataPut[1]);
    expect(storedData.sessionVersion).toBe(3);
  });

  it('createRefreshToken treats a poisoned session-version counter as 0', async () => {
    env.SESSIONS.get.mockResolvedValueOnce('not-a-number'); // poisoned counter
    await createRefreshToken(env, 'u1');
    const dataPut = env.SESSIONS.put.mock.calls[1];
    const storedData = JSON.parse(dataPut[1]);
    expect(storedData.sessionVersion).toBe(0);
  });

  it('createRefreshToken treats a negative session-version counter as 0', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    env.SESSIONS.get.mockResolvedValueOnce('-3');
    await createRefreshToken(env, 'u1');
    const dataPut = env.SESSIONS.put.mock.calls[1];
    const storedData = JSON.parse(dataPut[1]);
    expect(storedData.sessionVersion).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
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

  it('consumeRefreshToken treats a poisoned current session-version as 0', async () => {
    env.SESSIONS.get
      .mockResolvedValueOnce({
        userId: 'u1',
        expiresAt: Math.floor(Date.now() / 1000) + 9999,
        sessionVersion: 0,
      })
      .mockResolvedValueOnce('not-a-number'); // poisoned counter

    const result = await consumeRefreshToken(env, 'poisoned-token');
    expect(result).toMatchObject({ userId: 'u1', sessionVersion: 0 });
  });

  it('consumeRefreshToken treats a negative current session-version as 0 and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    env.SESSIONS.get
      .mockResolvedValueOnce({
        userId: 'u1',
        expiresAt: Math.floor(Date.now() / 1000) + 9999,
        sessionVersion: 0,
      })
      .mockResolvedValueOnce('-2');

    const result = await consumeRefreshToken(env, 'negative-version-token');
    expect(result).toMatchObject({ userId: 'u1', sessionVersion: 0 });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('consumeRefreshToken treats a fractional current session-version as 0 and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    env.SESSIONS.get
      .mockResolvedValueOnce({
        userId: 'u1',
        expiresAt: Math.floor(Date.now() / 1000) + 9999,
        sessionVersion: 0,
      })
      .mockResolvedValueOnce('1.5');

    const result = await consumeRefreshToken(env, 'fractional-version-token');
    expect(result).toMatchObject({ userId: 'u1', sessionVersion: 0 });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
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
