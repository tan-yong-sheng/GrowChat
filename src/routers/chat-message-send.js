import { error } from '../utils/response.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { buildMetadataSystemPrompt } from '../llm/system-prompt.js';
import { requireOwnedChat, getMessageSnapshot, resolveDefaultModel } from './chat-core.js';
import { MAX_ATTACHMENTS, normalizeAttachmentIds } from '../chat/attachments.js';
import { loadAndValidateAttachments } from './chat-attachment-helpers.js';
import {
  buildUserMessageContent,
  ensureModelAllowed,
  normalizeSelectedToolNames,
  publishRealtimeNow,
  requireOwnedChatWithPermission,
} from './chat-message-helpers.js';

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_BAD_REQUEST = 400;
const ROLE_USER = 'user';
const MENTION_ATTACHMENT = 'attachment';
const MS_PER_SECOND = 1000;
const APP_NAME_DEFAULT = 'GrowChat';

export async function handleSendMessage({
  req,
  env,
  ctx,
  db,
  user,
  chatId,
  originSessionId,
  assistantStreamRunner,
}) {
  const accessResult = await acquireSendAccess({
    req,
    env,
    db,
    user,
    chatId,
  });
  if (accessResult.error) return accessResult.error;
  const { chat } = accessResult;

  const parsed = await parseSendBody({ req, env, db, user, chat });
  if (parsed.error) return parsed.error;
  const { content, selectedToolNames, model } = parsed;

  const preparation = await prepareSendExecution({
    req,
    env,
    db,
    user,
    model,
    attachmentIds: parsed.attachmentIds,
  });
  if (preparation.error) return preparation.error;
  const { attachmentDocs, attachmentParts, attachmentKinds, resolvedProvider } = preparation;

  const persistence = await persistUserMessage({
    db,
    chatId,
    user,
    chat,
    content,
    model,
    attachmentDocs,
  });

  await publishUserMessageCreated({
    env,
    user,
    chatId,
    userMsgId: persistence.userMsgId,
    originSessionId,
    model,
    createdUserMessage: persistence.createdUserMessage,
    updatedChat: persistence.updatedChat,
  });

  const enhancedHistory = await buildEnhancedHistory({
    db,
    chatId,
    content,
    model,
    providerFamily: resolvedProvider.providerFamily,
    env,
    attachmentParts,
  });

  const { response } = await assistantStreamRunner({
    req,
    env,
    ctx,
    db,
    user,
    chatId,
    userMsgId: persistence.userMsgId,
    parentId: persistence.userMsgId,
    model,
    history: enhancedHistory,
    citations: null,
    attachmentKinds,
    providerFamily: resolvedProvider.providerFamily,
    selectedToolNames,
  });

  return response;
}

async function acquireSendAccess({ req, env, db, user, chatId }) {
  const { chat, error: denied } = await requireOwnedChatWithPermission({
    req,
    env,
    db,
    user,
    action: 'chat.write',
    chatId,
  });
  if (denied) return { error: denied };

  const limited = await enforceSendRateLimit({ req, env, user });
  if (limited) return { error: limited };

  return { chat };
}

async function enforceSendRateLimit({ req, env, user }) {
  const sendLimit = await checkRateLimit(env, {
    action: 'chat-send',
    subject: user.sub,
    ...RATE_LIMITS.chatSend,
  });
  if (sendLimit.allowed) return null;
  return error(req, 'Too many messages sent', HTTP_TOO_MANY_REQUESTS, {
    retry_after: Math.ceil((sendLimit.resetAt - Date.now()) / MS_PER_SECOND),
  });
}

async function prepareSendExecution({ req, env, db, user, model, attachmentIds }) {
  const modelDecision = await ensureModelAllowed({ req, env, db, user, model });
  if (modelDecision?.error) return { error: modelDecision.error };
  const resolvedProvider = modelDecision.providerInfo;

  const attachmentResult = await loadAndValidateAttachments({
    req,
    env,
    db,
    user,
    attachmentIds,
    model,
  });
  if (attachmentResult.error) return { error: attachmentResult.error };

  return {
    attachmentDocs: attachmentResult.attachmentDocs,
    attachmentParts: attachmentResult.attachmentParts,
    attachmentKinds: attachmentResult.attachmentKinds,
    resolvedProvider,
  };
}

