import { json } from '../../utils/response.js';
import { requireChatListAuth } from './chat-collection-helpers.js';

export async function handleListArchivedChats(req, env, db, user) {
  const denied = await requireChatListAuth(req, env, user, 'chat.read');
  if (denied) return denied;
  const archivedChats = await db.all(
    'SELECT id, title, model, pinned, created_at, updated_at FROM chats WHERE user_id = ? AND archived = 1 ORDER BY updated_at DESC',
    [user.sub]
  );
  return json(req, { chats: archivedChats });
}
