import { error } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { requireOwnedChat } from '../chat-core.js';
import { mapAuthCodeToStatus, reloadAndPublishChat } from './chat-collection-helpers.js';

export async function handlePinChat(req, env, db, user, chatId, originSessionId) {
  const authDecision = await authorize(env, user, {
    action: 'chat.write',
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }

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