async function persistUserMessage({ db, chatId, user, chat, content, model, attachmentDocs }) {
  const userMsgId = crypto.randomUUID();
  const parentId = chat.current_message_id || null;

  await insertUserMessageWithAttachments({
    db,
    chatId,
    userId: user.sub,
    messageId: userMsgId,
    parentId,
    content,
    model,
    attachmentDocs,
  });

  const createdUserMessage = await getMessageSnapshot(db, userMsgId);
  const updatedChat = (await requireOwnedChat(db, chatId, user.sub)).chat || null;
  attachDocMetadata(createdUserMessage, attachmentDocs);

  return { userMsgId, parentId, createdUserMessage, updatedChat };
}

async function publishUserMessageCreated({
  env,
  user,
  chatId,
  userMsgId,
  originSessionId,
  model,
  createdUserMessage,
  updatedChat,
}) {
  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'message.created',
      userId: user.sub,
      chatId,
      messageId: userMsgId,
      originSessionId,
      data: {
        role: ROLE_USER,
        model,
        message: createdUserMessage,
        chat: updatedChat,
      },
    })
  );
}

async function parseJsonBody(req) {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, body: null };
  }
}

function extractMessageContent(body) {
  const content = String(body.message || '').trim();
  if (!content) return { ok: false };
  return { ok: true, content };
}

function resolveSendToolNames(body) {
  return normalizeSelectedToolNames(body.selected_tool_names || body.tool_names || body.tools);
}

async function resolveSendModel({ body, chat, env, db, userSub }) {
  const model = String(body.model || chat.model || '').trim();
  if (model) return model;
  return resolveDefaultModel(env, db, userSub);
}

function normalizeSendAttachmentIds(body) {
  return Array.isArray(body.attachments) ? body.attachments : [];
}

function validateAttachmentCount(rawAttachmentIds, req) {
  if (rawAttachmentIds.length <= MAX_ATTACHMENTS) return { ok: true };
  return { error: error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, HTTP_BAD_REQUEST) };
}

async function parseSendBody({ req, env, db, user, chat }) {
  const parseResult = await parseJsonBody(req);
  if (!parseResult.ok) {
    return { error: error(req, 'Invalid JSON body', HTTP_BAD_REQUEST) };
  }
  const body = parseResult.body;

  const contentResult = extractMessageContent(body);
  if (!contentResult.ok) {
    return { error: error(req, 'message is required', HTTP_BAD_REQUEST) };
  }

  const selectedToolNames = resolveSendToolNames(body);
  const model = await resolveSendModel({ body, chat, env, db, userSub: user.sub });
  const rawAttachmentIds = normalizeSendAttachmentIds(body);
  const attachmentResult = validateAttachmentCount(rawAttachmentIds, req);
  if (attachmentResult.error) return attachmentResult;

  return {
    content: contentResult.content,
    selectedToolNames,
    model,
    attachmentIds: normalizeAttachmentIds(rawAttachmentIds),
  };
}

async function insertUserMessageWithAttachments({
  db,
  chatId,
  userId,
  messageId,
  parentId,
  content,
  model,
  attachmentDocs,
}) {
  const statements = [
    db
      .prepare(
        'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
      )
      .bind(messageId, chatId, ROLE_USER, content, model, parentId),
    db
      .prepare(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
      )
      .bind(messageId, chatId, userId),
  ];
  for (const doc of attachmentDocs) {
    statements.push(
      db
        .prepare(
          'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
        )
        .bind(crypto.randomUUID(), messageId, doc.id, MENTION_ATTACHMENT)
    );
  }
  await db.batch(statements);
}

function attachDocMetadata(message, attachmentDocs) {
  if (message && attachmentDocs.length > 0) {
    message.attachments = attachmentDocs.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      content_type: doc.content_type,
      file_size: doc.file_size,
    }));
  }
}

async function buildEnhancedHistory({
  db,
  chatId,
  content,
  model,
  providerFamily,
  env,
  attachmentParts,
}) {
  const history = await db.all(
    'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 30',
    [chatId]
  );

  const metadataPrompt = buildMetadataSystemPrompt({
    appName: env.APP_NAME || APP_NAME_DEFAULT,
    model,
    providerFamily,
    timeZone: env.TIME_ZONE || env.TZ,
  });

  const enhancedHistory = [{ role: 'system', content: metadataPrompt }, ...history];

  if (attachmentParts.length > 0) {
    const lastIdx = enhancedHistory.length - 1;
    if (lastIdx >= 0 && enhancedHistory[lastIdx]?.role === ROLE_USER) {
      enhancedHistory[lastIdx] = buildUserMessageContent(content, attachmentParts);
    }
  }

  return enhancedHistory;
}
