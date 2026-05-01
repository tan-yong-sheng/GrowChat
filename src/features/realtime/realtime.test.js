import { describe, expect, it, vi } from 'vitest';
import {
  connectRealtimeStream,
  createRealtimeEvent,
  getOriginSessionId,
  publishRealtimeEvent,
} from './realtime.js';

describe('features/realtime', () => {
  it('creates normalized realtime events', () => {
    const event = createRealtimeEvent({
      type: 'chat.updated',
      userId: 'u1',
      chatId: 'c1',
      messageId: 'm1',
      originSessionId: ' s1 ',
      data: { ok: true },
    });

    expect(event).toMatchObject({
      type: 'chat.updated',
      user_id: 'u1',
      chat_id: 'c1',
      message_id: 'm1',
      origin_session_id: 's1',
      data: { ok: true },
    });
    expect(typeof event.ts).toBe('number');
  });

  it('reads the client session id from the request', () => {
    const req = new Request('https://example.com/api/realtime/stream?client_session_id=abc');
    expect(getOriginSessionId(req)).toBe('abc');
  });

  it('publishes realtime events through the message queue stub', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const env = {
      MESSAGE_QUEUE: {
        idFromName: vi.fn(() => 'id-1'),
        get: vi.fn(() => ({ fetch })),
      },
    };

    await expect(publishRealtimeEvent(env, { type: 'chat.updated', user_id: 'u1' })).resolves.toBe(
      true
    );
    expect(fetch).toHaveBeenCalled();
  });

  it('connects to the realtime stream through the message queue stub', async () => {
    const upstream = new Response('stream-body', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    const env = {
      MESSAGE_QUEUE: {
        idFromName: vi.fn(() => 'id-1'),
        get: vi.fn(() => ({
          fetch: vi.fn().mockResolvedValue(upstream),
        })),
      },
    };
    const req = new Request('https://example.com/api/realtime/stream', { method: 'GET' });

    const res = await connectRealtimeStream(req, env, 'u1');

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('stream-body');
  });
});
