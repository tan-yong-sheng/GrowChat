import { json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { requireOwnedChat } from '../chat-core.js';
import { requireChatAuth } from './chat-collection-helpers.js';

// eslint-disable-next-line max-params -- Cloudflare Worker handler
export async function handleShareChat(req, env, db, user, chatId, originSessionId) {
  const denied = await requireChatAuth(req, env, user, 'chat.share', chatId);
  if (denied) return denied;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  let shareId = chat.share_id;
  if (!shareId) {
    shareId = crypto.randomUUID();
    await db.run(
      'UPDATE chats SET share_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [shareId, chatId, user.sub]
    );
  }

  const updatedOwned = await requireOwnedChat(req, db, chatId, user.sub);
  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { shared: true, chat: updatedOwned.chat || null },
    })
  );

  return json(
    req,
    { share_id: shareId, share_url: `/s/${shareId}`, chat_id: chatId },
    HTTP_STATUS.OK
  );
}
