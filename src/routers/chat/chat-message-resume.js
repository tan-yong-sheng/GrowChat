import { error, sseHeaders, sseData } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { requireOwnedChat, sleep } from '../chat-core.js';
import { requireChatPermission } from '../chat-message-helpers.js';
async function fetchAndEnqueueDeltas(db, msgId, cursor, encoder, controller) {
  const rows = await db.all(
    'SELECT seq, payload FROM message_deltas WHERE message_id = ? AND seq > ? ORDER BY seq ASC LIMIT 200',
    [msgId, cursor]
  );
  if (!rows.length) {
    return { cursor, advanced: false };
  }
  for (const row of rows) {
    if (!row?.payload) continue;
    cursor = Math.max(cursor, Number(row.seq || cursor));
    controller.enqueue(encoder.encode(sseData(String(row.payload))));
  }
  return { cursor, advanced: true };
}

async function isMessageRunning(db, msgId, chatId) {
  const statusRow = await db.first('SELECT status FROM messages WHERE id = ? AND chat_id = ?', [
    msgId,
    chatId,
  ]);
  const status = String(statusRow?.status || '');
  return status === 'streaming' || status === 'tool_running';
}

const MAX_POLL_MS = 400;
const MIN_POLL_MS = 150;

function resolveSleepMs(idleRounds) {
  return idleRounds > 2 ? MAX_POLL_MS : MIN_POLL_MS;
}

export async function handleResumeMessage({ req, env, db, user, chatId, msgId }) {
  const permissionError = await requireChatPermission(req, env, user, 'chat.read', chatId);
  if (permissionError) return permissionError;

  const url = new URL(req.url);
  const afterSeq = Number(url.searchParams.get('after_seq') || 0);
  const lastSeq = Number.isFinite(afterSeq) && afterSeq > 0 ? Math.floor(afterSeq) : 0;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;

  const msg = await db.first('SELECT id, role, status FROM messages WHERE id = ? AND chat_id = ?', [
    msgId,
    chatId,
  ]);
  if (!msg) return error(req, 'Message not found', HTTP_STATUS.NOT_FOUND);
  if (msg.role !== 'assistant')
    return error(req, 'Only assistant messages can be resumed', HTTP_STATUS.BAD_REQUEST);

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let cursor = lastSeq;
      let idleRounds = 0;
      while (true) {
        const { cursor: nextCursor, advanced } = await fetchAndEnqueueDeltas(
          db,
          msgId,
          cursor,
          encoder,
          controller
        );
        cursor = nextCursor;
        if (advanced) {
          idleRounds = 0;
        } else {
          idleRounds += 1;
        }

        const running = await isMessageRunning(db, msgId, chatId);
        if (!running) break;

        await sleep(resolveSleepMs(idleRounds));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(readable, { headers: sseHeaders(req) });
}
