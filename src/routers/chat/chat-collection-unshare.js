import { json } from '../../utils/response.js';
import { requireOwnedAndChatAuth } from './chat-collection-helpers.js';
export async function handleUnshareChat({ req, env, db, user, chatId } = {}) {
  const {
    denied,
    error: ownedErr,
    chat,
  } = await requireOwnedAndChatAuth({ req, env, db, user, action: 'chat.share', chatId });
  if (denied) return denied;
  if (ownedErr) return ownedErr;

  if (chat.share_id) {
    await db.run(
      'UPDATE chats SET share_id = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [chatId, user.sub]
    );
  }

  return json(req, { ok: true });
}
