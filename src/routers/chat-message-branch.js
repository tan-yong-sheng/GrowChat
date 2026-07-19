import { error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { requireOwnedChat } from './chat-core.js';
import { MAX_ATTACHMENTS, normalizeAttachmentIds } from '../chat/attachments.js';
import { loadAndValidateAttachments } from './chat-attachment-helpers.js';
import {
  buildUserMessageContent,
  normalizeSelectedToolNames,
  requireChatPermission,
  resolveChatModel,
} from './chat-message-helpers.js';
import {
  createAssistantBranchMessage,
  createUserBranchMessage,
} from './chat-message-branch-persistence.js';

const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;
const ROLE_USER = 'user';
const ROLE_ASSISTANT = 'assistant';
const HISTORY_LIMIT = 30;
const INHERITED_MENTION_TYPES = [null, 'attachment'];
const NO_TABLE_ERROR_PATTERN = /no such table:\s*message_documents/i;

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
			LIMIT ${HISTORY_LIMIT}
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

  const accessResult = await acquireBranchAccess({ req, env, db, user, chatId });
  if (accessResult.error) return accessResult.error;
  const { chat } = accessResult;

  const sourceMsg = await db.first(
    'SELECT role, parent_id, model, citations FROM messages WHERE id = ? AND chat_id = ?',
    [msgId, chatId]
  );
  if (!sourceMsg) return error(req, 'Message not found', HTTP_NOT_FOUND);

  const parsed = await parseBranchBody(req, sourceMsg);
  if (parsed.error) return parsed.error;
  const { body, content, role, noReply, selectedToolNames } = parsed;

  if (role === ROLE_ASSISTANT && noReply) {
    return handleAssistantBranch({
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

  return handleUserBranch({
    req,
    env,
    ctx,
    db,
    user,
    chatId,
    sourceMsg,
    body,
    content,
    selectedToolNames,
    attachmentIds: parsed.attachmentIds,
    logger,
    chat,
    msgId,
    originSessionId,
    assistantStreamRunner,
  });
}

async function handleAssistantBranch({
  req,
  env,
  db,
  user,
  chatId,
  msgId,
  sourceMsg,
  content,
  originSessionId,
}) {
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

async function handleUserBranch({
  req,
  env,
  ctx,
  db,
  user,
  chatId,
  sourceMsg,
  body,
  content,
  selectedToolNames,
  attachmentIds,
  logger,
  chat,
  msgId,
  originSessionId,
  assistantStreamRunner,
}) {
  const execution = await prepareBranchExecution({
    req,
    env,
    db,
    user,
    chat,
    body,
    msgId,
    logger,
    providedIds: attachmentIds,
  });
  if (execution.error) return execution.error;
  const { model, providerInfo, attachmentDocs, attachmentParts, attachmentKinds } = execution;

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

  const history = await buildBranchHistory({
    db,
    chatId,
    newUserMsgId,
    content,
    attachmentParts,
  });

  return runBranchAssistantStream({
    req,
    env,
    ctx,
    db,
    user,
    chatId,
    newUserMsgId,
    model,
    history,
    attachmentKinds,
    providerInfo,
    selectedToolNames,
    assistantStreamRunner,
  });
}

async function acquireBranchAccess({ req, env, db, user, chatId }) {
  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return { error: owned.error };
  const permissionError = await requireChatPermission({
    req,
    env,
    user,
    action: 'chat.write',
    chatId,
  });
  if (permissionError) return { error: permissionError };
  return { chat: owned.chat };
}

async function prepareBranchExecution({
  req,
  env,
  db,
  user,
  chat,
  body,
  msgId,
  logger,
  providedIds,
}) {
  const modelDecision = await resolveBranchModel({ req, env, db, user, chat, body });
  if (modelDecision?.error) return { error: modelDecision.error };
  const { model, providerInfo } = modelDecision;

  const attachmentResult = await resolveBranchAttachments({
    req,
    env,
    db,
    user,
    msgId,
    model,
    providedIds,
    logger,
  });
  if (attachmentResult.error) return { error: attachmentResult.error };

  return {
    model,
    providerInfo,
    attachmentDocs: attachmentResult.attachmentDocs,
    attachmentParts: attachmentResult.attachmentParts,
    attachmentKinds: attachmentResult.attachmentKinds,
  };
}

async function parseRequestJson(req) {
  try {
    return { body: await req.json() };
  } catch {
    return { error: error(req, 'Invalid JSON body', HTTP_BAD_REQUEST) };
  }
}

function normalizeBranchRole(body) {
  return String(body.role || ROLE_USER)
    .trim()
    .toLowerCase();
}

function validateBranchRole(role, noReply, sourceMsg, req) {
  if (role !== ROLE_USER && role !== ROLE_ASSISTANT) {
    return { error: error(req, "role must be 'user' or 'assistant'", HTTP_BAD_REQUEST) };
  }
  if (role === ROLE_USER && noReply) {
    return {
      error: error(req, 'User message branching does not support no_reply=true', HTTP_BAD_REQUEST),
    };
  }
  if (role === ROLE_ASSISTANT && !noReply) {
    return {
      error: error(req, 'Assistant message branching requires no_reply=true', HTTP_BAD_REQUEST),
    };
  }
  if (sourceMsg.role !== role) {
    return {
      error: error(req, `Cannot branch a ${sourceMsg.role} message as ${role}`, HTTP_BAD_REQUEST),
    };
  }
  return null;
}

function buildBranchResult({ body, content, role, noReply, selectedToolNames }) {
  return {
    body,
    content,
    role,
    noReply,
    selectedToolNames,
    attachmentIds: normalizeAttachmentIds(Array.isArray(body.attachments) ? body.attachments : []),
  };
}

async function parseBranchBody(req, sourceMsg) {
  const parsed = await parseRequestJson(req);
  if (parsed.error) return parsed;
  const { body } = parsed;

  const content = String(body.content || '').trim();
  if (!content) {
    return { error: error(req, 'content is required', HTTP_BAD_REQUEST) };
  }

  const selectedToolNames = normalizeSelectedToolNames(
    body.selected_tool_names || body.tool_names || body.tools
  );

  const role = normalizeBranchRole(body);
  const noReply = body.no_reply === true;
  const roleError = validateBranchRole(role, noReply, sourceMsg, req);
  if (roleError) return roleError;

  return buildBranchResult({ body, content, role, noReply, selectedToolNames });
}

async function resolveBranchModel({ req, env, db, user, chat, body }) {
  return resolveChatModel({
    req,
    env,
    db,
    user,
    modelOrChat: { model: body.model || chat.model },
  });
}

function buildInheritedAttachmentQuery() {
  const placeholders = INHERITED_MENTION_TYPES.map(() => '?').join(', ');
  return `SELECT document_id FROM message_documents WHERE message_id = ? AND (mention_type IS NULL OR mention_type IN (${placeholders}))`;
}

async function loadInheritedAttachmentIds({ db, msgId, logger }) {
  try {
    const query = buildInheritedAttachmentQuery();
    const params = [msgId, ...INHERITED_MENTION_TYPES];
    const inherited = await db.all(query, params);
    return normalizeAttachmentIds(inherited.map((row) => row.document_id));
  } catch (err) {
    if (!NO_TABLE_ERROR_PATTERN.test(String(err?.message || ''))) {
      logger.warn('Failed to load inherited attachments', {
        error: String(err?.message || err),
      });
    }
    return [];
  }
}

async function resolveBranchAttachments({ req, env, db, user, msgId, model, providedIds, logger }) {
  let attachmentIds = providedIds;
  if (attachmentIds.length === 0) {
    attachmentIds = await loadInheritedAttachmentIds({ db, msgId, logger });
  }

  if (attachmentIds.length > MAX_ATTACHMENTS) {
    return { error: error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, HTTP_BAD_REQUEST) };
  }

  return loadAndValidateAttachments({ req, env, db, user, attachmentIds, model });
}

async function runBranchAssistantStream({
  req,
  env,
  ctx,
  db,
  user,
  chatId,
  newUserMsgId,
  model,
  history,
  attachmentKinds,
  providerInfo,
  selectedToolNames,
  assistantStreamRunner,
}) {
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

async function buildBranchHistory({ db, chatId, newUserMsgId, content, attachmentParts }) {
  const history = await getBranchHistory(db, newUserMsgId, chatId);

  if (attachmentParts.length > 0) {
    const lastIdx = history.length - 1;
    if (lastIdx >= 0 && history[lastIdx]?.role === ROLE_USER) {
      history[lastIdx] = buildUserBranchContent(content, attachmentParts);
    }
  }

  return history;
}

function buildUserBranchContent(content, attachmentParts) {
  return buildUserMessageContent(content, attachmentParts);
}
