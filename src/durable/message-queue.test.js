import { describe, expect, it, vi } from 'vitest';
import { MessageQueueDO } from './message-queue.js';

describe('MessageQueueDO', () => {
  function makeState() {
    return {};
  }

  function makeEnv() {
    return {};
  }

  function makeReq({
    method = 'GET',
    pathname = '/connect',
    headers = new Headers(),
    body = null,
  } = {}) {
    return new Request(`https://example.com${pathname}`, { method, headers, body });
  }

  it('constructs with state and env', () => {
    const state = makeState();
    const env = makeEnv();
    const do_ = new MessageQueueDO(state, env);
    expect(do_.state).toBe(state);
    expect(do_.env).toBe(env);
    expect(do_.sessions.size).toBe(0);
    expect(do_.keepAliveTimer).toBeNull();
  });

  it('handles connect requests (GET)', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const req = makeReq({
      method: 'GET',
      pathname: '/connect',
      headers: new Headers({ 'x-client-session-id': 'sess-1' }),
    });

    const res = await do_.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(do_.sessions.size).toBe(1);
  });

  it('handles connect requests (POST)', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const req = makeReq({ method: 'POST', pathname: '/connect' });

    const res = await do_.fetch(req);
    expect(res.status).toBe(200);
    expect(do_.sessions.size).toBe(1);
  });

  it('returns 404 for unknown paths', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const req = makeReq({ pathname: '/unknown' });

    const res = await do_.fetch(req);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
  });

  it('returns 404 for unsupported methods', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const req = makeReq({ method: 'DELETE', pathname: '/publish' });

    const res = await do_.fetch(req);
    expect(res.status).toBe(404);
  });

  it('publishes events to all sessions', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const connectReq = makeReq({
      pathname: '/connect',
      headers: new Headers({ 'x-client-session-id': 'sess-1' }),
    });
    await do_.fetch(connectReq);

    const event = { type: 'chat.updated', data: { id: 'c1' } };
    const publishReq = makeReq({
      method: 'POST',
      pathname: '/publish',
      body: JSON.stringify(event),
    });

    const res = await do_.fetch(publishReq);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.delivered).toBe(1);
  });

  it('returns 400 for invalid JSON on publish', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const publishReq = makeReq({
      method: 'POST',
      pathname: '/publish',
      body: 'not-json',
    });

    const res = await do_.fetch(publishReq);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('returns 400 for non-object event type', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const publishReq = makeReq({
      method: 'POST',
      pathname: '/publish',
      body: JSON.stringify('string-event'),
    });

    const res = await do_.fetch(publishReq);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_event');
  });

  it('returns 400 for null event', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const publishReq = makeReq({
      method: 'POST',
      pathname: '/publish',
      body: JSON.stringify(null),
    });

    const res = await do_.fetch(publishReq);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_event');
  });

  it('returns 400 for missing event type', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const publishReq = makeReq({
      method: 'POST',
      pathname: '/publish',
      body: JSON.stringify({ data: {} }),
    });

    const res = await do_.fetch(publishReq);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('missing_type');
  });

  it('returns 413 for oversized events', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const publishReq = makeReq({
      method: 'POST',
      pathname: '/publish',
      body: JSON.stringify({ type: 'test', data: 'x'.repeat(100 * 1024) }),
    });

    const res = await do_.fetch(publishReq);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('event_too_large');
  });

  it('delivers 0 when no sessions exist', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const publishReq = makeReq({
      method: 'POST',
      pathname: '/publish',
      body: JSON.stringify({ type: 'test' }),
    });

    const res = await do_.fetch(publishReq);
    const json = await res.json();
    expect(json.delivered).toBe(0);
  });

  it('cleans up closed sessions on publish', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const connectReq = makeReq({
      pathname: '/connect',
      headers: new Headers({ 'x-client-session-id': 'sess-bad' }),
    });
    await do_.fetch(connectReq);

    // Corrupt the session controller so enqueue throws
    const badController = {
      enqueue: vi.fn(() => {
        throw new Error('closed');
      }),
    };
    do_.sessions.set('sess-bad', badController);

    const publishReq = makeReq({
      method: 'POST',
      pathname: '/publish',
      body: JSON.stringify({ type: 'test' }),
    });

    const res = await do_.fetch(publishReq);
    const json = await res.json();
    expect(json.delivered).toBe(0);
    expect(do_.sessions.has('sess-bad')).toBe(false);
  });

  it('generates UUID when session-id header is missing', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const req = makeReq({ pathname: '/connect' });

    const res = await do_.fetch(req);
    expect(res.status).toBe(200);
    expect(do_.sessions.size).toBe(1);
  });

  it('sanitizes session id by removing control chars', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    // Create a request with control chars that get filtered
    const rawId = 'test\x01\x02\x7Fok';
    const req = makeReq({
      pathname: '/connect',
      headers: new Headers({ 'x-client-session-id': rawId }),
    });

    const res = await do_.fetch(req);
    expect(res.status).toBe(200);
    // The sanitized id should not contain control chars
    const entries = Array.from(do_.sessions.keys());
    expect(entries[0]).toBe('testok');
  });

  it('truncates session id to 200 chars', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const longId = 'a'.repeat(300);
    const req = makeReq({
      pathname: '/connect',
      headers: new Headers({ 'x-client-session-id': longId }),
    });

    const res = await do_.fetch(req);
    expect(res.status).toBe(200);
    const entries = Array.from(do_.sessions.keys());
    expect(entries[0].length).toBe(200);
  });

  it('closes existing session on reconnect', async () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const req1 = makeReq({
      pathname: '/connect',
      headers: new Headers({ 'x-client-session-id': 's1' }),
    });
    await do_.fetch(req1);

    const req2 = makeReq({
      pathname: '/connect',
      headers: new Headers({ 'x-client-session-id': 's1' }),
    });
    const res2 = await do_.fetch(req2);
    expect(res2.status).toBe(200);
    // Should still have exactly one session
    expect(do_.sessions.size).toBe(1);
  });

  it('starts and stops keepalive timer', async () => {
    vi.useFakeTimers();
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    const req = makeReq({
      pathname: '/connect',
      headers: new Headers({ 'x-client-session-id': 's1' }),
    });

    await do_.fetch(req);
    expect(do_.keepAliveTimer).not.toBeNull();

    // Cancel the stream
    const controller = do_.sessions.get('s1');
    expect(controller).toBeDefined();
    do_.removeSession('s1');
    expect(do_.sessions.size).toBe(0);
    expect(do_.keepAliveTimer).toBeNull();

    vi.useRealTimers();
  });

  it('does not double-start keepalive', async () => {
    vi.useFakeTimers();
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    do_.keepAliveTimer = 'fake';

    do_.ensureKeepAlive();
    expect(do_.keepAliveTimer).toBe('fake');

    vi.useRealTimers();
  });

  it('gracefully handles stopKeepAlive with no timer', () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    expect(() => do_.stopKeepAlive()).not.toThrow();
    expect(do_.keepAliveTimer).toBeNull();
  });

  it('handles removeSession when session never existed', () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    expect(() => do_.removeSession('nonexistent')).not.toThrow();
  });

  it('handles closeSession when controller is missing', () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    expect(() => do_.closeSession('nonexistent')).not.toThrow();
  });

  it('handles closeSession when controller.close throws', () => {
    const do_ = new MessageQueueDO(makeState(), makeEnv());
    do_.sessions.set('s1', {
      close: vi.fn(() => {
        throw new Error('already closed');
      }),
    });
    expect(() => do_.closeSession('s1')).not.toThrow();
    expect(do_.sessions.has('s1')).toBe(false);
  });
});
