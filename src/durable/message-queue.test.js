import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  sseData: vi.fn((payload) => `data: ${JSON.stringify(payload)}\n\n`),
  sseHeaders: vi.fn((req, extra = {}) => ({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...extra,
  })),
}));

vi.mock('../utils/response.js', () => ({
  sseData: (...args) => mocks.sseData(...args),
  sseHeaders: (...args) => mocks.sseHeaders(...args),
}));

import { MessageQueueDO } from './message-queue.js';

function createRequest(path, method = 'GET', headers = {}, body = null) {
  const url = `http://do.example.com${path}`;
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  return new Request(url, init);
}

describe('MessageQueueDO', () => {
  let doState;
  let env;

  beforeEach(() => {
    doState = { storage: new Map() };
    env = {};
    vi.clearAllMocks();
  });

  function createDO() {
    return new MessageQueueDO(doState, env);
  }

  describe('fetch routing', () => {
    it('routes GET /connect to handleConnect', async () => {
      const do_ = createDO();
      const res = await do_.fetch(
        createRequest('/connect', 'GET', { 'x-client-session-id': 's1' })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/event-stream');
      await res.body?.cancel?.();
      do_.stopKeepAlive();
    });

    it('routes POST /connect to handleConnect', async () => {
      const do_ = createDO();
      const res = await do_.fetch(
        createRequest('/connect', 'POST', { 'x-client-session-id': 's2' })
      );
      expect(res.status).toBe(200);
      await res.body?.cancel?.();
      do_.stopKeepAlive();
    });

    it('routes POST /publish to handlePublish', async () => {
      const do_ = createDO();
      const res = await do_.fetch(
        createRequest('/publish', 'POST', {}, { type: 'chat', data: 'hello' })
      );
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown paths', async () => {
      const do_ = createDO();
      const res = await do_.fetch(createRequest('/unknown', 'GET'));
      expect(res.status).toBe(404);
    });

    it('returns 404 for unsupported methods on known paths', async () => {
      const do_ = createDO();
      const res = await do_.fetch(createRequest('/publish', 'GET'));
      expect(res.status).toBe(404);
    });
  });

  describe('handleConnect', () => {
    it('returns SSE response with correct headers', async () => {
      const do_ = createDO();
      const res = await do_.fetch(
        createRequest('/connect', 'GET', { 'x-client-session-id': 's1' })
      );
      expect(mocks.sseHeaders).toHaveBeenCalled();
      // X-Accel-Buffering is set in handleConnect, not in sseHeaders mock
      expect(res.headers.get('X-Accel-Buffering')).toBe('no');
      await res.body?.cancel?.();
      do_.stopKeepAlive();
    });

    it('sends initial keepalive comment on connect', async () => {
      const do_ = createDO();
      const res = await do_.fetch(
        createRequest('/connect', 'GET', { 'x-client-session-id': 's1' })
      );
      const reader = res.body.getReader();
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toBe(':\n\n');
      await reader.cancel();
      do_.stopKeepAlive();
    });

    it('closes existing session with same id before creating new one', async () => {
      const do_ = createDO();
      // First connect
      const res1 = await do_.fetch(
        createRequest('/connect', 'GET', { 'x-client-session-id': 's1' })
      );
      expect(res1.status).toBe(200);
      // Second connect with same session id - should close the first
      const res2 = await do_.fetch(
        createRequest('/connect', 'GET', { 'x-client-session-id': 's1' })
      );
      expect(res2.status).toBe(200);
      // Only one session should exist
      expect(do_.sessions.size).toBe(1);
      await res2.body?.cancel?.();
      do_.stopKeepAlive();
    });
  });

  describe('handlePublish', () => {
    it('broadcasts event to connected sessions', async () => {
      const do_ = createDO();
      // Connect a session first
      const connectRes = await do_.fetch(
        createRequest('/connect', 'GET', { 'x-client-session-id': 's1' })
      );

      const res = await do_.fetch(
        createRequest('/publish', 'POST', {}, { type: 'chat', data: 'hello' })
      );
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.delivered).toBe(1);
      await connectRes.body?.cancel?.();
      do_.stopKeepAlive();
    });

    it('returns delivered: 0 when no sessions connected', async () => {
      const do_ = createDO();
      const res = await do_.fetch(
        createRequest('/publish', 'POST', {}, { type: 'chat', data: 'hello' })
      );
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.delivered).toBe(0);
    });

    it('returns 400 for invalid JSON body', async () => {
      const do_ = createDO();
      const req = new Request('http://do.example.com/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      const res = await do_.fetch(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('invalid_json');
    });

    it('returns 400 for non-object body', async () => {
      const do_ = createDO();
      const res = await do_.fetch(createRequest('/publish', 'POST', {}, 'string-body'));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('invalid_event');
    });

    it('returns 400 for missing type field', async () => {
      const do_ = createDO();
      const res = await do_.fetch(createRequest('/publish', 'POST', {}, { data: 'hello' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('missing_type');
    });

    it('returns 400 for whitespace-only type field', async () => {
      const do_ = createDO();
      const res = await do_.fetch(createRequest('/publish', 'POST', {}, { type: '  ' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('missing_type');
    });

    it('returns 413 for event exceeding 64KB', async () => {
      const do_ = createDO();
      const largeData = 'x'.repeat(65 * 1024);
      const res = await do_.fetch(
        createRequest('/publish', 'POST', {}, { type: 'chat', data: largeData })
      );
      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.error).toBe('event_too_large');
    });

    it('removes session when enqueue fails', async () => {
      const do_ = createDO();
      await do_.fetch(createRequest('/connect', 'GET', { 'x-client-session-id': 's1' }));
      // Close the controller to simulate broken session
      const controller = do_.sessions.get('s1');
      controller.close();
      // Publish should remove the broken session
      const res = await do_.fetch(createRequest('/publish', 'POST', {}, { type: 'ping' }));
      const body = await res.json();
      expect(body.delivered).toBe(0);
      expect(do_.sessions.has('s1')).toBe(false);
      expect(do_.keepAliveTimer).toBeNull();
    });
  });

  describe('getClientSessionId', () => {
    it('uses x-client-session-id header', async () => {
      const do_ = createDO();
      const res = await do_.fetch(
        createRequest('/connect', 'GET', { 'x-client-session-id': 'my-session' })
      );
      expect(res.status).toBe(200);
      expect(do_.sessions.has('my-session')).toBe(true);
      await res.body?.cancel?.();
      do_.stopKeepAlive();
    });

    it('generates UUID when no session id header', async () => {
      const do_ = createDO();
      const res = await do_.fetch(createRequest('/connect', 'GET'));
      expect(res.status).toBe(200);
      expect(do_.sessions.size).toBe(1);
      const sessionId = do_.sessions.keys().next().value;
      // UUID format: 8-4-4-4-12
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      await res.body?.cancel?.();
      do_.stopKeepAlive();
    });

    it('strips control characters from session id', async () => {
      const do_ = createDO();
      // Control characters can't be set in HTTP headers, so test the method directly
      const raw = 'ses\x00sion\x1F';
      const sessionId = do_.getClientSessionId({
        headers: { get: () => raw },
      });
      expect(sessionId).toBe('session');
    });

    it('truncates session id to 200 chars', async () => {
      const do_ = createDO();
      const longId = 'a'.repeat(300);
      const res = await do_.fetch(
        createRequest('/connect', 'GET', { 'x-client-session-id': longId })
      );
      const sessionId = do_.sessions.keys().next().value;
      expect(sessionId.length).toBe(200);
      await res.body?.cancel?.();
      do_.stopKeepAlive();
    });

    it('removes DEL character (0x7F) from session id', async () => {
      const do_ = createDO();
      const sessionId = do_.getClientSessionId({
        headers: { get: () => 'ses\x7Fsion' },
      });
      expect(sessionId).toBe('session');
    });
  });

  describe('keepalive', () => {
    it('starts keepalive timer when sessions exist', () => {
      const do_ = createDO();
      do_.sessions.set('test', { enqueue: vi.fn(), close: vi.fn() });
      do_.ensureKeepAlive();
      expect(do_.keepAliveTimer).not.toBeNull();
      do_.stopKeepAlive();
    });

    it('does not start timer when no sessions exist', () => {
      const do_ = createDO();
      do_.ensureKeepAlive();
      expect(do_.keepAliveTimer).toBeNull();
    });

    it('does not start duplicate timer', () => {
      const do_ = createDO();
      do_.sessions.set('test', { enqueue: vi.fn(), close: vi.fn() });
      do_.ensureKeepAlive();
      const firstTimer = do_.keepAliveTimer;
      do_.ensureKeepAlive();
      expect(do_.keepAliveTimer).toBe(firstTimer);
      do_.stopKeepAlive();
    });

    it('stops keepalive when last session is removed', () => {
      const do_ = createDO();
      do_.sessions.set('test', { enqueue: vi.fn(), close: vi.fn() });
      do_.ensureKeepAlive();
      expect(do_.keepAliveTimer).not.toBeNull();
      do_.removeSession('test');
      expect(do_.keepAliveTimer).toBeNull();
    });

    it('does not stop keepalive when sessions still exist', () => {
      const do_ = createDO();
      do_.sessions.set('s1', { enqueue: vi.fn(), close: vi.fn() });
      do_.sessions.set('s2', { enqueue: vi.fn(), close: vi.fn() });
      do_.ensureKeepAlive();
      do_.removeSession('s1');
      expect(do_.keepAliveTimer).not.toBeNull();
      do_.stopKeepAlive();
    });
  });

  describe('removeSession', () => {
    it('removes session that existed', () => {
      const do_ = createDO();
      do_.sessions.set('test', { enqueue: vi.fn() });
      do_.removeSession('test');
      expect(do_.sessions.has('test')).toBe(false);
    });

    it('returns undefined when session did not exist', () => {
      const do_ = createDO();
      const existed = do_.removeSession('nonexistent');
      // Map.delete returns false for missing keys, but the function returns the result
      expect(existed).toBeFalsy();
    });
  });

  describe('closeSession', () => {
    it('closes and removes session', () => {
      const do_ = createDO();
      const mockClose = vi.fn();
      do_.sessions.set('test', { close: mockClose, enqueue: vi.fn() });
      do_.closeSession('test');
      expect(mockClose).toHaveBeenCalled();
      expect(do_.sessions.has('test')).toBe(false);
    });

    it('does nothing when session does not exist', () => {
      const do_ = createDO();
      expect(() => do_.closeSession('nonexistent')).not.toThrow();
    });

    it('handles close() error gracefully', () => {
      const do_ = createDO();
      do_.sessions.set('test', {
        close: () => {
          throw new Error('already closed');
        },
        enqueue: vi.fn(),
      });
      expect(() => do_.closeSession('test')).not.toThrow();
      expect(do_.sessions.has('test')).toBe(false);
    });
  });

  describe('stopKeepAlive', () => {
    it('clears interval and nullifies timer', () => {
      const do_ = createDO();
      do_.sessions.set('test', { enqueue: vi.fn(), close: vi.fn() });
      do_.ensureKeepAlive();
      expect(do_.keepAliveTimer).not.toBeNull();
      do_.stopKeepAlive();
      expect(do_.keepAliveTimer).toBeNull();
    });

    it('does nothing when no timer exists', () => {
      const do_ = createDO();
      expect(do_.keepAliveTimer).toBeNull();
      do_.stopKeepAlive();
      expect(do_.keepAliveTimer).toBeNull();
    });
  });
});
