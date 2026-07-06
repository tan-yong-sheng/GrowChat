import { error, json } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { mapAuthCodeToStatus } from './chat-collection-helpers.js';

export async function handleListSharedChats(req, env, db, user) {
  const authDecision = await authorize(env, user, {
    action: 'chat.read',
    resource: 'chat',
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }
  const sharedChats = await db.all(
    'SELECT id, title, model, pinned, share_id, created_at, updated_at FROM chats WHERE user_id = ? AND share_id IS NOT NULL ORDER BY updated_at DESC',
    [user.sub]
  );
  return json(req, { chats: sharedChats });
}