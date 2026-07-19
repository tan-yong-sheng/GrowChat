import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectRealtimeStream: vi.fn(),
}));

vi.mock('../features/realtime/realtime.js', () => ({
  connectRealtimeStream: (...args) => mocks.connectRealtimeStream(...args),
}));

import { realtimeRouter } from './realtime.js';

describe('realtimeRouter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 for unauthenticated user', async () => {
    const result = await realtimeRouter({
      req: new Request('https://example.com/api/realtime/stream', { method: 'GET' }),
      env: { DB: {} },
      ctx: {},
      user: null,
      path: '/api/realtime/stream',
    });
    expect(result.status).toBe(401);
  });

  it('returns 405 for unsupported method', async () => {
    const result = await realtimeRouter({
      req: new Request('https://example.com/api/realtime/stream', { method: 'DELETE' }),
      env: { DB: {} },
      ctx: {},
      user: { sub: 'u1' },
      path: '/api/realtime/stream',
    });
    expect(result.status).toBe(405);
  });

  it('connects realtime stream for GET', async () => {
    mocks.connectRealtimeStream.mockResolvedValue(new Response('stream'));
    await realtimeRouter({
      req: new Request('https://example.com/api/realtime/stream', { method: 'GET' }),
      env: { DB: {} },
      ctx: {},
      user: { sub: 'u1' },
      path: '/api/realtime/stream',
    });
    expect(mocks.connectRealtimeStream).toHaveBeenCalledOnce();
  });

  it('connects realtime stream for POST', async () => {
    mocks.connectRealtimeStream.mockResolvedValue(new Response('stream'));
    await realtimeRouter({
      req: new Request('https://example.com/api/realtime/stream', { method: 'POST' }),
      env: { DB: {} },
      ctx: {},
      user: { sub: 'u1' },
      path: '/api/realtime/stream',
    });
    expect(mocks.connectRealtimeStream).toHaveBeenCalledOnce();
  });

  it('returns null for non-matching path', async () => {
    const result = await realtimeRouter({
      req: new Request('https://example.com/api/unknown', { method: 'GET' }),
      env: { DB: {} },
      ctx: {},
      user: { sub: 'u1' },
      path: '/api/unknown',
    });
    expect(result).toBeNull();
  });
});
