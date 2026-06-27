import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockConnectRealtimeStream = vi.fn();

vi.mock('../features/realtime/realtime.js', () => ({
  connectRealtimeStream: (...args) => mockConnectRealtimeStream(...args),
}));

import { realtimeRouter } from './realtime.js';

describe('realtimeRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeReq = (method = 'GET') =>
    new Request('https://example.com/api/realtime/stream', { method });
  const user = { sub: 'user-1' };

  // ═══════════════════════════════════════════════════════════════════
  //  Path matching
  // ═══════════════════════════════════════════════════════════════════

  it('returns null for non-matching path', async () => {
    const req = new Request('https://example.com/api/other');
    const res = await realtimeRouter(req, {}, {}, user, '/api/other');
    expect(res).toBeNull();
  });

  it('returns null for empty path (guards exact match)', async () => {
    const req = new Request('https://example.com/api/realtime/stream');
    const res = await realtimeRouter(req, {}, {}, user, '');
    expect(res).toBeNull();
  });

  it('returns null for path with trailing slash', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, user, '/api/realtime/stream/');
    expect(res).toBeNull();
  });

  it('returns null for longer path', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, user, '/api/realtime/stream/extra');
    expect(res).toBeNull();
  });

  it('returns null when path is undefined', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, user, undefined);
    expect(res).toBeNull();
  });

  it('returns null when path is null', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, user, null);
    expect(res).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Authentication
  // ═══════════════════════════════════════════════════════════════════

  it('returns 401 for null user', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, null, '/api/realtime/stream');
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('returns 401 for undefined user', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, undefined, '/api/realtime/stream');
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('returns 401 for false user', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, false, '/api/realtime/stream');
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('returns 401 for 0 user', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, 0, '/api/realtime/stream');
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('returns 401 for empty string user', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, '', '/api/realtime/stream');
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('returns 401 for NaN user', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, NaN, '/api/realtime/stream');
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('returns 401 response with correct status and body (kills body/status mutants)', async () => {
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, null, '/api/realtime/stream');
    expect(res.status).toBe(401);
    expect(res.statusText).toBe('');
    expect(await res.text()).toBe('Unauthorized');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Method validation
  // ═══════════════════════════════════════════════════════════════════

  it('allows GET requests', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response('stream'));
    const req = makeReq('GET');
    const res = await realtimeRouter(req, {}, {}, user, '/api/realtime/stream');
    expect(mockConnectRealtimeStream).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('stream');
  });

  it('allows POST requests', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response('stream-post'));
    const req = makeReq('POST');
    const res = await realtimeRouter(req, {}, {}, user, '/api/realtime/stream');
    expect(mockConnectRealtimeStream).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('stream-post');
  });

  it.each(['DELETE', 'PUT', 'PATCH', 'OPTIONS', 'HEAD'])(
    'returns 405 for unsupported method %s',
    async (method) => {
      const req = makeReq(method);
      const res = await realtimeRouter(req, {}, {}, user, '/api/realtime/stream');
      expect(res.status).toBe(405);
      expect(await res.text()).toBe('Method not allowed');
    }
  );

  it('returns 405 response with correct status and body (kills body/status mutants)', async () => {
    const req = makeReq('DELETE');
    const res = await realtimeRouter(req, {}, {}, user, '/api/realtime/stream');
    expect(res.status).toBe(405);
    expect(res.statusText).toBe('');
    expect(await res.text()).toBe('Method not allowed');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Delegation to connectRealtimeStream
  // ═══════════════════════════════════════════════════════════════════

  it('forwards the original request object', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response('ok'));
    const req = makeReq();
    await realtimeRouter(req, {}, {}, user, '/api/realtime/stream');
    expect(mockConnectRealtimeStream.mock.calls[0][0]).toBe(req);
  });

  it('forwards the env object', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response('ok'));
    const env = { DB: 'test-db', KV: 'test-kv' };
    const req = makeReq();
    await realtimeRouter(req, env, {}, user, '/api/realtime/stream');
    expect(mockConnectRealtimeStream.mock.calls[0][1]).toBe(env);
  });

  it('passes user.sub as the third argument', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response('ok'));
    const req = makeReq();
    await realtimeRouter(req, {}, {}, { sub: 'user-42' }, '/api/realtime/stream');
    expect(mockConnectRealtimeStream).toHaveBeenCalledWith(req, {}, 'user-42');
    expect(mockConnectRealtimeStream.mock.calls[0][2]).toBe('user-42');
  });

  it('calls connectRealtimeStream exactly once', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response('ok'));
    const req = makeReq();
    await realtimeRouter(req, {}, {}, user, '/api/realtime/stream');
    expect(mockConnectRealtimeStream).toHaveBeenCalledTimes(1);
  });

  it('passes exactly 3 arguments to connectRealtimeStream (not _ctx)', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response('ok'));
    const fakeCtx = { waitUntil: vi.fn() };
    const req = makeReq();
    await realtimeRouter(req, { DB: 'TEST' }, fakeCtx, user, '/api/realtime/stream');
    expect(mockConnectRealtimeStream.mock.calls[0].length).toBe(3);
  });

  it('does not leak _ctx into connectRealtimeStream', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response('ok'));
    const fakeCtx = { waitUntil: vi.fn() };
    const req = makeReq();
    await realtimeRouter(req, { DB: 'TEST' }, fakeCtx, user, '/api/realtime/stream');
    const call = mockConnectRealtimeStream.mock.calls[0];
    expect(call[0]).toBe(req);
    expect(call[1]).toStrictEqual({ DB: 'TEST' });
    expect(call[2]).toBe('user-1');
  });

  it('returns the exact response object from connectRealtimeStream without wrapping', async () => {
    const customResponse = new Response('custom-body', {
      status: 200,
      headers: { 'x-custom': 'yes' },
    });
    mockConnectRealtimeStream.mockResolvedValue(customResponse);
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, user, '/api/realtime/stream');
    expect(res).toBe(customResponse);
    expect(await res.text()).toBe('custom-body');
    expect(res.headers.get('x-custom')).toBe('yes');
  });

  it('awaits and forwards a rejected promise from connectRealtimeStream', async () => {
    mockConnectRealtimeStream.mockRejectedValue(new Error('stream failed'));
    const req = makeReq();
    await expect(realtimeRouter(req, {}, {}, user, '/api/realtime/stream')).rejects.toThrow(
      'stream failed'
    );
  });

  it('handles responses with empty body from connectRealtimeStream', async () => {
    mockConnectRealtimeStream.mockResolvedValue(new Response(null));
    const req = makeReq();
    const res = await realtimeRouter(req, {}, {}, user, '/api/realtime/stream');
    expect(res.body).toBeNull();
    expect(res.status).toBe(200);
  });
});
