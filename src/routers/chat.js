import { createDB } from '../db.js';
import { error, json, sseData, sseHeaders } from '../utils/response.js';
import { SseLineParser, streamLLM } from '../llm.js';
import { queryFAQs, queryDocumentChunks } from '../services/embeddings.js';
import { createRealtimeEvent, getOriginSessionId, publishRealtimeEvent } from '../realtime.js';

const BUILTIN_DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

function defaultModel(env) {
  const envDefault = env.DEFAULT_MODELS;
  if (envDefault && envDefault.trim()) {
    // If it's a comma-separated list, use the first model
    const models = envDefault.split(',').map(m => m.trim()).filter(m => m);
    return models[0] || BUILTIN_DEFAULT_MODEL;
  }
  return BUILTIN_DEFAULT_MODEL;
}

function requireAuth(req, user) {
  if (!user) return error(req, 'Unauthorized', 401);
  return null;
}

async function getOwnedChat(db, chatId, userId) {
  return db.first('SELECT * FROM chats WHERE id = ? AND user_id = ?', [chatId, userId]);
}

async function getMessageSnapshot(db, messageId) {
  if (!messageId) return null;
  return db.first(
    'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ?',
    [messageId]
  );
}

function scheduleRealtimeEvent(ctx, env, event) {
  const publishPromise = publishRealtimeEvent(env, event);
  if (ctx?.waitUntil) {
    ctx.waitUntil(publishPromise.catch(() => false));
    return;
  }
  publishPromise.catch(() => false);
}

async function publishRealtimeNow(env, event) {
  try {
    return await publishRealtimeEvent(env, event);
  } catch {
    return false;
  }
}

