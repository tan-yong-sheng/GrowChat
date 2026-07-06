import { error, json } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { mapAuthCodeToStatus } from './chat-collection-helpers.js';

export async function handleListArchivedChats(req, env, db, user) {
  const authDecision = await authorize(env, user, {
    action: 'chat.read',
    resource: 'chat',
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }
  const archivedChats = await db.all(
    'SELECT id, title, model, pinned, created_at, updated_at FROM chats WHERE user_id = ? AND archived = 1 ORDER BY updated_at DESC',
    [user.sub]
  );
  return json(req, { chats: archivedChats });
}