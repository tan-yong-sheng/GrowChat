import { describe, expect, it, vi } from 'vitest';
import { createAssistantStreamLifecycle } from './stream-lifecycle.js';

describe('chat stream lifecycle', () => {
  const makeLifecycle = () => {
    const db = {
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      first: vi.fn().mockResolvedValue({ status: 'streaming' }),
    };
    const controller = { enqueue: vi.fn(), close: vi.fn() };
    const encoder = { encode: vi.fn((text) => text) };
    const publishRealtimeNow = vi.fn().mockResolvedValue(true);
    const createRealtimeEvent = vi.fn((event) => event);
    const getMessageSnapshot = vi.fn().mockResolvedValue({ id: 'a1' });
    const getOwnedChat = vi.fn().mockResolvedValue({ id: 'c1' });
    const normalizeErrorMessage = vi.fn((value, fallback) => String(value?.message || value || fallback));

    const lifecycle = createAssistantStreamLifecycle({
      db,
      env: {},
      req: new Request('https://example.com'),
      user: { sub: 'u1' },
      chatId: 'c1',
      model: 'm1',
      userMsgId: 'u1',
      assistantMsgId: 'a1',
      citationsJson: '["c"]',
      getMessageSnapshot,
      getOwnedChat,
      publishRealtimeNow,
      createRealtimeEvent,
      getOriginSessionId: () => 's1',
      normalizeErrorMessage,
    });

    return { lifecycle, db, controller, encoder, publishRealtimeNow, getMessageSnapshot };
  };

  it('ensures an assistant row and persists content', async () => {
    const { lifecycle, db } = makeLifecycle();
    await expect(lifecycle.ensureAssistantRow()).resolves.toBe(true);
    await expect(lifecycle.persistToolCalls([{ id: 't1' }])).resolves.toBeUndefined();
    await expect(lifecycle.persistAssistantContent({ fullText: 'hello', fullReasoning: 'why', messageBlocks: [{ type: 'text' }] })).resolves.toBe(true);
    expect(db.run).toHaveBeenCalled();
  });

  it('detects cancelled rows and closes streams', async () => {
    const { lifecycle, controller, encoder, db, publishRealtimeNow } = makeLifecycle();
    db.first.mockResolvedValueOnce({ status: 'cancelled' });

    await expect(lifecycle.isCancelled()).resolves.toBe(true);
    await lifecycle.sendCancelAndClose({ controller, encoder });

    expect(controller.enqueue).toHaveBeenCalled();
    expect(controller.close).toHaveBeenCalled();
    expect(publishRealtimeNow).toHaveBeenCalled();
  });

  it('sends error close responses', async () => {
    const { lifecycle, controller, encoder, publishRealtimeNow } = makeLifecycle();
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'llm_unavailable',
      err: new Error('boom'),
      toolCallRecords: [{ id: 't1' }],
      citations: ['c1'],
    });

    expect(publishRealtimeNow).toHaveBeenCalled();
    expect(controller.enqueue).toHaveBeenCalled();
    expect(controller.close).toHaveBeenCalled();
  });
});