export async function chatRouter(req, env, ctx, user, path) {
  const isChatPath = path === '/api/chats' || path === '/api/chats/shared' || path === '/api/chats/archived' || /^\/api\/chats\/[^/]+(?:\/messages(?:\/[^/]+(?:\/(?:branch|regenerate))?)?|\/(?:share|archive|pin|clone))?$/.test(path);
  if (!isChatPath) return null;

  const unauthorized = requireAuth(req, user);
  if (unauthorized) return unauthorized;

  const db = createDB(env.DB);
  const originSessionId = getOriginSessionId(req);

  if (req.method === 'GET' && path === '/api/chats') {
    const url = new URL(req.url);

    // Strict validation for query parameter 'q'
    let qRaw = url.searchParams.get('q') || '';
    qRaw = qRaw.trim();

    // Validate 'q' parameter: 1-200 alphanumeric characters (whitespace allowed)
    if (qRaw.length > 200) {
      return error(req, 'Query parameter "q" exceeds 200 characters', 400);
    }
    if (!/^[^\x00-\x1F\x7F]*$/.test(qRaw)) {
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
        `SELECT DISTINCT c.id, c.title, c.model, c.pinned, c.tags, c.created_at, c.updated_at
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
        'SELECT id, title, model, pinned, tags, created_at, updated_at FROM chats WHERE user_id = ? AND archived = 0 ORDER BY updated_at DESC, created_at DESC LIMIT ? OFFSET ?',
        [user.sub, queryLimit, offset]
      );
    }

    const has_more = chats.length > limit;
    const items = has_more ? chats.slice(0, limit) : chats;

    return json(req, { chats: items, limit, offset, query: qRaw, has_more });
  }

  if (req.method === 'POST' && path === '/api/chats') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // optional
    }

    const id = crypto.randomUUID();
    const title = String(body.title || 'New Chat').trim() || 'New Chat';
    const model = String(body.model || defaultModel(env)).trim() || defaultModel(env);

    await db.run(
      'INSERT INTO chats (id, user_id, title, model, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, unixepoch(), unixepoch())',
      [id, user.sub, title, model, '[]']
    );

    const chat = await db.first('SELECT * FROM chats WHERE id = ?', [id]);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.created',
      userId: user.sub,
      chatId: id,
      originSessionId,
      data: { model, chat },
    }));
    return json(req, { chat }, 201);
  }

  // Route: GET /api/chats/shared - List shared chats
  if (req.method === 'GET' && path === '/api/chats/shared') {
    const sharedChats = await db.all(
      'SELECT id, title, model, pinned, tags, share_id, created_at, updated_at FROM chats WHERE user_id = ? AND share_id IS NOT NULL ORDER BY updated_at DESC',
      [user.sub]
    );
    return json(req, { chats: sharedChats });
  }

  // Route: GET /api/chats/archived - List archived chats
  if (req.method === 'GET' && path === '/api/chats/archived') {
    const archivedChats = await db.all(
      'SELECT id, title, model, pinned, tags, created_at, updated_at FROM chats WHERE user_id = ? AND archived = 1 ORDER BY updated_at DESC',
      [user.sub]
    );
    return json(req, { chats: archivedChats });
  }

  const chatIdMatch = path.match(/^\/api\/chats\/([^/]+)$/);
  if (chatIdMatch) {
    const chatId = chatIdMatch[1];

    if (req.method === 'GET') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      const messages = await db.all(
        'SELECT id, role, content, model, citations, parent_id, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
        [chatId]
      );

      return json(req, { chat, messages });
    }

    if (req.method === 'PUT') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      let body;
      try {
        body = await req.json();
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      const title = body.title !== undefined ? String(body.title).trim() : chat.title;
      const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : chat.pinned;
      const tagsArray = Array.isArray(body.tags) ? body.tags : [];
      const tags = body.tags !== undefined ? JSON.stringify(tagsArray) : chat.tags;

      await db.run(
        'UPDATE chats SET title = ?, pinned = ?, tags = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [title || 'New Chat', pinned, tags, chatId, user.sub]
      );

      const updated = await getOwnedChat(db, chatId, user.sub);
      await publishRealtimeNow(env, createRealtimeEvent({
        type: 'chat.updated',
        userId: user.sub,
        chatId,
        originSessionId,
        data: { chat: updated },
      }));
      return json(req, { chat: updated });
    }

    if (req.method === 'DELETE') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      await db.run('DELETE FROM chats WHERE id = ? AND user_id = ?', [chatId, user.sub]);
      await publishRealtimeNow(env, createRealtimeEvent({
        type: 'chat.deleted',
        userId: user.sub,
        chatId,
        originSessionId,
      }));
      await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { shared: false, chat: await getOwnedChat(db, chatId, user.sub) },
    }));

    return json(req, { ok: true });
    }
  }

  // Route: POST /api/chats/:id/pin - Toggle pinned state
  const pinMatch = path.match(/^\/api\/chats\/([^/]+)\/pin$/);
  if (pinMatch && req.method === 'POST') {
    const chatId = pinMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const nextPinned = chat.pinned ? 0 : 1;
    await db.run(
      'UPDATE chats SET pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [nextPinned, chatId, user.sub]
    );

    const updated = await getOwnedChat(db, chatId, user.sub);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { chat: updated },
    }));

    return json(req, { chat: updated });
  }

  // Route: POST /api/chats/:id/clone - Duplicate chat and messages
  const cloneMatch = path.match(/^\/api\/chats\/([^/]+)\/clone$/);
  if (cloneMatch && req.method === 'POST') {
    const sourceChatId = cloneMatch[1];
    const sourceChat = await getOwnedChat(db, sourceChatId, user.sub);
    if (!sourceChat) return error(req, 'Chat not found', 404);

    const sourceMessages = await db.all(
      'SELECT id, role, content, model, citations, parent_id, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
      [sourceChatId]
    );

    const newChatId = crypto.randomUUID();
    const newTitle = `${String(sourceChat.title || 'New Chat').trim() || 'New Chat'} (Copy)`;

    const statements = [
      db.prepare(
        'INSERT INTO chats (id, user_id, title, model, tags, pinned, share_id, archived, current_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, 0, NULL, unixepoch(), unixepoch())'
      ).bind(
        newChatId,
        user.sub,
        newTitle,
        sourceChat.model || defaultModel(env),
        sourceChat.tags || '[]'
      ),
    ];

    const messageIdMap = new Map();
    for (const message of sourceMessages) {
      messageIdMap.set(String(message.id), crypto.randomUUID());
    }

    for (const message of sourceMessages) {
      const mappedParentId = message.parent_id ? messageIdMap.get(String(message.parent_id)) || null : null;
      statements.push(
        db.prepare(
          'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())'
        ).bind(
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
        db.prepare(
          'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
        ).bind(mappedCurrentMessageId, newChatId, user.sub)
      );
    }

    await db.batch(statements);

    const createdChat = await getOwnedChat(db, newChatId, user.sub);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.created',
      userId: user.sub,
      chatId: newChatId,
      originSessionId,
      data: { model: createdChat?.model, chat: createdChat },
    }));

    return json(req, { chat: createdChat }, 201);
  }

  // Route: POST /api/chats/:id/share - Create or get share link
  const shareMatch = path.match(/^\/api\/chats\/([^/]+)\/share$/);
  if (shareMatch && req.method === 'POST') {
    const chatId = shareMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    let shareId = chat.share_id;
    if (!shareId) {
      shareId = crypto.randomUUID();
      await db.run(
        'UPDATE chats SET share_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [shareId, chatId, user.sub]
      );
    }

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { shared: true, chat: await getOwnedChat(db, chatId, user.sub) },
    }));

    return json(req, {
      share_id: shareId,
      share_url: `/s/${shareId}`,
      chat_id: chatId,
    }, 200);
  }

  // Route: DELETE /api/chats/:id/share - Revoke share link
  const unshareMatch = path.match(/^\/api\/chats\/([^/]+)\/share$/);
  if (unshareMatch && req.method === 'DELETE') {
    const chatId = unshareMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    if (chat.share_id) {
      await db.run(
        'UPDATE chats SET share_id = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [chatId, user.sub]
      );
    }

    return json(req, { ok: true });
  }

  // Route: POST /api/chats/:id/archive - Toggle archive state
  const archiveMatch = path.match(/^\/api\/chats\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'POST') {
    const chatId = archiveMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const newArchived = chat.archived ? 0 : 1;
    await db.run(
      'UPDATE chats SET archived = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [newArchived, chatId, user.sub]
    );

    const updated = await getOwnedChat(db, chatId, user.sub);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { archived: newArchived === 1 },
    }));
    return json(req, { chat: updated, archived: newArchived === 1 });
  }

  const sendMatch = path.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (sendMatch && req.method === 'POST') {
    const chatId = sendMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const content = String(body.message || '').trim();
    if (!content) return error(req, 'message is required', 400);

    const model = String(body.model || chat.model || defaultModel(env)).trim() || defaultModel(env);

    const userMsgId = crypto.randomUUID();
    const parentId = chat.current_message_id || null;
    await db.batch([
      db.prepare(
        'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
      ).bind(userMsgId, chatId, 'user', content, model, parentId),
      db.prepare(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
      ).bind(userMsgId, chatId, user.sub),
    ]);

    const createdUserMessage = await getMessageSnapshot(db, userMsgId);
    const updatedChatAfterUserMessage = await getOwnedChat(db, chatId, user.sub);

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'message.created',
      userId: user.sub,
      chatId,
      messageId: userMsgId,
      originSessionId,
      data: { role: 'user', model, message: createdUserMessage, chat: updatedChatAfterUserMessage },
    }));

    const history = await db.all(
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 30',
      [chatId]
    );

    let ragContext = '';
    let citations = [];

    try {
      const faqResults = await queryFAQs(env, db, user.sub, content, 3, 0.5);
      if (faqResults.length > 0) {
        ragContext += '\n## Relevant FAQs\n';
        for (const faq of faqResults) {
          ragContext += `\n**Q: ${faq.question}**\nA: ${faq.answer}\n`;
          if (faq.id) citations.push(faq.id);
        }
      }

      const chunkResults = await queryDocumentChunks(env, db, user.sub, content, 5, 0.5);
      if (chunkResults.length > 0) {
        ragContext += '\n## Relevant Documents\n';
        const seenDocs = new Set();
        for (const chunk of chunkResults) {
          const docId = chunk.doc_id || chunk.document_id;
          const docName = chunk.filename || 'Document';

          if (!seenDocs.has(docId)) {
            ragContext += `\n**${docName}**\n`;
            seenDocs.add(docId);
          }
          ragContext += `${chunk.chunk_text}\n`;
        }
      }
    } catch (err) {
      console.error('RAG query failed:', err);
    }

    let enhancedHistory = [...history];
    if (ragContext) {
      enhancedHistory = [
        {
          role: 'system',
          content: `You are a helpful assistant. Use the following context to answer the user's question:\n${ragContext}`,
        },
        ...history,
      ];
    }

    const assistantMsgId = crypto.randomUUID();


    let stream;
    try {
      stream = await streamLLM(env, model, enhancedHistory);
    } catch (err) {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId, message_id: assistantMsgId })));
          controller.enqueue(encoder.encode(sseData({ error: 'llm_unavailable', message: 'LLM setup failed' })));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(body, { headers: sseHeaders(req) });
    }

    const reader = stream.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const parser = new SseLineParser();
    let fullText = '';
    let deltaSeq = 0;

    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId, message_id: assistantMsgId })));
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const delta = parser.push(decoder.decode(value, { stream: true }));
            if (delta) {
              fullText += delta;
              controller.enqueue(encoder.encode(sseData({ response: delta })));
              await publishRealtimeNow(env, createRealtimeEvent({
                type: 'message.delta',
                userId: user.sub,
                chatId,
                messageId: assistantMsgId,
                originSessionId,
                data: { delta, model, seq: ++deltaSeq },
              }));
            }
          }

          const finalDelta = parser.flush();
          if (finalDelta) {
            fullText += finalDelta;
            controller.enqueue(encoder.encode(sseData({ response: finalDelta })));
            await publishRealtimeNow(env, createRealtimeEvent({
              type: 'message.delta',
              userId: user.sub,
              chatId,
              messageId: assistantMsgId,
              originSessionId,
              data: { delta: finalDelta, model, seq: ++deltaSeq },
            }));
          }

          if (fullText) {
            const citationsJson = JSON.stringify(citations);
            await db.run(
              'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
              [assistantMsgId, chatId, 'assistant', fullText, model, citationsJson, userMsgId]
            );
            await db.run(
              'UPDATE chats SET current_message_id = ? WHERE id = ? AND user_id = ?',
              [assistantMsgId, chatId, user.sub]
            );
            const completedAssistantMessage = await getMessageSnapshot(db, assistantMsgId);
            const updatedChatAfterAssistantMessage = await getOwnedChat(db, chatId, user.sub);
            await publishRealtimeNow(env, createRealtimeEvent({
              type: 'message.completed',
              userId: user.sub,
              chatId,
              messageId: assistantMsgId,
              originSessionId,
              data: {
                role: 'assistant',
                model,
                citations,
                message: completedAssistantMessage,
                chat: updatedChatAfterAssistantMessage,
              },
            }));
          }

          await db.run('UPDATE chats SET model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?', [model, chatId, user.sub]);
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          controller.enqueue(encoder.encode(sseData({ error: 'stream_failed', message: 'Stream failed' })));
          controller.close();
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(readable, { headers: sseHeaders(req) });
  }

  // Route: POST /api/chats/:id/messages/:msgId/branch
  // Supports both user and assistant message branching
  // For user messages: creates new user message + calls LLM + streams response
  // For assistant messages (no_reply=true): creates new sibling message without LLM
  const branchMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/branch$/);
  if (branchMatch && req.method === 'POST') {
    const chatId = branchMatch[1];
    const msgId = branchMatch[2];

    async function getBranchHistory(leafMessageId) {
      return db.all(
        `WITH RECURSIVE lineage AS (
          SELECT id, parent_id, role, content, created_at
          FROM messages
          WHERE id = ? AND chat_id = ?

          UNION ALL

          SELECT m.id, m.parent_id, m.role, m.content, m.created_at
          FROM messages m
          JOIN lineage l ON m.id = l.parent_id
          WHERE m.chat_id = ?
        )
        SELECT role, content FROM (
          SELECT role, content, created_at
          FROM lineage
          ORDER BY created_at DESC
          LIMIT 30
        )
        ORDER BY created_at ASC`,
        [leafMessageId, chatId, chatId]
      );
    }

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

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

    const role = String(body.role || 'user').trim().toLowerCase();
    if (role !== 'user' && role !== 'assistant') {
      return error(req, "role must be 'user' or 'assistant'", 400);
    }

    const noReply = body.no_reply === true;

    // Validate role/no_reply combination
    if (role === 'user' && noReply) {
      return error(req, "User message branching does not support no_reply=true", 400);
    }
    if (role === 'assistant' && !noReply) {
      return error(req, "Assistant message branching requires no_reply=true", 400);
    }

    if (sourceMsg.role !== role) {
      return error(req, `Cannot branch a ${sourceMsg.role} message as ${role}`, 400);
    }

    // === ASSISTANT MESSAGE BRANCHING (no_reply=true) ===
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
      const updatedChat = await getOwnedChat(db, chatId, user.sub);

      await publishRealtimeNow(env, createRealtimeEvent({
        type: 'message.completed',
        userId: user.sub,
        chatId,
        messageId: newAssistantMsgId,
        originSessionId,
        data: { role: 'assistant', model: sourceMsg.model, message: newMsg, chat: updatedChat },
      }));

      return json(req, { message: newMsg }, 200);
    }

    // === USER MESSAGE BRANCHING (role='user' or default) ===
    const model = String(body.model || chat.model || defaultModel(env)).trim() || defaultModel(env);

    const newUserMsgId = crypto.randomUUID();
    await db.batch([
      db.prepare(
        'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
      ).bind(newUserMsgId, chatId, 'user', content, model, sourceMsg.parent_id),
      db.prepare(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
      ).bind(newUserMsgId, chatId, user.sub),
    ]);

    const createdBranchUserMessage = await getMessageSnapshot(db, newUserMsgId);
    const updatedBranchChat = await getOwnedChat(db, chatId, user.sub);

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'message.created',
      userId: user.sub,
      chatId,
      messageId: newUserMsgId,
      originSessionId,
      data: { role: 'user', model, message: createdBranchUserMessage, chat: updatedBranchChat },
    }));

    const history = await getBranchHistory(newUserMsgId);
    const assistantMsgId = crypto.randomUUID();

    let stream;
    try {
      stream = await streamLLM(env, model, history);
    } catch (err) {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId, message_id: assistantMsgId })));
          controller.enqueue(encoder.encode(sseData({ error: 'llm_unavailable', message: 'LLM setup failed' })));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(body, { headers: sseHeaders(req) });
    }

    const reader = stream.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const parser = new SseLineParser();
    let fullText = '';
    let deltaSeq = 0;

    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId, message_id: assistantMsgId })));
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const delta = parser.push(decoder.decode(value, { stream: true }));
            if (delta) {
              fullText += delta;
              controller.enqueue(encoder.encode(sseData({ response: delta })));
              await publishRealtimeNow(env, createRealtimeEvent({
                type: 'message.delta',
                userId: user.sub,
                chatId,
                messageId: assistantMsgId,
                originSessionId,
                data: { delta, model, seq: ++deltaSeq },
              }));
            }
          }

          const finalDelta = parser.flush();
          if (finalDelta) {
            fullText += finalDelta;
            controller.enqueue(encoder.encode(sseData({ response: finalDelta })));
            await publishRealtimeNow(env, createRealtimeEvent({
              type: 'message.delta',
              userId: user.sub,
              chatId,
              messageId: assistantMsgId,
              originSessionId,
              data: { delta: finalDelta, model, seq: ++deltaSeq },
            }));
          }

          if (fullText) {
            await db.batch([
              db.prepare(
                'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())',
                [assistantMsgId, chatId, 'assistant', fullText, model, newUserMsgId]
              ),
              db.prepare(
                'UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
                [assistantMsgId, model, chatId, user.sub]
              ),
            ]);
            const completedBranchAssistantMessage = await getMessageSnapshot(db, assistantMsgId);
            const updatedBranchAssistantChat = await getOwnedChat(db, chatId, user.sub);
            await publishRealtimeNow(env, createRealtimeEvent({
              type: 'message.completed',
              userId: user.sub,
              chatId,
              messageId: assistantMsgId,
              originSessionId,
              data: {
                role: 'assistant',
                model,
                message: completedBranchAssistantMessage,
                chat: updatedBranchAssistantChat,
              },
            }));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          controller.enqueue(encoder.encode(sseData({ error: 'stream_failed', message: 'Stream failed' })));
          controller.close();
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(readable, { headers: sseHeaders(req) });
  }

  // Route: POST /api/chats/:id/messages/:msgId/regenerate
  const regenerateMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/regenerate$/);
  if (regenerateMatch && req.method === 'POST') {
    const chatId = regenerateMatch[1];
    const msgId = regenerateMatch[2];

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const sourceMsg = await db.first(
      'SELECT role, parent_id FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!sourceMsg) return error(req, 'Message not found', 404);
    if (sourceMsg.role !== 'assistant') return error(req, 'Can only regenerate assistant messages', 400);

    const model = String(chat.model || defaultModel(env)).trim() || defaultModel(env);
    const newAssistantMsgId = crypto.randomUUID();

    const history = await db.all(
      'SELECT role, content FROM messages WHERE chat_id = ? AND created_at <= (SELECT created_at FROM messages WHERE id = ?) ORDER BY created_at ASC LIMIT 30',
      [chatId, sourceMsg.parent_id || msgId]
    );

    let stream;
    try {
      stream = await streamLLM(env, model, history);
    } catch (err) {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId, message_id: newAssistantMsgId })));
          controller.enqueue(encoder.encode(sseData({ error: 'llm_unavailable', message: 'LLM setup failed' })));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(body, { headers: sseHeaders(req) });
    }

    const reader = stream.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const parser = new SseLineParser();
    let fullText = '';
    let deltaSeq = 0;

    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId, message_id: newAssistantMsgId })));
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const delta = parser.push(decoder.decode(value, { stream: true }));
            if (delta) {
              fullText += delta;
              controller.enqueue(encoder.encode(sseData({ response: delta })));
              await publishRealtimeNow(env, createRealtimeEvent({
                type: 'message.delta',
                userId: user.sub,
                chatId,
                messageId: newAssistantMsgId,
                originSessionId,
                data: { delta, model, seq: ++deltaSeq },
              }));
            }
          }

          const finalDelta = parser.flush();
          if (finalDelta) {
            fullText += finalDelta;
            controller.enqueue(encoder.encode(sseData({ response: finalDelta })));
            await publishRealtimeNow(env, createRealtimeEvent({
              type: 'message.delta',
              userId: user.sub,
              chatId,
              messageId: newAssistantMsgId,
              originSessionId,
              data: { delta: finalDelta, model, seq: ++deltaSeq },
            }));
          }

          if (fullText) {
            await db.run(
              'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())',
              [newAssistantMsgId, chatId, 'assistant', fullText, model, sourceMsg.parent_id]
            );
            await db.run(
              'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
              [newAssistantMsgId, chatId, user.sub]
            );
            const completedRegeneratedMessage = await getMessageSnapshot(db, newAssistantMsgId);
            const updatedRegeneratedChat = await getOwnedChat(db, chatId, user.sub);
            await publishRealtimeNow(env, createRealtimeEvent({
              type: 'message.completed',
              userId: user.sub,
              chatId,
              messageId: newAssistantMsgId,
              originSessionId,
              data: {
                role: 'assistant',
                model,
                message: completedRegeneratedMessage,
                chat: updatedRegeneratedChat,
              },
            }));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          controller.enqueue(encoder.encode(sseData({ error: 'stream_failed', message: 'Stream failed' })));
          controller.close();
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(readable, { headers: sseHeaders(req) });
  }

  // Route: PUT /api/chats/:id/messages/:msgId
  const updateMessageMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/);
  if (updateMessageMatch && req.method === 'PUT') {
    const chatId = updateMessageMatch[1];
    const msgId = updateMessageMatch[2];

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

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
      db.prepare(
        'UPDATE messages SET content = ? WHERE id = ? AND chat_id = ?',
        [content, msgId, chatId]
      ),
      db.prepare(
        'UPDATE chats SET updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [chatId, user.sub]
      ),
    ]);

    const updatedMessage = await db.first(
      'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { message_id: msgId },
    }));

    return json(req, { message: updatedMessage }, 200);
  }

  // Route: DELETE /api/chats/:id/messages/:msgId
  const deleteMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const chatId = deleteMatch[1];
    const msgId = deleteMatch[2];

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const msg = await db.first('SELECT id FROM messages WHERE id = ? AND chat_id = ?', [msgId, chatId]);
    if (!msg) return error(req, 'Message not found', 404);

    async function deleteMessageSubtree(nodeId) {
      const children = await db.all(
        'SELECT id FROM messages WHERE parent_id = ? AND chat_id = ?',
        [nodeId, chatId]
      );
      for (const child of children) {
        await deleteMessageSubtree(child.id);
      }
      await db.run('DELETE FROM messages WHERE id = ? AND chat_id = ?', [nodeId, chatId]);
    }

    await deleteMessageSubtree(msgId);

    const lastMsg = await db.first(
      'SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1',
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

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { deleted_message_id: msgId },
    }));

    return json(req, { ok: true, deleted: msgId });
  }

  return null;
}
