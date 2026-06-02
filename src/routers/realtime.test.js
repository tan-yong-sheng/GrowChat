import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectRealtimeStream: vi.fn(),
}));

vi.mock('../features/realtime/realtime.js', () => ({
  connectRealtimeStream: (...args) => mocks.connectRealtimeStream(...args),
}));

import { realtimeRouter } from './realtime.js';

describe('realtimeRouter', () => {
  it('returns 401 for unauthenticated user', async () => {
    const res = await realtimeRouter(
      new Request('https://example.com/api/realtime/stream', { method: 'GET' }),
      { DB: {} },
      {},
      null,
      '/api/realtime/stream'
    );
    expect(res.status).toBe(401);
  });

  it('returns 405 for unsupported method', async () => {
    const res = await realtimeRouter(
      new Request('https://example.com/api/realtime/stream', { method: 'DELETE' }),
      { DB: {} },
      {},
      { sub: 'u1' },
      '/api/realtime/stream'
    );
    expect(res.status).toBe(405);
  });

  it('connects realtime stream for GET', async () => {
    mocks.connectRealtimeStream.mockResolvedValue(new Response('stream'));
    const res = await realtimeRouter(
      new Request('https://example.com/api/realtime/stream', { method: 'GET' }),
      { DB: {} },
      {},
      { sub: 'u1' },
      '/api/realtime/stream'
    );
    expect(mocks.connectRealtimeStream).toHaveBeenCalled();
  });

  it('connects realtime stream for POST', async () => {
    mocks.connectRealtimeStream.mockResolvedValue(new Response('stream'));
    const res = await realtimeRouter(
      new Request('https://example.com/api/realtime/stream', { method: 'POST' }),
      { DB: {} },
      {},
      { sub: 'u1' },
      '/api/realtime/stream'
    );
    expect(mocks.connectRealtimeStream).toHaveBeenCalled();
  });

  it('returns null for non-matching path', async () => {
    const result = await realtimeRouter(
      new Request('https://example.com/api/unknown', { method: 'GET' }),
      { DB: {} },
      {},
      { sub: 'u1' },
      '/api/unknown'
    );
    expect(result).toBeNull();
  });
});
