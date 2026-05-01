import { createDB } from '../db.js';
import { error, json, jsonCached, createWeakEtag } from '../utils/response.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { createRealtimeBus } from '../services/realtime-bus.js';
import { authorize } from '../utils/authorize.js';
import {
  resolveDefaultModel,
  getOwnedChat,
  requireOwnedChat,
  getChatMessages,
  attachDocumentsToMessages,
} from './chat-core.js';

async function publishRealtimeNow(env, event) {
  try {
    return await createRealtimeBus(env).publish(event);
  } catch {
    return false;
  }
}

export async function chatCollectionRouter(req, env, user, path, originSessionId) {
  const db = createDB(env.DB);

  if (req.method === 'GET' && path === '/api/chats') {
    const authDecision = await authorize(env, user, {
      action: 'chat.read',
      resource: 'chat',
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
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
      return error(
        req,
        'Query parameter "limit" must be a positive integer between 1 and 100',
        400
      );
    }
    const limit = Number.parseInt(limitParamStr, 10);
    if (limit > 100) {
      return error(
        req,
        'Query parameter "limit" must be a positive integer between 1 and 100',
        400
      );
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
         WHERE c.user_id = ?
         AND c.archived = 0
         AND (c.title LIKE ? OR m.content LIKE ?)
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

  if (req.method === 'POST' && path === '/api/chats') {
    const authDecision = await authorize(env, user, {
      action: 'chat.write',
      resource: 'chat',
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      // optional
    }

    const id = crypto.randomUUID();
    const title = String(body.title || 'New Chat').trim() || 'New Chat';
    const fallbackModel = await resolveDefaultModel(env, db, user.sub);
    const model = String(body.model || fallbackModel).trim() || fallbackModel;

    await db.run(
      'INSERT INTO chats (id, user_id, title, model, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 0, unixepoch(), unixepoch())',
      [id, user.sub, title, model]
    );

    const chat = await db.first('SELECT * FROM chats WHERE id = ?', [id]);
    await publishRealtimeNow(
      env,
      createRealtimeEvent({
        type: 'chat.created',
        userId: user.sub,
        chatId: id,
        originSessionId,
        data: { model, chat },
      })
    );
    return json(req, { chat }, 201);
  }

  if (req.method === 'GET' && path === '/api/chats/shared') {
    const authDecision = await authorize(env, user, {
      action: 'chat.read',
      resource: 'chat',
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const sharedChats = await db.all(
      'SELECT id, title, model, pinned, share_id, created_at, updated_at FROM chats WHERE user_id = ? AND share_id IS NOT NULL ORDER BY updated_at DESC',
      [user.sub]
    );
    return json(req, { chats: sharedChats });
  }

  if (req.method === 'GET' && path === '/api/chats/archived') {
    const authDecision = await authorize(env, user, {
      action: 'chat.read',
      resource: 'chat',
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const archivedChats = await db.all(
      'SELECT id, title, model, pinned, created_at, updated_at FROM chats WHERE user_id = ? AND archived = 1 ORDER BY updated_at DESC',
      [user.sub]
    );
    return json(req, { chats: archivedChats });
  }

  const chatIdMatch = path.match(/^\/api\/chats\/([^/]+)$/);
  if (chatIdMatch) {
    const chatId = chatIdMatch[1];

    if (req.method === 'GET') {
      const authDecision = await authorize(env, user, {
        action: 'chat.read',
        resource: 'chat',
        resourceId: chatId,
      });
      if (!authDecision.allow) {
        return error(req, authDecision.reason || 'Forbidden', 403);
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

    if (req.method === 'PUT') {
      const authDecision = await authorize(env, user, {
        action: 'chat.write',
        resource: 'chat',
        resourceId: chatId,
      });
      if (!authDecision.allow) {
        return error(req, authDecision.reason || 'Forbidden', 403);
      }

      const owned = await requireOwnedChat(req, db, chatId, user.sub);
      if (owned.error) return owned.error;
      const chat = owned.chat;

      let body;
      try {
        body = await req.json();
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      const title = body.title !== undefined ? String(body.title).trim() : chat.title;
      const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : chat.pinned;

      await db.run(
        'UPDATE chats SET title = ?, pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [title || 'New Chat', pinned, chatId, user.sub]
      );

      const updatedOwned = await requireOwnedChat(req, db, chatId, user.sub);
      const updated = updatedOwned.chat || null;
      await publishRealtimeNow(
        env,
        createRealtimeEvent({
          type: 'chat.updated',
          userId: user.sub,
          chatId,
          originSessionId,
          data: { chat: updated },
        })
      );
      return json(req, { chat: updated });
    }

    if (req.method === 'DELETE') {
      const authDecision = await authorize(env, user, {
        action: 'chat.delete',
        resource: 'chat',
        resourceId: chatId,
      });
      if (!authDecision.allow) {
        return error(req, authDecision.reason || 'Forbidden', 403);
      }

      const owned = await requireOwnedChat(req, db, chatId, user.sub);
      if (owned.error) return owned.error;

      await db.run('DELETE FROM chats WHERE id = ? AND user_id = ?', [chatId, user.sub]);
      await publishRealtimeNow(
        env,
        createRealtimeEvent({
          type: 'chat.deleted',
          userId: user.sub,
          chatId,
          originSessionId,
        })
      );
      await publishRealtimeNow(
        env,
        createRealtimeEvent({
          type: 'chat.updated',
          userId: user.sub,
          chatId,
          originSessionId,
          data: { shared: false, chat: null },
        })
      );

      return json(req, { ok: true });
    }
  }

  const pinMatch = path.match(/^\/api\/chats\/([^/]+)\/pin$/);
  if (pinMatch && req.method === 'POST') {
    const chatId = pinMatch[1];
    const authDecision = await authorize(env, user, {
      action: 'chat.write',
      resource: 'chat',
      resourceId: chatId,
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;
    const chat = owned.chat;

    const nextPinned = chat.pinned ? 0 : 1;
    await db.run(
      'UPDATE chats SET pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [nextPinned, chatId, user.sub]
    );

    const updatedOwned = await requireOwnedChat(req, db, chatId, user.sub);
    const updated = updatedOwned.chat || null;
    await publishRealtimeNow(
      env,
      createRealtimeEvent({
        type: 'chat.updated',
        userId: user.sub,
        chatId,
        originSessionId,
        data: { chat: updated },
      })
    );

    return json(req, { chat: updated });
  }

  const cloneMatch = path.match(/^\/api\/chats\/([^/]+)\/clone$/);
  if (cloneMatch && req.method === 'POST') {
    const sourceChatId = cloneMatch[1];
    const authDecision = await authorize(env, user, {
      action: 'chat.write',
      resource: 'chat',
      resourceId: sourceChatId,
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const sourceOwned = await requireOwnedChat(req, db, sourceChatId, user.sub);
    if (sourceOwned.error) return sourceOwned.error;
    const sourceChat = sourceOwned.chat;

    const sourceMessages = await db.all(
      'SELECT id, role, content, model, citations, parent_id, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC',
      [sourceChatId]
    );

    const newChatId = crypto.randomUUID();
    const newTitle = `${String(sourceChat.title || 'New Chat').trim() || 'New Chat'} (Copy)`;
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

    const mappedCurrentMessageId = sourceChat.current_message_id
      ? messageIdMap.get(String(sourceChat.current_message_id)) || null
      : null;
    if (mappedCurrentMessageId) {
      statements.push(
        db
          .prepare(
            'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
          )
          .bind(mappedCurrentMessageId, newChatId, user.sub)
      );
    }

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

  const shareMatch = path.match(/^\/api\/chats\/([^/]+)\/share$/);
  if (shareMatch && req.method === 'POST') {
    const chatId = shareMatch[1];
    const authDecision = await authorize(env, user, {
      action: 'chat.share',
      resource: 'chat',
      resourceId: chatId,
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;
    const chat = owned.chat;

    let shareId = chat.share_id;
    if (!shareId) {
      shareId = crypto.randomUUID();
      await db.run(
        'UPDATE chats SET share_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [shareId, chatId, user.sub]
      );
    }

    const updatedOwned = await requireOwnedChat(req, db, chatId, user.sub);
    await publishRealtimeNow(
      env,
      createRealtimeEvent({
        type: 'chat.updated',
        userId: user.sub,
        chatId,
        originSessionId,
        data: { shared: true, chat: updatedOwned.chat || null },
      })
    );

    return json(
      req,
      {
        share_id: shareId,
        share_url: `/s/${shareId}`,
        chat_id: chatId,
      },
      200
    );
  }

  const unshareMatch = path.match(/^\/api\/chats\/([^/]+)\/share$/);
  if (unshareMatch && req.method === 'DELETE') {
    const chatId = unshareMatch[1];
    const authDecision = await authorize(env, user, {
      action: 'chat.share',
      resource: 'chat',
      resourceId: chatId,
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;
    const chat = owned.chat;

    if (chat.share_id) {
      await db.run(
        'UPDATE chats SET share_id = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [chatId, user.sub]
      );
    }

    return json(req, { ok: true });
  }

  const archiveMatch = path.match(/^\/api\/chats\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'POST') {
    const chatId = archiveMatch[1];
    const authDecision = await authorize(env, user, {
      action: 'chat.write',
      resource: 'chat',
      resourceId: chatId,
    });
    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const owned = await requireOwnedChat(req, db, chatId, user.sub);
    if (owned.error) return owned.error;
    const chat = owned.chat;

    const newArchived = chat.archived ? 0 : 1;
    await db.run(
      'UPDATE chats SET archived = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [newArchived, chatId, user.sub]
    );

    const updatedOwned = await requireOwnedChat(req, db, chatId, user.sub);
    const updated = updatedOwned.chat || null;
    await publishRealtimeNow(
      env,
      createRealtimeEvent({
        type: 'chat.updated',
        userId: user.sub,
        chatId,
        originSessionId,
        data: { archived: newArchived === 1 },
      })
    );
    return json(req, { chat: updated, archived: newArchived === 1 });
  }

  return null;
}
