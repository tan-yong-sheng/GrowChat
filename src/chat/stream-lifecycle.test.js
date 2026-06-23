import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAssistantStreamLifecycle } from './stream-lifecycle.js';

vi.mock('./stream-utils.js', () => ({
  buildPersistedAssistantContent: vi.fn((text, reasoning) => {
    if (!reasoning || !reasoning.trim()) return String(text || '');
    return `${String(text || '')}\n\n<thinking>${reasoning.trim()}</thinking>`;
  }),
  shouldPersistAssistantContent: vi.fn().mockReturnValue(true),
  isStreamCancelledRow: vi.fn((row) => {
    if (!row) return false;
    const status = String(row.status || '').toLowerCase();
    const code = String(row.error_code || '').toLowerCase();
    return status === 'cancelled' || status === 'cancel_requested' || code === 'cancelled';
  }),
}));

import {
  buildPersistedAssistantContent,
  isStreamCancelledRow,
  shouldPersistAssistantContent,
} from './stream-utils.js';

describe('chat stream lifecycle', () => {
  let db;
  let controller;
  let encoder;
  let publishRealtimeNow;
  let createRealtimeEvent;
  let getMessageSnapshot;
  let getOwnedChat;
  let normalizeErrorMessage;
  let emitSse;
  let req;
  let lifecycle;

  beforeEach(() => {
    vi.clearAllMocks();
    db = {
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      first: vi.fn().mockResolvedValue({ status: 'streaming' }),
    };
    controller = { enqueue: vi.fn(), close: vi.fn() };
    encoder = { encode: vi.fn((text) => `encoded:${text}`) };
    publishRealtimeNow = vi.fn().mockResolvedValue(true);
    createRealtimeEvent = vi.fn((event) => event);
    getMessageSnapshot = vi.fn().mockResolvedValue({ id: 'a1' });
    getOwnedChat = vi.fn().mockResolvedValue({ id: 'c1' });
    normalizeErrorMessage = vi.fn((value, fallback, maxLen) => {
      const str = String(value?.message || value || fallback);
      if (maxLen && str.length > maxLen) return str.slice(0, maxLen);
      return str;
    });
    emitSse = vi.fn().mockResolvedValue(undefined);
    req = new Request('https://example.com');

    lifecycle = createAssistantStreamLifecycle({
      db,
      env: { QUEUE: 'q' },
      req,
      user: { sub: 'u1' },
      chatId: 'c1',
      model: 'm1',
      userMsgId: 'u1',
      assistantMsgId: 'a1',
      citationsJson: '[]',
      getMessageSnapshot,
      getOwnedChat,
      publishRealtimeNow,
      createRealtimeEvent,
      getOriginSessionId: () => 's1',
      normalizeErrorMessage,
      emitSse,
    });
  });

  it('clears streaming status with correct SQL and params', async () => {
    await lifecycle.clearStreamingStatus();
    expect(db.run).toHaveBeenCalledTimes(1);
    expect(db.run).toHaveBeenCalledWith(
      "UPDATE messages SET status = NULL WHERE id = ? AND status IN ('streaming', 'tool_running')",
      ['a1']
    );
  });

  it('survives clearStreamingStatus db.run rejection', async () => {
    db.run.mockRejectedValueOnce(new Error('db boom'));
    await expect(lifecycle.clearStreamingStatus()).resolves.toBeUndefined();
    expect(db.run).toHaveBeenCalledTimes(1);
  });

  it('ensureAssistantRow inserts on first attempt', async () => {
    db.run.mockResolvedValueOnce({ meta: { changes: 1, last_row_id: 1 } });
    const result = await lifecycle.ensureAssistantRow();
    expect(result).toBe(true);
    expect(db.run).toHaveBeenCalledTimes(2);
  });

  it('ensureAssistantRow falls back to second insert when first fails', async () => {
    let callCount = 0;
    db.run.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) return Promise.reject(new Error('first insert fails'));
      return Promise.resolve({ meta: { changes: 1 } });
    });
    const result = await lifecycle.ensureAssistantRow();
    expect(result).toBe(true);
    expect(db.run).toHaveBeenCalledTimes(3);
  });

  it('returns false when both inserts fail', async () => {
    db.run.mockRejectedValue(new Error('always fails'));
    const result = await lifecycle.ensureAssistantRow();
    expect(result).toBe(false);
  });

  it('ensureAssistantRow survives update failure', async () => {
    let callCount = 0;
    db.run.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) return Promise.resolve({ meta: { changes: 1 } });
      return Promise.reject(new Error('update fails'));
    });
    const result = await lifecycle.ensureAssistantRow();
    expect(result).toBe(true);
  });

  it('persistToolCalls with empty array sets null', async () => {
    await lifecycle.persistToolCalls([]);
    expect(db.run).toHaveBeenCalledWith('UPDATE messages SET tool_calls = ? WHERE id = ?', [
      null,
      'a1',
    ]);
  });

  it('persistToolCalls with non-array sets null', async () => {
    await lifecycle.persistToolCalls(null);
    expect(db.run).toHaveBeenCalledWith('UPDATE messages SET tool_calls = ? WHERE id = ?', [
      null,
      'a1',
    ]);
  });

  it('persistToolCalls with records stringifies them', async () => {
    const records = [{ id: 't1', name: 'tool' }];
    await lifecycle.persistToolCalls(records);
    expect(db.run).toHaveBeenCalledWith('UPDATE messages SET tool_calls = ? WHERE id = ?', [
      JSON.stringify(records),
      'a1',
    ]);
  });

  it('survives persistToolCalls db.run rejection', async () => {
    db.run.mockRejectedValueOnce(new Error('db boom'));
    await expect(lifecycle.persistToolCalls([{ id: 't1' }])).resolves.toBeUndefined();
  });

  it('persistAssistantContent respects shouldPersistAssistantContent', async () => {
    shouldPersistAssistantContent.mockReturnValueOnce(false);
    const result = await lifecycle.persistAssistantContent({ fullText: 'x' });
    expect(result).toBe(false);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('persistAssistantContent persists when allowed', async () => {
    const result = await lifecycle.persistAssistantContent({
      fullText: 'hello',
      fullReasoning: 'thinking',
      messageBlocks: [{ type: 'text' }],
    });
    expect(result).toBe(true);
    expect(buildPersistedAssistantContent).toHaveBeenCalledWith('hello', 'thinking');
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE messages SET content = ?, citations = ?, message_blocks = ? WHERE id = ?',
      [expect.any(String), '[]', JSON.stringify([{ type: 'text' }]), 'a1']
    );
  });

  it('persistAssistantContent uses null blocks when array empty', async () => {
    await lifecycle.persistAssistantContent({ fullText: 'hi', messageBlocks: [] });
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE messages SET content = ?, citations = ?, message_blocks = ? WHERE id = ?',
      [expect.any(String), '[]', null, 'a1']
    );
  });

  it('persistAssistantContent uses null blocks when non-array passed', async () => {
    await lifecycle.persistAssistantContent({ fullText: 'hi', messageBlocks: undefined });
    expect(db.run).toHaveBeenCalledWith(
      'UPDATE messages SET content = ?, citations = ?, message_blocks = ? WHERE id = ?',
      [expect.any(String), '[]', null, 'a1']
    );
  });

  it('persistAssistantContent survives db.run rejection', async () => {
    db.run.mockRejectedValueOnce(new Error('db boom'));
    await lifecycle.persistAssistantContent({ fullText: 'x' });
  });

  it('persistAssistantContent with force=true propagates correctly', async () => {
    await lifecycle.persistAssistantContent({ fullText: 'a', force: true });
    expect(shouldPersistAssistantContent).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    );
  });

  it('isCancelled returns false within 900ms of prior check', async () => {
    db.first.mockResolvedValueOnce({ status: 'cancelled', error_code: null });
    // First check queries DB and returns true
    const r1 = await lifecycle.isCancelled();
    expect(r1).toBe(true);
    // Second check immediately after returns false without re-querying
    // (the code throttles checks and defaults to false within the window)
    const r2 = await lifecycle.isCancelled();
    expect(r2).toBe(false);
    expect(db.first).toHaveBeenCalledTimes(1);
  });

  it('isCancelled re-queries after 900ms elapsed', async () => {
    const now = Date.now();
    // Override Date.now to control time
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    db.first.mockResolvedValueOnce({ status: 'streaming' });
    const r1 = await lifecycle.isCancelled();
    expect(r1).toBe(false);
    expect(db.first).toHaveBeenCalledTimes(1);

    // Advance time past threshold
    dateSpy.mockReturnValue(now + 1000);
    db.first.mockResolvedValueOnce({ status: 'cancelled' });
    const r2 = await lifecycle.isCancelled();
    expect(r2).toBe(true);
    expect(db.first).toHaveBeenCalledTimes(2);

    dateSpy.mockRestore();
  });

  it('isCancelled handles db failure gracefully', async () => {
    db.first.mockRejectedValue(new Error('db boom'));
    const result = await lifecycle.isCancelled();
    expect(result).toBe(false);
  });

  it('sendCancelAndClose updates db and publishes event', async () => {
    await lifecycle.sendCancelAndClose({ controller, encoder });

    expect(db.run).toHaveBeenCalledWith(
      "UPDATE messages SET status = 'cancelled', error_code = 'cancelled', error_message = ? WHERE id = ?",
      ['Cancelled by user', 'a1']
    );
    expect(publishRealtimeNow).toHaveBeenCalledTimes(1);
    expect(controller.enqueue).toHaveBeenCalledWith('encoded:data: [DONE]\n\n');
    expect(controller.close).toHaveBeenCalledTimes(1);
  });

  it('sendCancelAndClose survives db.run rejection', async () => {
    db.run.mockRejectedValueOnce(new Error('db boom'));
    await lifecycle.sendCancelAndClose({ controller, encoder });
    expect(publishRealtimeNow).toHaveBeenCalledTimes(1);
    expect(controller.close).toHaveBeenCalledTimes(1);
  });

  it('sendCancelAndClose passes correct event shape to publishRealtimeNow', async () => {
    await lifecycle.sendCancelAndClose({ controller, encoder });
    expect(publishRealtimeNow).toHaveBeenCalledWith(
      { QUEUE: 'q' },
      expect.objectContaining({
        type: 'message.cancelled',
        userId: 'u1',
        chatId: 'c1',
        messageId: 'a1',
        originSessionId: 's1',
        data: expect.objectContaining({
          role: 'assistant',
          model: 'm1',
          message: { id: 'a1' },
          chat: { id: 'c1' },
        }),
      })
    );
  });

  it('sendErrorAndClose updates message with error and publishes event', async () => {
    const err = new Error('llm down');
    normalizeErrorMessage.mockImplementation((v, fallback, maxLen) => {
      const str = String(v?.message || v || fallback);
      if (maxLen && str.length > maxLen) return str.slice(0, maxLen);
      return str;
    });

    await lifecycle.sendErrorAndClose({ controller, encoder, errorCode: 'llm_unavailable', err });

    expect(normalizeErrorMessage).toHaveBeenCalledWith(err, 'LLM request failed');
    expect(normalizeErrorMessage).toHaveBeenCalledWith(err, 'LLM request failed', 8000);
    expect(db.run).toHaveBeenCalled();
    expect(publishRealtimeNow).toHaveBeenCalledWith(
      { QUEUE: 'q' },
      expect.objectContaining({
        type: 'message.completed',
        data: expect.objectContaining({
          error: true,
        }),
      })
    );
    expect(controller.enqueue).toHaveBeenCalledWith('encoded:data: [DONE]\n\n');
    expect(controller.close).toHaveBeenCalledTimes(1);
  });

  it('sendErrorAndClose stringifies citations array', async () => {
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
      citations: ['c1', 'c2'],
    });
    const updateCall = db.run.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE messages')
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall[1][2]).toBe(JSON.stringify(['c1', 'c2']));
  });

  it('sendErrorAndClose passes stringified citations when array empty', async () => {
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
      citations: [],
    });
    const updateCall = db.run.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE messages')
    );
    expect(updateCall[1][2]).toBe('[]');
  });

  it('sendErrorAndClose passes null citations when null', async () => {
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
      citations: null,
    });
    const updateCall = db.run.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE messages')
    );
    expect(updateCall[1][2]).toBeNull();
  });

  it('sendErrorAndClose stringifies toolCallRecords', async () => {
    const records = [{ id: 't1' }];
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
      toolCallRecords: records,
    });
    const updateCall = db.run.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE messages')
    );
    expect(updateCall[1][6]).toBe(JSON.stringify(records));
  });

  it('sendErrorAndClose falls back to INSERT when UPDATE fails', async () => {
    let runCount = 0;
    db.run.mockImplementation((sql) => {
      runCount++;
      if (runCount === 1 && String(sql).includes('UPDATE')) {
        return Promise.reject(new Error('update fails'));
      }
      return Promise.resolve({ meta: { changes: 1 } });
    });
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
    });
    // UPDATE fails + INSERT succeeds = 2 db.run calls inside sendErrorAndClose
    const dbRunCalls = db.run.mock.calls.filter((c) => typeof c[0] === 'string');
    expect(dbRunCalls.length).toBe(2);
    expect(dbRunCalls[0][0]).toContain('UPDATE');
    expect(dbRunCalls[1][0]).toContain('INSERT');
  });

  it('sendErrorAndClose survives both update and insert failure', async () => {
    db.run.mockRejectedValue(new Error('db down'));
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
    });
    expect(publishRealtimeNow).toHaveBeenCalled();
    expect(controller.close).toHaveBeenCalled();
  });

  it('sendErrorAndClose passes parentId through', async () => {
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
      parentId: 'parent_custom',
    });
    const updateCall = db.run.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE messages')
    );
    expect(updateCall[1][3]).toBe('parent_custom');
  });

  it('sendErrorAndClose uses userMsgId when parentId omitted', async () => {
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
    });
    const updateCall = db.run.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE messages')
    );
    expect(updateCall[1][3]).toBe('u1');
  });

  it('sendErrorAndClose emits SSE events when emitSse is a function', async () => {
    await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'err1',
      err: new Error('x'),
    });
    expect(emitSse).toHaveBeenCalledWith({
      event: 'start',
      chat_id: 'c1',
      message_id: 'a1',
      user_message_id: 'u1',
    });
    expect(emitSse).toHaveBeenCalledWith(
      { error: 'err1', message: expect.any(String) },
      { persist: true }
    );
  });

  it('sendErrorAndClose skips SSE if emitSse not a function', async () => {
    const lifecycleNoEmit = createAssistantStreamLifecycle({
      db,
      env: {},
      req,
      user: { sub: 'u1' },
      chatId: 'c1',
      model: 'm1',
      userMsgId: 'u1',
      assistantMsgId: 'a1',
      citationsJson: '[]',
      getMessageSnapshot,
      getOwnedChat,
      publishRealtimeNow,
      createRealtimeEvent,
      getOriginSessionId: () => 's1',
      normalizeErrorMessage,
      emitSse: null,
    });
    await lifecycleNoEmit.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'e1',
      err: new Error('x'),
    });
    expect(emitSse).not.toHaveBeenCalled();
    expect(controller.close).toHaveBeenCalled();
  });

  it('sendErrorAndClose returns error info', async () => {
    normalizeErrorMessage.mockReturnValue('normalized error');
    getMessageSnapshot.mockResolvedValue({ id: 'a1', status: 'error' });
    const result = await lifecycle.sendErrorAndClose({
      controller,
      encoder,
      errorCode: 'code1',
      err: new Error('boom'),
    });
    expect(result).toEqual({
      errorMessage: 'normalized error',
      assistantError: { id: 'a1', status: 'error' },
    });
  });

  it('getOriginSessionId is called from sendCancelAndClose', async () => {
    const getOriginSessionId = vi.fn().mockReturnValue('session_xyz');
    const localLifecycle = createAssistantStreamLifecycle({
      db,
      env: {},
      req,
      user: { sub: 'u1' },
      chatId: 'c1',
      model: 'm1',
      userMsgId: 'u1',
      assistantMsgId: 'a1',
      citationsJson: '[]',
      getMessageSnapshot,
      getOwnedChat,
      publishRealtimeNow,
      createRealtimeEvent,
      getOriginSessionId,
      normalizeErrorMessage,
    });
    await localLifecycle.sendCancelAndClose({ controller, encoder });
    expect(getOriginSessionId).toHaveBeenCalledWith(req);
  });

  it('handles isStreamCancelledRow code path for cancel_requested status', async () => {
    db.first.mockResolvedValueOnce({ status: 'cancel_requested', error_code: null });
    isStreamCancelledRow.mockReturnValueOnce(true);
    const r = await lifecycle.isCancelled();
    expect(r).toBe(true);
  });

  it('handles isStreamCancelledRow code path for error_code cancelled', async () => {
    db.first.mockResolvedValueOnce({ status: 'ok', error_code: 'cancelled' });
    isStreamCancelledRow.mockReturnValueOnce(true);
    const r = await lifecycle.isCancelled();
    expect(r).toBe(true);
  });

  it('persistAssistantContent with default args carries internal state', async () => {
    const result = await lifecycle.persistAssistantContent();
    expect(result).toBe(true);
    expect(shouldPersistAssistantContent).toHaveBeenCalledTimes(1);
    const args = shouldPersistAssistantContent.mock.calls[0][0];
    expect(args.fullText).toBe('');
    expect(args.fullReasoning).toBe('');
    expect(args.force).toBe(false);
    expect(args.lastPersistAt).toBe(0);
    expect(args.lastPersistSize).toBe(0);
    expect(typeof args.now).toBe('number');
  });
});
