import { error, json } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { requireOwnedChat, getMessageSnapshot } from './chat-core.js';
import { MAX_ATTACHMENTS, normalizeAttachmentIds } from '../chat/attachments.js';
import { loadAndValidateAttachments } from './chat-attachment-helpers.js';
import {
  buildUserMessageContent,
  normalizeSelectedToolNames,
  publishRealtimeNow,
  requireChatPermission,
  resolveChatModel,
} from './chat-message-helpers.js';

async function getBranchHistory(db, leafMessageId, chatId) {
  return db.all(
    `WITH RECURSIVE lineage AS (
			SELECT id, parent_id, role, content, created_at, rowid
			FROM messages
			WHERE id = ? AND chat_id = ?
			UNION ALL
			SELECT m.id, m.parent_id, m.role, m.content, m.created_at, m.rowid
			FROM messages m
			JOIN lineage l ON m.id = l.parent_id
			WHERE m.chat_id = ?
		)
		SELECT role, content FROM (
			SELECT role, content, created_at, rowid
			FROM lineage
			ORDER BY created_at DESC, rowid DESC
			LIMIT 30
		) ORDER BY created_at ASC, rowid ASC`,
    [leafMessageId, chatId, chatId]
  );
}

export async function handleBranchMessage({
  req,
  env,
  ctx,
  db,
  user,
  chatId,
  msgId,
  originSessionId,
  assistantStreamRunner,
  requestContext = {},
}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  const permissionError = await requireChatPermission(req, env, user, 'chat.write', chatId);
  if (permissionError) return permissionError;

  const sourceMsg = await db.first(
    'SELECT role, parent_id, model, citations FROM messages WHERE id = ? AND chat_id = ?',
    [msgId, chatId]
  );
  if (!sourceMsg) return error(req, 'Message not found', 404);

  const parsed = await parseBranchBody(req, sourceMsg);
  if (parsed.error) return parsed.error;
  const { body, content, role, noReply, selectedToolNames } = parsed;

  if (role === 'assistant' && noReply) {
    return createAssistantBranchMessage({
      req,
      env,
      db,
      user,
      chatId,
      msgId,
      sourceMsg,
      content,
      originSessionId,
    });
  }

  const modelDecision = await resolveBranchModel(req, env, db, user, chat, body);
  if (modelDecision?.error) return modelDecision.error;
  const { model, providerInfo } = modelDecision;

  const attachmentResult = await resolveBranchAttachments({
    req,
    env,
    db,
    user,
    msgId,
    model,
    providedIds: parsed.attachmentIds,
    logger,
  });
  if (attachmentResult.error) return attachmentResult.error;
  const { attachmentDocs, attachmentParts, attachmentKinds } = attachmentResult;

  const newUserMsgId = await createUserBranchMessage({
    req,
    env,
    db,
    user,
    chatId,
    sourceMsg,
    content,
    model,
    attachmentDocs,
    originSessionId,
  });

  const history = await buildBranchHistory({ db, chatId, newUserMsgId, content, attachmentParts });

  const { response } = await assistantStreamRunner({
    req,
    env,
    ctx,
    db,
    user,
    chatId,
    userMsgId: newUserMsgId,
    parentId: newUserMsgId,
    model,
    history,
    citations: null,
    attachmentKinds,
    providerFamily: providerInfo.providerFamily,
    selectedToolNames,
  });

  return response;
}

async function parseBranchBody(req, sourceMsg) {
  let body;
  try {
    body = await req.json();
  } catch {
    return { error: error(req, 'Invalid JSON body', 400) };
  }

  const content = String(body.content || '').trim();
  if (!content) {
    return { error: error(req, 'content is required', 400) };
  }

  const selectedToolNames = normalizeSelectedToolNames(
    body.selected_tool_names || body.tool_names || body.tools
  );

  const role = String(body.role || 'user')
    .trim()
    .toLowerCase();
  if (role !== 'user' && role !== 'assistant') {
    return { error: error(req, "role must be 'user' or 'assistant'", 400) };
  }

  const noReply = body.no_reply === true;

  if (role === 'user' && noReply) {
    return { error: error(req, 'User message branching does not support no_reply=true', 400) };
  }
  if (role === 'assistant' && !noReply) {
    return { error: error(req, 'Assistant message branching requires no_reply=true', 400) };
  }
  if (sourceMsg.role !== role) {
    return { error: error(req, `Cannot branch a ${sourceMsg.role} message as ${role}`, 400) };
  }

  return {
    body,
    content,
    role,
    noReply,
    selectedToolNames,
    attachmentIds: normalizeAttachmentIds(Array.isArray(body.attachments) ? body.attachments : []),
  };
}

