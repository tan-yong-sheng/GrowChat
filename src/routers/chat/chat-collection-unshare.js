import { json } from '../../utils/response.js';
import { requireOwnedChat } from '../chat-core.js';
import { requireChatAuth } from './chat-collection-helpers.js';

// eslint-disable-next-line max-params -- Cloudflare Worker handler
export async function handleUnshareChat(req, env, db, user, chatId) {
  const denied = await requireChatAuth(req, env, user, 'chat.share', chatId);
  if (denied) return denied;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  if (chat.share_id) {
    await db.run(
      'UPDATE chats SET share_id = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [chatId, user.sub]
    );
  }

  return json(req, { ok: true });
}
