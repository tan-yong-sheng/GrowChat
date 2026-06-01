import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { stripHtml } from '../utils/sanitize.js';
import { createRealtimeEvent } from '../features/realtime/realtime.js';
import { createRealtimeBus } from '../services/realtime-bus.js';
import { authorize } from '../utils/authorize.js';
import { resolveDefaultModel, requireOwnedChat } from './chat-core.js';
import { handleListChats, handleGetChat, handleCloneChat } from './chat-collection-ops.js';

async function publishRealtimeNow(env, event) {
  try {
    return await createRealtimeBus(env).publish(event);
  } catch {
    return false;
  }
}

async function reloadAndPublishChat(req, db, env, user, chatId, originSessionId) {
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

export async function chatCollectionRouter(req, env, user, path, originSessionId) {
  const db = createDB(env.DB);

  if (req.method === 'GET' && path === '/api/chats') {
    return handleListChats(req, env, db, user);
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
    const title = stripHtml(String(body.title || 'New Chat').trim()) || 'New Chat';
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
      return handleGetChat(req, env, db, user, chatId);
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

      const title = body.title !== undefined ? stripHtml(String(body.title).trim()) : chat.title;
      const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : chat.pinned;

      await db.run(
        'UPDATE chats SET title = ?, pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [title || 'New Chat', pinned, chatId, user.sub]
      );

      return reloadAndPublishChat(req, db, env, user, chatId, originSessionId);
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

    return reloadAndPublishChat(req, db, env, user, chatId, originSessionId);
  }

  const cloneMatch = path.match(/^\/api\/chats\/([^/]+)\/clone$/);
  if (cloneMatch && req.method === 'POST') {
    return handleCloneChat(req, env, db, user, cloneMatch[1], originSessionId, publishRealtimeNow);
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

    return json(req, { share_id: shareId, share_url: `/s/${shareId}`, chat_id: chatId }, 200);
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
