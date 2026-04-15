// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildRateLimitKey, checkRateLimit } from './rate-limit.js';

describe('rate limit service', () => {
  it('builds stable keys', () => {
    expect(buildRateLimitKey('chat send', 'User 1')).toBe('rate-limit:chat-send:user-1');
  });

  it('allows requests under the limit', async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const result = await checkRateLimit(store, {
      action: 'login',
      subject: 'ip:1.2.3.4',
      limit: 2,
      windowSeconds: 60,
      now: 0,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(store.put).toHaveBeenCalledOnce();
  });

  it('blocks requests when the limit is exceeded', async () => {
    const store = {
      get: vi.fn().mockResolvedValue('2'),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const result = await checkRateLimit(store, {
      action: 'login',
      subject: 'ip:1.2.3.4',
      limit: 2,
      windowSeconds: 60,
      now: 0,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(store.put).not.toHaveBeenCalled();
  });
});
