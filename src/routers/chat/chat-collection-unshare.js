import { error, json } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { requireOwnedChat } from '../chat-core.js';
import { mapAuthCodeToStatus } from './chat-collection-helpers.js';

export async function handleUnshareChat(req, env, db, user, chatId) {
  const authDecision = await authorize(env, user, {
    action: 'chat.share',
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }

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
