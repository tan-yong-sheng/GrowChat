import { error, json } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { requireOwnedChat } from '../chat-core.js';
import { mapAuthCodeToStatus } from './chat-collection-helpers.js';

export async function handleShareChat(req, env, db, user, chatId, originSessionId) {
  const authDecision = await authorize(env, user, {
    action: 'chat.share',
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }

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

  return json(req, { share_id: shareId, share_url: `/s/${shareId}`, chat_id: chatId }, 200);
}