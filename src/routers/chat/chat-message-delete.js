import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { requireOwnedChat } from '../chat-core.js';
import { publishRealtimeNow, requireChatPermission } from '../chat-message-helpers.js';

async function deleteMessageSubtree(db, chatId, nodeId) {
  const children = await db.all('SELECT id FROM messages WHERE parent_id = ? AND chat_id = ?', [
    nodeId,
    chatId,
  ]);
  for (const child of children) {
    await deleteMessageSubtree(db, chatId, child.id);
  }
  await db.run('DELETE FROM messages WHERE id = ? AND chat_id = ?', [nodeId, chatId]);
}

export async function handleDeleteMessage({ req, env, db, user, chatId, msgId, originSessionId }) {
  const permissionError = await requireChatPermission(req, env, user, 'chat.delete', chatId);
  if (permissionError) return permissionError;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;

  const msg = await db.first('SELECT id FROM messages WHERE id = ? AND chat_id = ?', [
    msgId,
    chatId,
  ]);
  if (!msg) return error(req, 'Message not found', HTTP_STATUS.NOT_FOUND);

  await deleteMessageSubtree(db, chatId, msgId);

  const lastMsg = await db.first(
    'SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    [chatId]
  );
  if (lastMsg && lastMsg.id !== msgId) {
    await db.run(
      'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [lastMsg.id, chatId, user.sub]
    );
  } else {
    await db.run(
      'UPDATE chats SET current_message_id = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [chatId, user.sub]
    );
  }

  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { deleted_message_id: msgId },
    })
  );

  return json(req, { ok: true, deleted: msgId });
}
