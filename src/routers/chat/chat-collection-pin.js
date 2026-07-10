import { reloadAndPublishChat, requireOwnedAndChatAuth } from './chat-collection-helpers.js';

// eslint-disable-next-line max-params -- Cloudflare Worker handler
export async function handlePinChat(req, env, db, user, chatId, originSessionId) {
  const {
    denied,
    error: ownedErr,
    chat,
  } = await requireOwnedAndChatAuth(req, env, db, user, 'chat.write', chatId);
  if (denied) return denied;
  if (ownedErr) return ownedErr;

  const nextPinned = chat.pinned ? 0 : 1;
  await db.run(
    'UPDATE chats SET pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
    [nextPinned, chatId, user.sub]
  );

  return await reloadAndPublishChat(req, env, db, user, chatId, originSessionId);
}
