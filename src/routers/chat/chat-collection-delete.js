import { error, json } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { requireOwnedChat } from '../chat-core.js';
import { mapAuthCodeToStatus } from './chat-collection-helpers.js';

export async function handleDeleteChat(req, env, db, user, chatId, originSessionId) {
  const authDecision = await authorize(env, user, {
    action: 'chat.delete',
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }

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