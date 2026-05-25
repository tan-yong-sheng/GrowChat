import { error, json, sseHeaders, sseData } from '../utils/response.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { trimTrailingAssistantMessages } from './chat-history.js';
import { requireOwnedChat, getMessageSnapshot, resolveDefaultModel, sleep } from './chat-core.js';
import {
  normalizeSelectedToolNames,
  publishRealtimeNow,
  requireChatPermission,
  ensureModelAllowed,
} from './chat-message-helpers.js';
import { handleSendMessage } from './chat-message-send.js';
import { handleBranchMessage } from './chat-message-branch.js';

export async function chatMessageRouter({
  req,
  env,
  ctx,
  db,
  user,
  path,
  originSessionId,
  assistantStreamRunner,
  requestContext = {},
}) {
  const sendMatch = path.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (sendMatch && req.method === 'POST') {
    return handleSendMessage({
      req,
      env,
      ctx,
      db,
      user,
      chatId: sendMatch[1],
      originSessionId,
      assistantStreamRunner,
      requestContext,
    });
  }

  const branchMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/branch$/);
  if (branchMatch && req.method === 'POST') {
    return handleBranchMessage({
      req,
      env,
      ctx,
      db,
      user,
      chatId: branchMatch[1],
      msgId: branchMatch[2],
      originSessionId,
      assistantStreamRunner,
      requestContext,
    });
  }

  const regenerateMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/regenerate$/);
  if (regenerateMatch && req.method === 'POST') {
    const chatId = regenerateMatch[1];
    const msgId = regenerateMatch[2];

    const permissionError = await requireChatPermission(req, env, user, 'chat.write', chatId);
    if (permissionError) return permissionError;

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;
    const chat = owned.chat;

    const sourceMsg = await db.first(
      'SELECT role, parent_id FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!sourceMsg) return error(req, 'Message not found', 404);
    if (sourceMsg.role !== 'assistant')
      return error(req, 'Can only regenerate assistant messages', 400);

    let model = String(chat.model || '').trim();
    if (!model) {
      model = await resolveDefaultModel(env, db, user.sub);
    }

    const modelDecision = await ensureModelAllowed(req, env, db, user, model);
    if (modelDecision?.error) return modelDecision.error;
    const providerInfo = modelDecision.providerInfo;

    let body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const selectedToolNames = normalizeSelectedToolNames(
      body.selected_tool_names || body.tool_names || body.tools
    );

    const history = trimTrailingAssistantMessages(
      await db.all(
        `SELECT role, content FROM messages WHERE chat_id = ? AND (
					created_at < (SELECT created_at FROM messages WHERE id = ?)
					OR (
						created_at = (SELECT created_at FROM messages WHERE id = ?)
						AND rowid <= (SELECT rowid FROM messages WHERE id = ?)
					)
				) ORDER BY created_at ASC, rowid ASC LIMIT 30`,
        [
          chatId,
          sourceMsg.parent_id || msgId,
          sourceMsg.parent_id || msgId,
          sourceMsg.parent_id || msgId,
        ]
      )
    );

    const { response } = await assistantStreamRunner({
      req,
      env,
      ctx,
      db,
      user,
      chatId,
      userMsgId: sourceMsg.parent_id,
      parentId: sourceMsg.parent_id,
      model,
      history,
      citations: null,
      providerFamily: providerInfo.providerFamily,
      selectedToolNames,
    });
    return response;
  }

  const cancelMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === 'POST') {
    const chatId = cancelMatch[1];
    const msgId = cancelMatch[2];

    const permissionError = await requireChatPermission(req, env, user, 'chat.write', chatId);
    if (permissionError) return permissionError;

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;
    const chat = owned.chat;

    const msg = await db.first(
      'SELECT id, role, status FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!msg) return error(req, 'Message not found', 404);
    if (msg.role !== 'assistant')
      return error(req, 'Only assistant messages can be cancelled', 400);

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

  const resumeMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/resume$/);
  if (resumeMatch && req.method === 'GET') {
    const chatId = resumeMatch[1];
    const msgId = resumeMatch[2];

    const permissionError = await requireChatPermission(req, env, user, 'chat.read', chatId);
    if (permissionError) return permissionError;

    const url = new URL(req.url);
    const afterSeq = Number(url.searchParams.get('after_seq') || 0);
    const lastSeq = Number.isFinite(afterSeq) && afterSeq > 0 ? Math.floor(afterSeq) : 0;

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;

    const msg = await db.first(
      'SELECT id, role, status FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!msg) return error(req, 'Message not found', 404);
    if (msg.role !== 'assistant') return error(req, 'Only assistant messages can be resumed', 400);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let cursor = lastSeq;
        let idleRounds = 0;
        while (true) {
          const rows = await db.all(
            'SELECT seq, payload FROM message_deltas WHERE message_id = ? AND seq > ? ORDER BY seq ASC LIMIT 200',
            [msgId, cursor]
          );
          if (rows.length) {
            idleRounds = 0;
            for (const row of rows) {
              if (!row?.payload) continue;
              cursor = Math.max(cursor, Number(row.seq || cursor));
              controller.enqueue(encoder.encode(sseData(String(row.payload))));
            }
          } else {
            idleRounds += 1;
          }

          const statusRow = await db.first(
            'SELECT status FROM messages WHERE id = ? AND chat_id = ?',
            [msgId, chatId]
          );
          const status = String(statusRow?.status || '');
          const isRunning = status === 'streaming' || status === 'tool_running';
          if (!isRunning) break;

          if (idleRounds > 2) {
            await sleep(400);
          } else {
            await sleep(150);
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(readable, { headers: sseHeaders(req) });
  }

  const statusMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'GET') {
    const chatId = statusMatch[1];
    const msgId = statusMatch[2];

    const permissionError = await requireChatPermission(req, env, user, 'chat.read', chatId);
    if (permissionError) return permissionError;

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;
    const chat = owned.chat;

    const msg = await db.first(
      'SELECT id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, message_blocks, created_at FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!msg) return error(req, 'Message not found', 404);

    return json(req, { ok: true, message: msg, chat });
  }

  const updateMessageMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/);
  if (updateMessageMatch && req.method === 'PUT') {
    const chatId = updateMessageMatch[1];
    const msgId = updateMessageMatch[2];

    const permissionError = await requireChatPermission(req, env, user, 'chat.write', chatId);
    if (permissionError) return permissionError;

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;

    const message = await db.first(
      'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!message) return error(req, 'Message not found', 404);

    if (message.role !== 'assistant') {
      return error(req, 'Only assistant messages can be edited in place', 400);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const content = String(body.content || '').trim();
    if (!content) return error(req, 'content is required', 400);

    await db.batch([
      db.prepare('UPDATE messages SET content = ? WHERE id = ? AND chat_id = ?', [
        content,
        msgId,
        chatId,
      ]),
      db.prepare('UPDATE chats SET updated_at = unixepoch() WHERE id = ? AND user_id = ?', [
        chatId,
        user.sub,
      ]),
    ]);

    const updatedMessage = await db.first(
      'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );

    await publishRealtimeNow(
      env,
      createRealtimeEvent({
        type: 'chat.updated',
        userId: user.sub,
        chatId,
        originSessionId,
        data: { message_id: msgId },
      })
    );

    return json(req, { message: updatedMessage }, 200);
  }

  const deleteMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const chatId = deleteMatch[1];
    const msgId = deleteMatch[2];

    const permissionError = await requireChatPermission(req, env, user, 'chat.delete', chatId);
    if (permissionError) return permissionError;

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;

    const msg = await db.first('SELECT id FROM messages WHERE id = ? AND chat_id = ?', [
      msgId,
      chatId,
    ]);
    if (!msg) return error(req, 'Message not found', 404);

    async function deleteMessageSubtree(nodeId) {
      const children = await db.all('SELECT id FROM messages WHERE parent_id = ? AND chat_id = ?', [
        nodeId,
        chatId,
      ]);
      for (const child of children) {
        await deleteMessageSubtree(child.id);
      }
      await db.run('DELETE FROM messages WHERE id = ? AND chat_id = ?', [nodeId, chatId]);
    }

    await deleteMessageSubtree(msgId);

    const lastMsg = await db.first(
      'SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      [chatId]
    );
    if (lastMsg) {
      await db.run(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [lastMsg.id, chatId, user.sub]
      );
    } else {
      await db.run(
        'UPDATE chats SET current_message_id = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [chatId, user.sub]
      );
    }

    await publishRealtimeNow(
      env,
      createRealtimeEvent({
        type: 'chat.updated',
        userId: user.sub,
        chatId,
        originSessionId,
        data: { deleted_message_id: msgId },
      })
    );

    return json(req, { ok: true, deleted: msgId });
  }

  return null;
}
