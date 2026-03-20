import { describe, expect, it, vi } from 'vitest';
import { finalizeAssistantStream } from './stream-finalize.js';

describe('chat stream finalize', () => {
  it('persists the assistant message and publishes completion', async () => {
    const db = {
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    };
    const controller = { enqueue: vi.fn(), close: vi.fn() };
    const encoder = { encode: vi.fn((text) => text) };
    const publishRealtimeNow = vi.fn().mockResolvedValue(true);
    const createRealtimeEvent = vi.fn((event) => event);
    const getMessageSnapshot = vi.fn().mockResolvedValue({ id: 'a1' });
    const getOwnedChat = vi.fn().mockResolvedValue({ id: 'c1' });

    await finalizeAssistantStream({
      db,
      env: {},
      user: { sub: 'u1' },
      req: new Request('https://example.com'),
      chatId: 'c1',
      model: 'm1',
      assistantMsgId: 'a1',
      userMsgId: 'u1',
      citations: ['c1'],
      fullText: 'hello',
      fullReasoning: 'think',
      toolCallRecords: [{ id: 't1' }],
      messageBlocks: [{ type: 'text', content: 'hello' }],
      getMessageSnapshot,
      getOwnedChat,
      publishRealtimeNow,
      createRealtimeEvent,
      getOriginSessionId: () => 's1',
      controller,
      encoder,
    });

    expect(db.run).toHaveBeenCalled();
    expect(publishRealtimeNow).toHaveBeenCalled();
    expect(controller.enqueue).toHaveBeenCalled();
    expect(controller.close).toHaveBeenCalled();
  });
});
