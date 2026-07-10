import { json } from '../../utils/response.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { requireOwnedChat } from '../chat-core.js';
import { requireOwnedAndChatAuth } from './chat-collection-helpers.js';

// eslint-disable-next-line max-params -- Cloudflare Worker handler
export async function handleArchiveChat(req, env, db, user, chatId, originSessionId) {
  const {
    denied,
    error: ownedErr,
    chat,
  } = await requireOwnedAndChatAuth(req, env, db, user, 'chat.write', chatId);
  if (denied) return denied;
  if (ownedErr) return ownedErr;

  const newArchived = chat.archived ? 0 : 1;
  await db.run(
    'UPDATE chats SET archived = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
    [newArchived, chatId, user.sub]
  );

  const { error: updatedOwnedErr, chat: updated } = await requireOwnedChat(
    req,
    db,
    chatId,
    user.sub
  );
  if (updatedOwnedErr) return updatedOwnedErr;

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
