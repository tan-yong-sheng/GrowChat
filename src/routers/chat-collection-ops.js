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

export async function handleListChats(req, env, db, user) {
  const authDecision = await authorize(env, user, {
    action: 'chat.read',
    resource: 'chat',
  });
  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const url = new URL(req.url);
  let qRaw = url.searchParams.get('q') || '';
  qRaw = qRaw.trim();

  if (qRaw.length > 200) {
    return error(req, 'Query parameter "q" exceeds 200 characters', 400);
  }

  if (
    Array.from(qRaw).some((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return error(req, 'Query parameter "q" contains invalid characters', 400);
  }

  const limitParamStr = url.searchParams.get('limit') || '100';
  if (!/^[1-9]\d{0,2}$/.test(limitParamStr)) {
    return error(req, 'Query parameter "limit" must be a positive integer between 1 and 100', 400);
  }
  const limit = Number.parseInt(limitParamStr, 10);
  if (limit > 100) {
    return error(req, 'Query parameter "limit" must be a positive integer between 1 and 100', 400);
  }

  const offsetParamStr = url.searchParams.get('offset') || '0';
  if (!/^\d+$/.test(offsetParamStr)) {
    return error(req, 'Query parameter "offset" must be a non-negative integer', 400);
  }
  const offset = Number.parseInt(offsetParamStr, 10);

  const queryLimit = limit + 1;

  let chats;
  if (qRaw) {
    const like = `%${qRaw}%`;
    chats = await db.all(
      `SELECT DISTINCT c.id, c.title, c.model, c.pinned, c.created_at, c.updated_at
			FROM chats c
			LEFT JOIN messages m ON c.id = m.chat_id
			WHERE c.user_id = ? AND c.archived = 0 AND (c.title LIKE ? OR m.content LIKE ?)
			ORDER BY c.updated_at DESC, c.created_at DESC
			LIMIT ? OFFSET ?`,
      [user.sub, like, like, queryLimit, offset]
    );
  } else {
    chats = await db.all(
      'SELECT id, title, model, pinned, created_at, updated_at FROM chats WHERE user_id = ? AND archived = 0 ORDER BY updated_at DESC, created_at DESC LIMIT ? OFFSET ?',
      [user.sub, queryLimit, offset]
    );
  }

  const has_more = chats.length > limit;
  const items = has_more ? chats.slice(0, limit) : chats;
  const itemsTag = items.map((chat) => `${chat.id || ''}:${chat.updated_at || 0}`).join('|');
  const etag = createWeakEtag(`${user.sub}|${qRaw}|${limit}|${offset}|${itemsTag}`);

  return jsonCached(
    req,
    { chats: items, limit, offset, query: qRaw, has_more },
    {
      etag,
      cacheControl: 'private, max-age=30, stale-while-revalidate=120',
      vary: 'Authorization',
    }
  );
}

export async function handleGetChat(req, env, db, user, chatId) {
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

  const lastMessageAt = messages.reduce(
    (max, msg) => Math.max(max, Number(msg?.created_at || 0)),
    0
  );
  const etag = createWeakEtag(
    `${user.sub}|${chatId}|${chat.updated_at || 0}|${chat.current_message_id || ''}|${messages.length}|${lastMessageAt}`
  );

  return jsonCached(
    req,
    { chat, messages: withAttachments },
    {
      etag,
      cacheControl: 'private, max-age=15, stale-while-revalidate=30',
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
        .prepare(
          'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())'
        )
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
          .prepare(
            'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
          )
          .bind(crypto.randomUUID(), mappedMessageId, doc.document_id, doc.mention_type || null)
      );
    }
  }
}

function updateMappedCurrentMessage(sourceChat, messageIdMap, newChatId, userId, db, statements) {
  const mappedCurrentMessageId = sourceChat.current_message_id
    ? messageIdMap.get(String(sourceChat.current_message_id)) || null
    : null;
  if (mappedCurrentMessageId) {
    statements.push(
      db
        .prepare(
          'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
        )
        .bind(mappedCurrentMessageId, newChatId, userId)
    );
  }
}

export async function handleCloneChat(
  req,
  env,
  db,
  user,
  sourceChatId,
  originSessionId,
  publishRealtimeNow
) {
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
  const newTitle = `${stripHtml(String(sourceChat.title || 'New Chat').trim()) || 'New Chat'} (Copy)`;
  const cloneModel = sourceChat.model || (await resolveDefaultModel(env, db, user.sub));

  const statements = [
    db
      .prepare(
        'INSERT INTO chats (id, user_id, title, model, pinned, share_id, archived, current_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NULL, 0, NULL, unixepoch(), unixepoch())'
      )
      .bind(newChatId, user.sub, newTitle, cloneModel),
  ];

  const messageIdMap = new Map();
  for (const message of sourceMessages) {
    messageIdMap.set(String(message.id), crypto.randomUUID());
  }

  const msgStatements = await buildMessageInsertStatements(
    db,
    sourceMessages,
    newChatId,
    messageIdMap
  );
  statements.push(...msgStatements);

  const sourceMessageIds = sourceMessages.map((m) => String(m.id));
  await cloneChatDocuments(db, sourceMessageIds, messageIdMap, statements);

  updateMappedCurrentMessage(sourceChat, messageIdMap, newChatId, user.sub, db, statements);

  await db.batch(statements);
  const createdChat = await getOwnedChat(db, newChatId, user.sub);

  await publishRealtimeNow(
    env,
    createRealtimeEvent({
      type: 'chat.created',
      userId: user.sub,
      chatId: newChatId,
      originSessionId,
      data: { model: createdChat?.model, chat: createdChat },
    })
  );

  return json(req, { chat: createdChat }, 201);
}
