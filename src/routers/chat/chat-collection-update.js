import { error } from '../../utils/response.js';
import { requireOwnedChat } from '../chat-core.js';
import { sanitizeTitle, reloadAndPublishChat, requireChatAuth } from './chat-collection-helpers.js';

export async function handleUpdateChat(req, env, db, user, chatId, originSessionId) {
  const denied = await requireChatAuth(req, env, user, 'chat.write', chatId);
  if (denied) return denied;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  const title = body.title !== undefined ? sanitizeTitle(body.title) : chat.title;
  const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : chat.pinned;

  await db.run(
    'UPDATE chats SET title = ?, pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
    [title, pinned, chatId, user.sub]
  );

  return await reloadAndPublishChat(req, env, db, user, chatId, originSessionId);
}
