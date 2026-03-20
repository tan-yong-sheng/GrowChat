import { buildPersistedAssistantContent, isStreamCancelledRow, shouldPersistAssistantContent } from './stream-utils.js';

export function createAssistantStreamLifecycle({
  db,
  env,
  req,
  user,
  chatId,
  model,
  userMsgId,
  assistantMsgId,
  citationsJson,
  getMessageSnapshot,
  getOwnedChat,
  publishRealtimeNow,
  createRealtimeEvent,
  getOriginSessionId,
  normalizeErrorMessage,
  emitSse,
}) {
  let lastPersistAt = 0;
  let lastPersistSize = 0;
  let lastCancelCheckAt = 0;

  const clearStreamingStatus = async () => {
    try {
      await db.run(
        "UPDATE messages SET status = NULL WHERE id = ? AND status IN ('streaming', 'tool_running')",
        [assistantMsgId]
      );
    } catch { }
  };

  const ensureAssistantRow = async () => {
    let inserted = false;
    try {
      await db.run(
        `INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, status, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?, ?, 'streaming', unixepoch())`,
        [assistantMsgId, chatId, '', model, citationsJson, userMsgId]
      );
      inserted = true;
    } catch {
      try {
        await db.run(
          'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
          [assistantMsgId, chatId, 'assistant', '', model, citationsJson, userMsgId]
        );
        inserted = true;
      } catch { }
    }
    if (!inserted) return false;
    try {
      await db.run(
        'UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [assistantMsgId, model, chatId, user.sub]
      );
    } catch { }
    return true;
  };

  const persistToolCalls = async (toolCallRecords) => {
    try {
      const toolCallsJson = Array.isArray(toolCallRecords) && toolCallRecords.length
        ? JSON.stringify(toolCallRecords)
        : null;
      await db.run('UPDATE messages SET tool_calls = ? WHERE id = ?', [toolCallsJson, assistantMsgId]);
    } catch { }
  };

  const persistAssistantContent = async ({
    fullText = '',
    fullReasoning = '',
    messageBlocks = [],
    force = false,
  } = {}) => {
    const now = Date.now();
    if (!shouldPersistAssistantContent({
      now,
      lastPersistAt,
      lastPersistSize,
      fullText,
      fullReasoning,
      force,
    })) return false;
    lastPersistAt = now;
    lastPersistSize = String(fullText || '').length + String(fullReasoning || '').length;
    const content = buildPersistedAssistantContent(fullText, fullReasoning);
    const blocksJson = Array.isArray(messageBlocks) && messageBlocks.length ? JSON.stringify(messageBlocks) : null;
    try {
      await db.run(
        'UPDATE messages SET content = ?, citations = ?, message_blocks = ? WHERE id = ?',
        [content, citationsJson, blocksJson, assistantMsgId]
      );
    } catch { }
    return true;
  };

  const isCancelled = async () => {
    const now = Date.now();
    if (now - lastCancelCheckAt < 900) return false;
    lastCancelCheckAt = now;
    try {
      const row = await db.first('SELECT status, error_code FROM messages WHERE id = ?', [assistantMsgId]);
      return isStreamCancelledRow(row);
    } catch {
      return false;
    }
  };

  const sendCancelAndClose = async ({ controller, encoder }) => {
    try {
      await db.run(
        "UPDATE messages SET status = 'cancelled', error_code = 'cancelled', error_message = ? WHERE id = ?",
        ['Cancelled by user', assistantMsgId]
      );
    } catch { }
    const cancelledMessage = await getMessageSnapshot(db, assistantMsgId);
    const updatedChat = await getOwnedChat(db, chatId, user.sub);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'message.cancelled',
      userId: user.sub,
      chatId,
      messageId: assistantMsgId,
      originSessionId: getOriginSessionId(req),
      data: {
        role: 'assistant',
        model,
        message: cancelledMessage,
        chat: updatedChat,
      },
    }));
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();
  };

  const sendErrorAndClose = async ({
    controller,
    encoder,
    errorCode,
    err,
    toolCallRecords = [],
    citations = null,
    parentId = userMsgId,
  }) => {
    const errorMessage = normalizeErrorMessage(err, 'LLM request failed');
    const errorDetails = normalizeErrorMessage(err, 'LLM request failed', 8000);
    try {
      await db.run(
        `UPDATE messages
         SET content = ?, model = ?, citations = ?, parent_id = ?, status = 'error',
             error_code = ?, error_message = ?, tool_calls = ?
         WHERE id = ?`,
        [
          errorDetails,
          model,
          Array.isArray(citations) ? JSON.stringify(citations) : (citations || null),
          parentId,
          errorCode,
          errorMessage,
          Array.isArray(toolCallRecords) && toolCallRecords.length ? JSON.stringify(toolCallRecords) : null,
          assistantMsgId,
        ]
      );
    } catch {
      try {
        await db.run(
          'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())',
          [
            assistantMsgId,
            chatId,
            'assistant',
            errorDetails,
            model,
            Array.isArray(citations) ? JSON.stringify(citations) : (citations || null),
            parentId,
            'error',
            errorCode,
            errorMessage,
            Array.isArray(toolCallRecords) && toolCallRecords.length ? JSON.stringify(toolCallRecords) : null,
          ]
        );
      } catch { }
    }

    const assistantError = await getMessageSnapshot(db, assistantMsgId);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'message.completed',
      userId: user.sub,
      chatId,
      messageId: assistantMsgId,
      originSessionId: getOriginSessionId(req),
      data: {
        role: 'assistant',
        model,
        error: true,
        message: assistantError,
        chat: await getOwnedChat(db, chatId, user.sub),
      },
    }));
    if (typeof emitSse === 'function') {
      await emitSse({ event: 'start', chat_id: chatId, message_id: assistantMsgId, user_message_id: userMsgId });
      await emitSse({ error: errorCode, message: errorMessage }, { persist: true });
    }
    await emitDone(controller, encoder);
    return { errorMessage, assistantError };
  };

  const emitDone = async (controller, encoder) => {
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();
  };

  return {
    clearStreamingStatus,
    ensureAssistantRow,
    persistToolCalls,
    persistAssistantContent,
    isCancelled,
    sendCancelAndClose,
    sendErrorAndClose,
  };
}
