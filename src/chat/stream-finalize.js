import { buildPersistedAssistantContent } from './stream-utils.js';

export async function finalizeAssistantStream({
  db,
  env,
  user,
  req,
  chatId,
  model,
  assistantMsgId,
  userMsgId,
  citations,
  fullText,
  fullReasoning,
  toolCallRecords = [],
  messageBlocks = [],
  getMessageSnapshot,
  getOwnedChat,
  publishRealtimeNow,
  createRealtimeEvent,
  getOriginSessionId,
  controller,
  encoder,
}) {
  let persistedText = buildPersistedAssistantContent(fullText, fullReasoning);
  if (!String(persistedText || '').trim()) {
    persistedText = 'I could not produce a final response for this request.';
  }
  const toolCallsJson = Array.isArray(toolCallRecords) && toolCallRecords.length ? JSON.stringify(toolCallRecords) : null;
  const blocksJson = Array.isArray(messageBlocks) && messageBlocks.length ? JSON.stringify(messageBlocks) : null;

  try {
    const update = await db.run(
      `UPDATE messages
       SET content = ?, model = ?, citations = ?, parent_id = ?, status = NULL,
           error_code = NULL, error_message = NULL, tool_calls = ?, message_blocks = ?
       WHERE id = ?`,
      [persistedText, model, Array.isArray(citations) ? JSON.stringify(citations) : (citations || null), userMsgId, toolCallsJson, blocksJson, assistantMsgId]
    );
    if (!update?.meta?.changes) {
      await db.run(
        'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, tool_calls, message_blocks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())',
        [assistantMsgId, chatId, 'assistant', persistedText, model, Array.isArray(citations) ? JSON.stringify(citations) : (citations || null), userMsgId, toolCallsJson, blocksJson]
      );
    }
  } catch {
    await db.run(
      'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, tool_calls, message_blocks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())',
      [assistantMsgId, chatId, 'assistant', persistedText, model, Array.isArray(citations) ? JSON.stringify(citations) : (citations || null), userMsgId, toolCallsJson, blocksJson]
    );
  }

  await db.run(
    'UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
    [assistantMsgId, model, chatId, user.sub]
  );

  const completedAssistantMessage = await getMessageSnapshot(db, assistantMsgId);
  const updatedChatAfterAssistantMessage = await getOwnedChat(db, chatId, user.sub);
  await publishRealtimeNow(env, createRealtimeEvent({
    type: 'message.completed',
    userId: user.sub,
    chatId,
    messageId: assistantMsgId,
    originSessionId: getOriginSessionId(req),
    data: {
      role: 'assistant',
      model,
      citations,
      message: completedAssistantMessage,
      chat: updatedChatAfterAssistantMessage,
    },
  }));

  await db.run('UPDATE chats SET model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?', [model, chatId, user.sub]);
  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();

  return { persistedText, completedAssistantMessage, updatedChatAfterAssistantMessage };
}
