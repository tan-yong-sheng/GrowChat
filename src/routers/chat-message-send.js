import { error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { buildMetadataSystemPrompt } from '../llm/system-prompt.js';
import { requireOwnedChat, getMessageSnapshot, resolveDefaultModel } from './chat-core.js';
import {
  MAX_ATTACHMENTS,
  mergeTextAttachmentParts,
  normalizeAttachmentIds,
} from '../chat/attachments.js';
import { loadAndValidateAttachments } from './chat-attachment-helpers.js';
import {
  ensureModelAllowed,
  normalizeSelectedToolNames,
  publishRealtimeNow,
  requireChatPermission,
} from './chat-message-helpers.js';

export async function handleSendMessage({
  req,
  env,
  ctx,
  db,
  user,
  chatId,
  originSessionId,
  assistantStreamRunner,
  requestContext = {},
}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

  const permissionError = await requireChatPermission(req, env, user, 'chat.write', chatId);
  if (permissionError) return permissionError;

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  const sendLimit = await checkRateLimit(env, {
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

  const rawAttachmentIds = Array.isArray(body.attachments) ? body.attachments : [];
  if (rawAttachmentIds.length > MAX_ATTACHMENTS) {
    return error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, 400);
  }
  const attachmentIds = normalizeAttachmentIds(rawAttachmentIds);

  const attachmentResult = await loadAndValidateAttachments(
    req,
    env,
    db,
    user,
    attachmentIds,
    model
  );
  if (attachmentResult.error) return attachmentResult.error;
  const { attachmentDocs, attachmentParts, attachmentKinds } = attachmentResult;

  const userMsgId = crypto.randomUUID();
  const parentId = chat.current_message_id || null;

  const sendStatements = [
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
  ];
  // Include attachment links in the same atomic batch
  for (const doc of attachmentDocs) {
    sendStatements.push(
      db
        .prepare(
          'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
        )
        .bind(crypto.randomUUID(), userMsgId, doc.id, 'attachment')
    );
  }
  await db.batch(sendStatements);

  const createdUserMessage = await getMessageSnapshot(db, userMsgId);
  const updatedChatAfterUserMessage =
    (await requireOwnedChat(req, db, chatId, user.sub)).chat || null;

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
