import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { requireOwnedChat } from '../chat-core.js';
import { requireChatPermission } from '../chat-message-helpers.js';

export async function handleMessageStatus({ req, env, db, user, chatId, msgId }) {
  const permissionError = await requireChatPermission(req, env, user, 'chat.read', chatId);
  if (permissionError) return permissionError;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  const msg = await db.first(
    'SELECT id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, message_blocks, created_at FROM messages WHERE id = ? AND chat_id = ?',
    [msgId, chatId]
  );
  if (!msg) return error(req, 'Message not found', HTTP_STATUS.NOT_FOUND);

  return json(req, { ok: true, message: msg, chat });
}
