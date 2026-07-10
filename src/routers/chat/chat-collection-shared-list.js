import { json } from '../../utils/response.js';
import { requireChatListAuth } from './chat-collection-helpers.js';

export async function handleListSharedChats(req, env, db, user) {
  const denied = await requireChatListAuth(req, env, user, 'chat.read');
  if (denied) return denied;
  const sharedChats = await db.all(
    'SELECT id, title, model, pinned, share_id, created_at, updated_at FROM chats WHERE user_id = ? AND share_id IS NOT NULL ORDER BY updated_at DESC',
    [user.sub]
  );
  return json(req, { chats: sharedChats });
}
