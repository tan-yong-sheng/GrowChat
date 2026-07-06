import { json } from '../../utils/response.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { requireOwnedChat } from '../chat-core.js';
import { requireChatAuth } from './chat-collection-helpers.js';

export async function handleArchiveChat(req, env, db, user, chatId, originSessionId) {
  const denied = await requireChatAuth(req, env, user, 'chat.write', chatId);
  if (denied) return denied;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  const newArchived = chat.archived ? 0 : 1;
  await db.run(
    'UPDATE chats SET archived = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
    [newArchived, chatId, user.sub]
  );

  const updatedOwned = await requireOwnedChat(req, db, chatId, user.sub);
  if (updatedOwned.error) return updatedOwned.error;
  const updated = updatedOwned.chat;

  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { archived: newArchived === 1 },
    })
  );

  return json(req, { chat: updated, archived: newArchived === 1 });
}
