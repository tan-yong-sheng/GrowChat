import {
  buildPersistedAssistantContent,
  isStreamCancelledRow,
  shouldPersistAssistantContent,
} from './stream-utils.js';

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
    } catch {
      // ignore
    }
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
      } catch {
        // ignore
      }
    }
    if (!inserted) return false;
    try {
      await db.run(
        'UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [assistantMsgId, model, chatId, user.sub]
      );
    } catch {
      // ignore
    }
    return true;
  };

  const persistToolCalls = async (toolCallRecords) => {
    try {
      const toolCallsJson =
        Array.isArray(toolCallRecords) && toolCallRecords.length
          ? JSON.stringify(toolCallRecords)
          : null;
      await db.run('UPDATE messages SET tool_calls = ? WHERE id = ?', [
        toolCallsJson,
        assistantMsgId,
      ]);
    } catch {
      // ignore
    }
  };

  const persistAssistantContent = async ({
    fullText = '',
    fullReasoning = '',
    messageBlocks = [],
    force = false,
  } = {}) => {
    const now = Date.now();
    if (
      !shouldPersistAssistantContent({
        now,
        lastPersistAt,
        lastPersistSize,
        fullText,
        fullReasoning,
        force,
      })
    )
      return false;
    lastPersistAt = now;
    lastPersistSize = String(fullText || '').length + String(fullReasoning || '').length;
    const content = buildPersistedAssistantContent(fullText, fullReasoning);
    const blocksJson =
      Array.isArray(messageBlocks) && messageBlocks.length ? JSON.stringify(messageBlocks) : null;
    try {
      await db.run(
        'UPDATE messages SET content = ?, citations = ?, message_blocks = ? WHERE id = ?',
        [content, citationsJson, blocksJson, assistantMsgId]
      );
    } catch {
      // ignore
    }
    return true;
  };

  const isCancelled = async () => {
    const now = Date.now();
    if (now - lastCancelCheckAt < 900) return false;
    lastCancelCheckAt = now;
    try {
      const row = await db.first('SELECT status, error_code FROM messages WHERE id = ?', [
        assistantMsgId,
      ]);
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
    } catch {
      // ignore
    }
    const cancelledMessage = await getMessageSnapshot(db, assistantMsgId);
    const updatedChat = await getOwnedChat(db, chatId, user.sub);
    await publishRealtimeNow(
      env,
      createRealtimeEvent({
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
      })
    );
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller.close();
  };

  function serializeCitations(citations) {
    return Array.isArray(citations) ? JSON.stringify(citations) : citations || null;
  }

  function serializeToolCalls(toolCallRecords) {
    return Array.isArray(toolCallRecords) && toolCallRecords.length
      ? JSON.stringify(toolCallRecords)
      : null;
  }

  async function persistAssistantErrorMessage(params) {
    const {
      db: dbRef,
      assistantMsgId: msgId,
      chatId: chatIdRef,
      model: modelRef,
      parentId,
      errorCode,
      errorMessage,
      errorDetails,
      citationsJson,
      toolCallsJson,
    } = params;
    try {
      await dbRef.run(
        `UPDATE messages
         SET content = ?, model = ?, citations = ?, parent_id = ?, status = 'error',
             error_code = ?, error_message = ?, tool_calls = ?
         WHERE id = ?`,
        [
          errorDetails,
          modelRef,
          citationsJson,
          parentId,
          errorCode,
          errorMessage,
          toolCallsJson,
          msgId,
        ]
      );
    } catch {
      try {
        await dbRef.run(
          'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())',
          [
            msgId,
            chatIdRef,
            'assistant',
            errorDetails,
            modelRef,
            citationsJson,
            parentId,
            'error',
            errorCode,
            errorMessage,
            toolCallsJson,
          ]
        );
      } catch {
        // ignore
      }
    }
  }

  async function publishAssistantErrorEvent(params) {
    const {
      db: dbRef,
      env: envRef,
      user,
      chatId: chatIdRef,
      assistantMsgId: msgId,
      model: modelRef,
    } = params;
    const assistantError = await getMessageSnapshot(dbRef, msgId);
    await publishRealtimeNow(
      envRef,
      createRealtimeEvent({
        type: 'message.completed',
        userId: user.sub,
        chatId: chatIdRef,
        messageId: msgId,
        originSessionId: getOriginSessionId(req),
        data: {
          role: 'assistant',
          model: modelRef,
          error: true,
          message: assistantError,
          chat: await getOwnedChat(dbRef, chatIdRef, user.sub),
        },
      })
    );
    return assistantError;
  }

  async function emitErrorSsePayload(params) {
    const {
      emitSse: emit,
      chatId: chatIdRef,
      assistantMsgId: msgId,
      userMsgId: userMsgIdRef,
      errorCode,
      errorMessage,
    } = params;
    if (typeof emit !== 'function') return;
    await emit({
      event: 'start',
      chat_id: chatIdRef,
      message_id: msgId,
      user_message_id: userMsgIdRef,
    });
    await emit({ error: errorCode, message: errorMessage }, { persist: true });
  }

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
    await persistAssistantErrorMessage({
      db,
      assistantMsgId,
      chatId,
      model,
      parentId,
      errorCode,
      errorMessage,
      errorDetails,
      citationsJson: serializeCitations(citations),
      toolCallsJson: serializeToolCalls(toolCallRecords),
    });
    const assistantError = await publishAssistantErrorEvent({
      db,
      env,
      user,
      chatId,
      assistantMsgId,
      model,
    });
    await emitErrorSsePayload({
      emitSse,
      chatId,
      assistantMsgId,
      userMsgId,
      errorCode,
      errorMessage,
    });
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