async function resolveBranchModel(req, env, db, user, chat, body) {
  return resolveChatModel(req, env, db, user, { model: body.model || chat.model });
}

async function resolveBranchAttachments({ req, env, db, user, msgId, model, providedIds, logger }) {
  let attachmentIds = providedIds;

  if (attachmentIds.length === 0) {
    try {
      const inherited = await db.all(
        `SELECT document_id FROM message_documents WHERE message_id = ? AND (mention_type IS NULL OR mention_type = 'attachment')`,
        [msgId]
      );
      attachmentIds = normalizeAttachmentIds(inherited.map((row) => row.document_id));
    } catch (err) {
      if (!/no such table:\s*message_documents/i.test(String(err?.message || ''))) {
        logger.warn('Failed to load inherited attachments', {
          error: String(err?.message || err),
        });
      }
    }
  }

  if (attachmentIds.length > MAX_ATTACHMENTS) {
    return { error: error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, 400) };
  }

  return loadAndValidateAttachments(req, env, db, user, attachmentIds, model);
}

async function createAssistantBranchMessage({
  req,
  env,
  db,
  user,
  chatId,
  sourceMsg,
  content,
  originSessionId,
}) {
  const newAssistantMsgId = crypto.randomUUID();
  await db.batch([
    db.prepare(
      'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
      [
        newAssistantMsgId,
        chatId,
        'assistant',
        content,
        sourceMsg.model,
        sourceMsg.citations,
        sourceMsg.parent_id,
      ]
    ),
    db.prepare(
      'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [newAssistantMsgId, chatId, user.sub]
    ),
  ]);
  const newMsg = await db.first(
    'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ?',
    [newAssistantMsgId]
  );
  const updatedChat = (await requireOwnedChat(req, db, chatId, user.sub)).chat || null;
  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'message.completed',
      userId: user.sub,
      chatId,
      messageId: newAssistantMsgId,
      originSessionId,
      data: {
        role: 'assistant',
        model: sourceMsg.model,
        message: newMsg,
        chat: updatedChat,
      },
    })
  );
  return json(req, { message: newMsg }, 200);
}

async function createUserBranchMessage({
  req,
  env,
  db,
  user,
  chatId,
  sourceMsg,
  content,
  model,
  attachmentDocs,
  originSessionId,
}) {
  const newUserMsgId = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
      )
      .bind(newUserMsgId, chatId, 'user', content, model, sourceMsg.parent_id),
    db
      .prepare(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
      )
      .bind(newUserMsgId, chatId, user.sub),
  ];
  for (const doc of attachmentDocs) {
    statements.push(
      db
        .prepare(
          'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
        )
        .bind(crypto.randomUUID(), newUserMsgId, doc.id, 'attachment')
    );
  }
  await db.batch(statements);

  const createdBranchUserMessage = await getMessageSnapshot(db, newUserMsgId);
  const updatedBranchChat = (await requireOwnedChat(req, db, chatId, user.sub)).chat || null;

  if (createdBranchUserMessage && attachmentDocs.length > 0) {
    createdBranchUserMessage.attachments = attachmentDocs.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      content_type: doc.content_type,
      file_size: doc.file_size,
    }));
  }

  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'message.created',
      userId: user.sub,
      chatId,
      messageId: newUserMsgId,
      originSessionId,
      data: {
        role: 'user',
        model,
        message: createdBranchUserMessage,
        chat: updatedBranchChat,
      },
    })
  );

  return newUserMsgId;
}

async function buildBranchHistory({ db, chatId, newUserMsgId, content, attachmentParts }) {
  const history = await getBranchHistory(db, newUserMsgId, chatId);

  if (attachmentParts.length > 0) {
    const lastIdx = history.length - 1;
    if (lastIdx >= 0 && history[lastIdx]?.role === 'user') {
      history[lastIdx] = buildUserBranchContent(content, attachmentParts);
    }
  }

  return history;
}

function buildUserBranchContent(content, attachmentParts) {
  return buildUserMessageContent(content, attachmentParts);
}
