import { error, json, jsonCached, createWeakEtag, authError } from '../utils/response.js';
import { stripHtml } from '../utils/sanitize.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { authorize } from '../utils/authorize.js';
import {
  resolveDefaultModel,
  getOwnedChat,
  requireOwnedChat,
  getChatMessages,
  attachDocumentsToMessages,
} from './chat-core.js';

const QUERY_MAX_LENGTH = 200;
const CONTROL_CHAR_MIN = 32;
const DELETE_CHAR_CODE = 127;
const LIST_LIMIT_DEFAULT = 100;
const LIST_LIMIT_MAX = 100;
const LIST_OFFSET_DEFAULT = 0;
const CHAT_LIST_CACHE_CONTROL = 'private, max-age=30, stale-while-revalidate=120';
const CHAT_GET_CACHE_CONTROL = 'private, max-age=15, stale-while-revalidate=30';
const CLONE_TITLE_SUFFIX = ' (Copy)';
const DEFAULT_CHAT_TITLE = 'New Chat';
const HTTP_STATUS_CREATED = 201;

const LIST_CHATS_QUERY = `SELECT id, title, model, pinned, created_at, updated_at FROM chats
   WHERE user_id = ? AND archived = 0 ORDER BY updated_at DESC, created_at DESC LIMIT ? OFFSET ?`;

const LIST_CHATS_SEARCH_QUERY = `SELECT DISTINCT c.id, c.title, c.model, c.pinned, c.created_at, c.updated_at
   FROM chats c
   LEFT JOIN messages m ON c.id = m.chat_id
   WHERE c.user_id = ? AND c.archived = 0 AND (c.title LIKE ? OR m.content LIKE ?)
   ORDER BY c.updated_at DESC, c.created_at DESC
   LIMIT ? OFFSET ?`;

const INSERT_CLONE_CHAT = `INSERT INTO chats (id, user_id, title, model, pinned, share_id, archived,
   current_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NULL, 0, NULL,
   unixepoch(), unixepoch())`;

const INSERT_CLONE_MESSAGE = `INSERT INTO messages (id, chat_id, role, content, model, citations,
   parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`;

const INSERT_CLONE_DOCUMENT = `INSERT INTO message_documents (id, message_id, document_id,
   mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())`;

const UPDATE_CLONE_CURRENT_MESSAGE = `UPDATE chats SET current_message_id = ?, updated_at = unixepoch()
   WHERE id = ? AND user_id = ?`;

function hasControlCharacters(text) {
  return Array.from(text).some((char) => {
    const code = char.charCodeAt(0);
    return code < CONTROL_CHAR_MIN || code === DELETE_CHAR_CODE;
  });
}

