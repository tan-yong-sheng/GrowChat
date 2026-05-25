import { error, json } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import {
  requireOwnedChat,
  getMessageSnapshot,
  normalizeErrorMessage,
  resolveDefaultModel,
  loadAttachmentDocuments,
  buildAttachmentParts,
} from './chat-core.js';
import {
  MAX_ATTACHMENTS,
  STRICT_ATTACHMENT_CAPS,
  formatUnsupportedAttachmentMessage,
  getAttachmentKinds,
  getModelAttachmentCapsEntry,
  getUnsupportedAttachmentKinds,
  getUnsupportedAttachmentKindsStrict,
  loadModelAttachmentCaps,
  mergeTextAttachmentParts,
  normalizeAttachmentIds,
  isSupportedAttachmentType,
} from '../chat/attachments.js';
import {
  ensureModelAllowed,
  normalizeSelectedToolNames,
  publishRealtimeNow,
  requireChatPermission,
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

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  const content = String(body.content || '').trim();
  if (!content) return error(req, 'content is required', 400);

  const selectedToolNames = normalizeSelectedToolNames(
    body.selected_tool_names || body.tool_names || body.tools
  );

  const role = String(body.role || 'user')
    .trim()
    .toLowerCase();
  if (role !== 'user' && role !== 'assistant') {
    return error(req, "role must be 'user' or 'assistant'", 400);
  }

  const noReply = body.no_reply === true;

  if (role === 'user' && noReply) {
    return error(req, 'User message branching does not support no_reply=true', 400);
  }
  if (role === 'assistant' && !noReply) {
    return error(req, 'Assistant message branching requires no_reply=true', 400);
  }
  if (sourceMsg.role !== role) {
    return error(req, `Cannot branch a ${sourceMsg.role} message as ${role}`, 400);
  }

  if (role === 'assistant' && noReply) {
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

  let model = String(body.model || chat.model || '').trim();
  if (!model) {
    model = await resolveDefaultModel(env, db, user.sub);
  }
  const modelDecision = await ensureModelAllowed(req, env, db, user, model);
  if (modelDecision?.error) return modelDecision.error;
  const providerInfo = modelDecision.providerInfo;

  let attachmentParts = [];
  let attachmentDocs = [];
  let attachmentKinds = [];
  let attachmentIds = normalizeAttachmentIds(
    Array.isArray(body.attachments) ? body.attachments : []
  );

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
    return error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, 400);
  }

  if (attachmentIds.length > 0) {
    if (!env.FILES) {
      return error(req, 'FILES binding missing', 500);
    }
    try {
      attachmentDocs = await loadAttachmentDocuments(db, user.sub, attachmentIds);
    } catch (err) {
      return error(req, normalizeErrorMessage(err, 'Invalid attachments'), 400);
    }

    const unsupported = attachmentDocs.filter((doc) => {
      const type = String(doc.content_type || '').trim();
      return !isSupportedAttachmentType(type);
    });
    if (unsupported.length > 0) {
      const list = unsupported.map((doc) => doc.filename || doc.id).join(', ');
      return error(req, `Unsupported attachment type for: ${list}`, 400);
    }

    try {
      attachmentParts = await buildAttachmentParts(env, attachmentDocs);
    } catch (err) {
      return error(req, normalizeErrorMessage(err, 'Failed to load attachments'), 400);
    }
  }

  if (attachmentDocs.length > 0) {
    attachmentKinds = getAttachmentKinds(attachmentDocs);
    const nonLocalKinds = attachmentKinds.filter((kind) => kind !== 'text');
    const caps = await loadModelAttachmentCaps(db);
    const modelCaps = getModelAttachmentCapsEntry(caps, model);

    const unsupported = nonLocalKinds.length
      ? STRICT_ATTACHMENT_CAPS
        ? getUnsupportedAttachmentKindsStrict(modelCaps, nonLocalKinds)
        : getUnsupportedAttachmentKinds(modelCaps, nonLocalKinds)
      : [];
    if (attachmentKinds.includes('text') && modelCaps?.text !== true) {
      unsupported.push('text');
    }

    if (unsupported.length > 0) {
      return error(req, 'attachments_not_supported', 400, {
        message: modelCaps
          ? formatUnsupportedAttachmentMessage(unsupported)
          : 'Attachment capabilities not configured for this model.',
        unsupported_types: unsupported,
        resumable: false,
      });
    }
    attachmentKinds = nonLocalKinds;
  }

  const newUserMsgId = crypto.randomUUID();
  await db.batch([
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
  ]);

  const createdBranchUserMessage = await getMessageSnapshot(db, newUserMsgId);
  const updatedBranchChat = (await requireOwnedChat(req, db, chatId, user.sub)).chat || null;

  if (attachmentDocs.length > 0) {
    try {
      const statements = attachmentDocs.map((doc) =>
        db
          .prepare(
            'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
          )
          .bind(crypto.randomUUID(), newUserMsgId, doc.id, 'attachment')
      );
      await db.batch(statements);
    } catch (err) {
      logger.warn('Failed to persist branch attachments', {
        error: String(err?.message || err),
      });
    }
  }

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

  const history = await getBranchHistory(db, newUserMsgId, chatId);

  if (attachmentParts.length > 0) {
    const lastIdx = history.length - 1;
    if (lastIdx >= 0 && history[lastIdx]?.role === 'user') {
      const hasNonText = attachmentParts.some((part) => part?.type && part.type !== 'text');
      if (hasNonText) {
        history[lastIdx] = {
          role: 'user',
          content: [{ type: 'text', text: content }, ...attachmentParts],
        };
      } else {
        history[lastIdx] = {
          role: 'user',
          content: mergeTextAttachmentParts(content, attachmentParts),
        };
      }
    }
  }

  const { response } = await assistantStreamRunner({
    req,
    env,
    ctx,
    db,
    user,
    chatId,
    userMsgId: newUserMsgId,
    parentId: sourceMsg.parent_id,
    model,
    history,
    citations: null,
    attachmentKinds,
    providerFamily: providerInfo.providerFamily,
    selectedToolNames,
  });

  return response;
}
