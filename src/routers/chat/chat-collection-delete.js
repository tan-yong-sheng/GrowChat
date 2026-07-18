import { json } from '../../utils/response.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { requireOwnedChat } from '../chat-core.js';
import { requireChatAuth } from './chat-collection-helpers.js';

// Cloudflare Worker handler
export async function handleDeleteChat(req, env, db, user, chatId, originSessionId) {
  const denied = await requireChatAuth(req, env, user, 'chat.delete', chatId);
  if (denied) return denied;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;

  await db.run('DELETE FROM chats WHERE id = ? AND user_id = ?', [chatId, user.sub]);

  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.deleted',
      userId: user.sub,
      chatId,
      originSessionId,
    })
  );
  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { shared: false, chat: null },
    })
  );

  return json(req, { ok: true });
}
