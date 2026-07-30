import { error } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import {
  sanitizeTitle,
  reloadAndPublishChat,
  requireOwnedAndChatAuth,
} from './chat-collection-helpers.js';
export async function handleUpdateChat({ req, env, db, user, chatId, originSessionId } = {}) {
  const {
    denied,
    error: ownedErr,
    chat,
  } = await requireOwnedAndChatAuth({ req, env, db, user, action: 'chat.write', chatId });
  if (denied) return denied;
  if (ownedErr) return ownedErr;

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST);
  }

  const title = body.title !== undefined ? sanitizeTitle(body.title) : chat.title;
  const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : chat.pinned;

  await db.run(
    'UPDATE chats SET title = ?, pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
    [title, pinned, chatId, user.sub]
  );

  return await reloadAndPublishChat({ req, env, db, user, chatId, originSessionId });
}
