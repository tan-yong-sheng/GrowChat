import { error, json, sseHeaders, sseData } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { createRealtimeBus } from '../services/realtime-bus.js';
import { buildMetadataSystemPrompt } from '../llm/system-prompt.js';
import { trimTrailingAssistantMessages } from './chat-history.js';
import { authorize } from '../utils/authorize.js';
import {
  requireOwnedChat,
  getMessageSnapshot,
  normalizeErrorMessage,
  resolveDefaultModel,
  resolveProviderForModel,
  sleep,
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
  buildModelAclIndex,
  evaluateModelAclAccess,
  loadModelAclRules,
} from '../utils/model-acl.js';

async function ensureModelAllowed(req, env, db, user, model) {
  const useDecision = await authorize(env, user, {
    action: 'model.use',
    resource: 'model',
    resourceId: model,
  });
  if (!useDecision.allow) {
    return { error: error(req, useDecision.reason || 'Forbidden', 403) };
  }

  const providerInfo = await resolveProviderForModel(env, model, {
    userId: user?.sub || '',
    userRole: user?.primary_role || 'member',
  });
  if (providerInfo?.error) {
    return { error: error(req, providerInfo.error, 400) };
  }

  const groupRows = user?.sub
    ? await db.all('SELECT group_id FROM group_members WHERE user_id = ?', [user.sub])
    : [];
  const userGroupIds = new Set(
    (Array.isArray(groupRows) ? groupRows : []).map((row) => row.group_id).filter(Boolean)
  );
  const aclRules = await loadModelAclRules(db, model);
  const aclIndex = buildModelAclIndex(aclRules);
  const access = evaluateModelAclAccess(
    { connection_source: providerInfo?.connection?.source },
    {
      user,
      userGroupIds,
      rules: aclIndex.get(model) || [],
    }
  );
  if (!access.allowed) {
    return { error: error(req, 'Model not allowed', 403) };
  }

  return { providerInfo, access };
}

