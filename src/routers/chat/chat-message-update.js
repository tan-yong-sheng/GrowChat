import { error, json } from '../../utils/response.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { requireOwnedChat } from '../chat-core.js';
import { publishRealtimeNow, requireChatPermission } from '../chat-message-helpers.js';

export async function handleUpdateMessage({ req, env, db, user, chatId, msgId, originSessionId }) {
  const permissionError = await requireChatPermission(req, env, user, 'chat.write', chatId);
  if (permissionError) return permissionError;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;

  const message = await db.first(
    'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ? AND chat_id = ?',
    [msgId, chatId]
  );
  if (!message) return error(req, 'Message not found', 404);

  if (message.role !== 'assistant') {
    return error(req, 'Only assistant messages can be edited in place', 400);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  const content = String(body.content || '').trim();
  if (!content) return error(req, 'content is required', 400);

  await db.batch([
    db.prepare('UPDATE messages SET content = ? WHERE id = ? AND chat_id = ?', [
      content,
      msgId,
      chatId,
    ]),
    db.prepare('UPDATE chats SET updated_at = unixepoch() WHERE id = ? AND user_id = ?', [
      chatId,
      user.sub,
    ]),
  ]);

  const updatedMessage = await db.first(
    'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ? AND chat_id = ?',
    [msgId, chatId]
  );

  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { message_id: msgId },
    })
  );

  return json(req, { message: updatedMessage }, 200);
}
