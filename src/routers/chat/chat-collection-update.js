import { error } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { requireOwnedChat } from '../chat-core.js';
import { mapAuthCodeToStatus, sanitizeTitle, reloadAndPublishChat } from './chat-collection-helpers.js';

export async function handleUpdateChat(req, env, db, user, chatId, originSessionId) {
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