function parseListLimitParam(raw) {
  if (!/^[1-9]\d{0,2}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (n > LIST_LIMIT_MAX) return null;
  return n;
}

function parseListOffsetParam(raw) {
  if (!/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

function validateListQueryParams(req, url) {
  const qRaw = (url.searchParams.get('q') || '').trim();
  if (qRaw.length > QUERY_MAX_LENGTH) {
    return { error: error(req, `Query parameter "q" exceeds ${QUERY_MAX_LENGTH} characters`, 400) };
  }
  if (hasControlCharacters(qRaw)) {
    return { error: error(req, 'Query parameter "q" contains invalid characters', 400) };
  }
  const limitStr = url.searchParams.get('limit') || String(LIST_LIMIT_DEFAULT);
  const limit = parseListLimitParam(limitStr);
  if (limit === null) {
    return {
      error: error(
        req,
        'Query parameter "limit" must be a positive integer between 1 and 100',
        400
      ),
    };
  }
  const offsetStr = url.searchParams.get('offset') || String(LIST_OFFSET_DEFAULT);
  const offset = parseListOffsetParam(offsetStr);
  if (offset === null) {
    return { error: error(req, 'Query parameter "offset" must be a non-negative integer', 400) };
  }
  return { qRaw, limit, offset };
}

function buildListEtag({ userId, qRaw, limit, offset, items }) {
  const itemsTag = items.map((chat) => `${chat.id || ''}:${chat.updated_at || 0}`).join('|');
  return createWeakEtag(`${userId}|${qRaw}|${limit}|${offset}|${itemsTag}`);
}

async function runListChatsQuery(db, { userId, qRaw, limit, offset }) {
  const queryLimit = limit + 1;
  if (qRaw) {
    const like = `%${qRaw}%`;
    return db.all(LIST_CHATS_SEARCH_QUERY, [userId, like, like, queryLimit, offset]);
  }
  return db.all(LIST_CHATS_QUERY, [userId, queryLimit, offset]);
}

export async function handleListChats(req, env, db, user) {
  const authDecision = await authorize(env, user, {
    action: 'chat.read',
    resource: 'chat',
  });
  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const url = new URL(req.url);
  const params = validateListQueryParams(req, url);
  if (params.error) return params.error;

  const chats = await runListChatsQuery(db, {
    userId: user.sub,
    qRaw: params.qRaw,
    limit: params.limit,
    offset: params.offset,
  });

  const has_more = chats.length > params.limit;
  const items = has_more ? chats.slice(0, params.limit) : chats;
  const etag = buildListEtag({
    userId: user.sub,
    qRaw: params.qRaw,
    limit: params.limit,
    offset: params.offset,
    items,
  });

  return jsonCached(
    req,
    { chats: items, limit: params.limit, offset: params.offset, query: params.qRaw, has_more },
    {
      etag,
      cacheControl: CHAT_LIST_CACHE_CONTROL,
      vary: 'Authorization',
    }
  );
}

function buildGetChatEtag({ userId, chat, chatId, messages }) {
  const lastMessageAt = messages.reduce(
    (max, msg) => Math.max(max, Number(msg?.created_at || 0)),
    0
  );
  return createWeakEtag(
    `${userId}|${chatId}|${chat.updated_at || 0}|${chat.current_message_id || ''}|${messages.length}|${lastMessageAt}`
  );
}

export async function handleGetChat({ req, env, db, user, chatId }) {
  const authDecision = await authorize(env, user, {
    action: 'chat.read',
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return owned.error;
  const chat = owned.chat;

  const messages = await getChatMessages(db, chatId);
  const withAttachments = await attachDocumentsToMessages(db, messages);
  const etag = buildGetChatEtag({ userId: user.sub, chat, chatId, messages });

  return jsonCached(
    req,
    { chat, messages: withAttachments },
    {
      etag,
      cacheControl: CHAT_GET_CACHE_CONTROL,
      vary: 'Authorization',
    }
  );
}

async function buildMessageInsertStatements(db, sourceMessages, newChatId, messageIdMap) {
  const statements = [];
  for (const message of sourceMessages) {
    const mappedParentId = message.parent_id
      ? messageIdMap.get(String(message.parent_id)) || null
      : null;
    statements.push(
      db
        .prepare(INSERT_CLONE_MESSAGE)
        .bind(
          messageIdMap.get(String(message.id)),
          newChatId,
          message.role,
          message.content,
          message.model,
          message.citations || null,
          mappedParentId
        )
    );
  }
  return statements;
}

async function cloneChatDocuments(db, sourceMessageIds, messageIdMap, statements) {
  if (sourceMessageIds.length === 0) return;
  const placeholders = sourceMessageIds.map(() => '?').join(',');
  const sourceDocs = await db.all(
    `SELECT id, message_id, document_id, mention_type FROM message_documents WHERE message_id IN (${placeholders})`,
    sourceMessageIds
  );
  for (const doc of sourceDocs) {
    const mappedMessageId = messageIdMap.get(String(doc.message_id));
    if (mappedMessageId) {
      statements.push(
        db
          .prepare(INSERT_CLONE_DOCUMENT)
          .bind(crypto.randomUUID(), mappedMessageId, doc.document_id, doc.mention_type || null)
      );
    }
  }
}

function updateMappedCurrentMessage({
  sourceChat,
  messageIdMap,
  newChatId,
  userId,
  db,
  statements,
}) {
  const mappedCurrentMessageId = sourceChat.current_message_id
    ? messageIdMap.get(String(sourceChat.current_message_id)) || null
    : null;
  if (mappedCurrentMessageId) {
    statements.push(
      db.prepare(UPDATE_CLONE_CURRENT_MESSAGE).bind(mappedCurrentMessageId, newChatId, userId)
    );
  }
}

function buildCloneTitle(sourceChat) {
  return `${stripHtml(String(sourceChat.title || DEFAULT_CHAT_TITLE).trim()) || DEFAULT_CHAT_TITLE}${CLONE_TITLE_SUFFIX}`;
}

async function resolveCloneModel(env, db, sourceChat, userId) {
  return sourceChat.model || (await resolveDefaultModel(env, db, userId));
}

function buildChatInsertStatement(db, { newChatId, userId, title, model }) {
  return db.prepare(INSERT_CLONE_CHAT).bind(newChatId, userId, title, model);
}

function buildMessageIdMap(sourceMessages) {
  const messageIdMap = new Map();
  for (const message of sourceMessages) {
    messageIdMap.set(String(message.id), crypto.randomUUID());
  }
  return messageIdMap;
}

async function prepareCloneStatements({
  db,
  sourceMessages,
  sourceChat,
  newChatId,
  userId,
  model,
}) {
  const statements = [
    buildChatInsertStatement(db, { newChatId, userId, title: buildCloneTitle(sourceChat), model }),
  ];
  const messageIdMap = buildMessageIdMap(sourceMessages);
  const msgStatements = await buildMessageInsertStatements(
    db,
    sourceMessages,
    newChatId,
    messageIdMap
  );
  statements.push(...msgStatements);
  const sourceMessageIds = sourceMessages.map((m) => String(m.id));
  await cloneChatDocuments(db, sourceMessageIds, messageIdMap, statements);
  updateMappedCurrentMessage({ sourceChat, messageIdMap, newChatId, userId, db, statements });
  return statements;
}

async function publishCloneRealtime({
  env,
  userId,
  newChatId,
  originSessionId,
  publishRealtimeNow,
  createdChat,
}) {
  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.created',
      userId,
      chatId: newChatId,
      originSessionId,
      data: { model: createdChat?.model, chat: createdChat },
    })
  );
}

export async function handleCloneChat({
  req,
  env,
  db,
  user,
  sourceChatId,
  originSessionId,
  publishRealtimeNow,
}) {
  const authDecision = await authorize(env, user, {
    action: 'chat.write',
    resource: 'chat',
    resourceId: sourceChatId,
  });
  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const sourceOwned = await requireOwnedChat(req, db, sourceChatId, user.sub);
  if (sourceOwned.error) return sourceOwned.error;
  const sourceChat = sourceOwned.chat;

  const sourceMessages = await db.all(
    'SELECT id, role, content, model, citations, parent_id, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC',
    [sourceChatId]
  );

  const newChatId = crypto.randomUUID();
  const model = await resolveCloneModel(env, db, sourceChat, user.sub);

  const statements = await prepareCloneStatements({
    db,
    sourceMessages,
    sourceChat,
    newChatId,
    userId: user.sub,
    model,
  });

  await db.batch(statements);
  const createdChat = await getOwnedChat(db, newChatId, user.sub);

  await publishCloneRealtime({
    env,
    userId: user.sub,
    newChatId,
    originSessionId,
    publishRealtimeNow,
    createdChat,
  });

  return json(req, { chat: createdChat }, HTTP_STATUS_CREATED);
}
