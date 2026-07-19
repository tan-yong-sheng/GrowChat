import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { getMessageSnapshot } from '../chat-core.js';
import { publishRealtimeNow, requireOwnedChatWithPermission } from '../chat-message-helpers.js';

export async function handleCancelMessage({ req, env, db, user, chatId, msgId, originSessionId }) {
  const { chat, error: denied } = await requireOwnedChatWithPermission({
    req,
    env,
    db,
    user,
    action: 'chat.write',
    chatId,
  });
  if (denied) return denied;

  const msg = await db.first('SELECT id, role, status FROM messages WHERE id = ? AND chat_id = ?', [
    msgId,
    chatId,
  ]);
  if (!msg) return error(req, 'Message not found', HTTP_STATUS.NOT_FOUND);
  if (msg.role !== 'assistant')
    return error(req, 'Only assistant messages can be cancelled', HTTP_STATUS.BAD_REQUEST);

  const status = String(msg.status || '');
  if (!['streaming', 'tool_running'].includes(status)) {
    return json(req, { ok: true, cancelled: false, status });
  }

  await db.run(
    "UPDATE messages SET status = 'cancelled', error_code = 'cancelled', error_message = ? WHERE id = ? AND chat_id = ?",
    ['Cancelled by user', msgId, chatId]
  );

  const cancelledMessage = await getMessageSnapshot(db, msgId);
  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'message.cancelled',
      userId: user.sub,
      chatId,
      messageId: msgId,
      originSessionId,
      data: {
        role: 'assistant',
        model: cancelledMessage?.model || null,
        message: cancelledMessage,
        chat,
      },
    })
  );

  return json(req, { ok: true, cancelled: true });
}
