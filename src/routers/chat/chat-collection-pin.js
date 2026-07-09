import { requireOwnedChat } from '../chat-core.js';
import { reloadAndPublishChat, requireChatAuth } from './chat-collection-helpers.js';

// eslint-disable-next-line max-params -- Cloudflare Worker handler
export async function handlePinChat(req, env, db, user, chatId, originSessionId) {
  const denied = await requireChatAuth(req, env, user, 'chat.write', chatId);
  if (denied) return denied;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  const nextPinned = chat.pinned ? 0 : 1;
  await db.run(
    'UPDATE chats SET pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
    [nextPinned, chatId, user.sub]
  );

  return await reloadAndPublishChat(req, env, db, user, chatId, originSessionId);
}
