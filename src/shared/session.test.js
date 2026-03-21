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
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('creates, consumes, and revokes refresh tokens', async () => {
    const { token } = await createRefreshToken(env, 'u1');
    const tokenHash = await sha256Hex(token);
    const stored = JSON.parse(env.SESSIONS.put.mock.calls[0][1]);

    env.SESSIONS.get.mockResolvedValueOnce(stored);

    await expect(consumeRefreshToken(env, token)).resolves.toMatchObject({ userId: 'u1' });
    expect(env.SESSIONS.get).toHaveBeenCalledWith(`refresh:${tokenHash}`, 'json');

    await revokeRefreshToken(env, token);
    expect(env.SESSIONS.delete).toHaveBeenCalledWith(`refresh:${tokenHash}`);
  });
});