function normalizeSelectedToolNames(input) {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const names = [];
  for (const value of input) {
    const name = String(value || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

async function publishRealtimeNow(env, event) {
  try {
    return await createRealtimeBus(env).publish(event);
  } catch {
    return false;
  }
}

async function requireChatPermission(req, env, user, action, chatId) {
  const authDecision = await authorize(env, user, {
    action,
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', 403);
  }
  return null;
}

export async function chatMessageRouter({
  req,
  env,
  ctx,
  db,
  user,
  path,
  originSessionId,
  assistantStreamRunner,
}) {
  const logger = createLogger(env);
  const sendMatch = path.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (sendMatch && req.method === 'POST') {
    const chatId = sendMatch[1];
    const permissionError = await requireChatPermission(req, env, user, 'chat.write', chatId);
    if (permissionError) return permissionError;

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;
    const chat = owned.chat;
    const sendLimit = await checkRateLimit(env.CACHE, {
      action: 'chat-send',
      subject: user.sub,
      ...RATE_LIMITS.chatSend,
    });
    if (!sendLimit.allowed) {
      return error(req, 'Too many messages sent', 429, {
        retry_after: Math.ceil((sendLimit.resetAt - Date.now()) / 1000),
      });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const content = String(body.message || '').trim();
    if (!content) return error(req, 'message is required', 400);
    const selectedToolNames = normalizeSelectedToolNames(
      body.selected_tool_names || body.tool_names || body.tools
    );

    let model = String(body.model || chat.model || '').trim();
    if (!model) {
      model = await resolveDefaultModel(env, db, user.sub);
    }

    const modelDecision = await ensureModelAllowed(req, env, db, user, model);
    if (modelDecision?.error) return modelDecision.error;
    const providerInfo = modelDecision.providerInfo;

    let attachmentParts = [];
    const rawAttachmentIds = Array.isArray(body.attachments) ? body.attachments : [];
    if (rawAttachmentIds.length > MAX_ATTACHMENTS) {
      return error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, 400);
    }
    const attachmentIds = normalizeAttachmentIds(rawAttachmentIds);
    let attachmentDocs = [];
    let attachmentKinds = [];
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

    const userMsgId = crypto.randomUUID();
    const parentId = chat.current_message_id || null;
    await db.batch([
      db
        .prepare(
          'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
        )
        .bind(userMsgId, chatId, 'user', content, model, parentId),
      db
        .prepare(
          'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
        )
        .bind(userMsgId, chatId, user.sub),
    ]);

    const createdUserMessage = await getMessageSnapshot(db, userMsgId);
    const updatedChatAfterUserMessage =
      (await requireOwnedChat(req, db, chatId, user.sub)).chat || null;

    if (attachmentDocs.length > 0) {
      try {
        const statements = attachmentDocs.map((doc) =>
          db
            .prepare(
              'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
            )
            .bind(crypto.randomUUID(), userMsgId, doc.id, 'attachment')
        );
        await db.batch(statements);
      } catch (err) {
        logger.warn('Failed to persist message attachments', { error: String(err?.message || err) });
      }
    }

    if (createdUserMessage && attachmentDocs.length > 0) {
      createdUserMessage.attachments = attachmentDocs.map((doc) => ({
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
        messageId: userMsgId,
        originSessionId,
        data: {
          role: 'user',
          model,
          message: createdUserMessage,
          chat: updatedChatAfterUserMessage,
        },
      })
    );

    const history = await db.all(
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 30',
      [chatId]
    );

    const metadataPrompt = buildMetadataSystemPrompt({
      appName: env.APP_NAME || 'GrowChat',
      model,
      providerFamily: providerInfo.providerFamily,
      timeZone: env.TIME_ZONE || env.TZ,
    });

    let enhancedHistory = [
      {
        role: 'system',
        content: metadataPrompt,
      },
    ];
    enhancedHistory.push(...history);

    if (attachmentParts.length > 0) {
      const lastIdx = enhancedHistory.length - 1;
      if (lastIdx >= 0 && enhancedHistory[lastIdx]?.role === 'user') {
        const hasNonText = attachmentParts.some((part) => part?.type && part.type !== 'text');
        if (hasNonText) {
          enhancedHistory[lastIdx] = {
            role: 'user',
            content: [{ type: 'text', text: content }, ...attachmentParts],
          };
        } else {
          enhancedHistory[lastIdx] = {
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
      userMsgId,
      parentId: userMsgId,
      model,
      history: enhancedHistory,
      citations: null,
      attachmentKinds,
      providerFamily: providerInfo.providerFamily,
      selectedToolNames,
    });

    return response;
  }

  const branchMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/branch$/);
  if (branchMatch && req.method === 'POST') {
    const chatId = branchMatch[1];
    const msgId = branchMatch[2];

    async function getBranchHistory(leafMessageId) {
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
        )
        ORDER BY created_at ASC, rowid ASC`,
        [leafMessageId, chatId, chatId]
      );
    }

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
          `SELECT document_id FROM message_documents
           WHERE message_id = ?
             AND (mention_type IS NULL OR mention_type = 'attachment')`,
          [msgId]
        );
        attachmentIds = normalizeAttachmentIds(inherited.map((row) => row.document_id));
      } catch (err) {
        if (!/no such table:\s*message_documents/i.test(String(err?.message || ''))) {
          logger.warn('Failed to load inherited attachments', { error: String(err?.message || err) });
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
        logger.warn('Failed to persist branch attachments', { error: String(err?.message || err) });
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

    const history = await getBranchHistory(newUserMsgId);
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
        `SELECT role, content
       FROM messages
       WHERE chat_id = ?
         AND (
           created_at < (SELECT created_at FROM messages WHERE id = ?)
           OR (
             created_at = (SELECT created_at FROM messages WHERE id = ?)
             AND rowid <= (SELECT rowid FROM messages WHERE id = ?)
           )
         )
       ORDER BY created_at ASC, rowid ASC
       LIMIT 30`,
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
