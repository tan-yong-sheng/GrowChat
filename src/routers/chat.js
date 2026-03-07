import { createDB } from '../db.js';
import { error, json, sseData, sseHeaders } from '../utils/response.js';
import { SseLineParser, streamLLM } from '../llm.js';
import { queryFAQs, queryDocumentChunks } from '../services/embeddings.js';

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

function isRagEnabled(env) {
  const v = String(env.ENABLE_RAG || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function requireAuth(req, user) {
  if (!user) return error(req, 'Unauthorized', 401);
  return null;
}

async function getOwnedChat(db, chatId, userId) {
  return db.first('SELECT * FROM chats WHERE id = ? AND user_id = ?', [chatId, userId]);
}

async function buildBranchHistory(db, userMsgId) {
  const history = [];
  let cursor = userMsgId;
  let guard = 0;
  while (cursor && guard < 200) {
    guard += 1;
    const row = await db.first('SELECT id, role, content, parent_id FROM messages WHERE id = ?', [cursor]);
    if (!row) break;
    history.unshift({ role: row.role, content: row.content });
    cursor = row.parent_id || null;
  }
  return history;
}

async function handleLLMResponse(req, env, db, user, chatId, parentId, content, model) {
  const userMsgId = crypto.randomUUID();
  await db.run(
    'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())',
    [userMsgId, chatId, 'user', content, model, parentId || null]
  );
  await db.run('UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?', [userMsgId, chatId, user.sub]);

  const history = await buildBranchHistory(db, userMsgId);

  let ragContext = '';
  let citations = [];
  if (isRagEnabled(env)) {
    try {
      const faqResults = await queryFAQs(env, db, content, 3, 0.5);
      if (faqResults.length > 0) {
        ragContext += '\n## Relevant FAQs\n';
        for (const faq of faqResults) {
          ragContext += `\n**Q: ${faq.question}**\nA: ${faq.answer}\n`;
          if (faq.id) citations.push(faq.id);
        }
      }

      const chunkResults = await queryDocumentChunks(env, db, content, 5, 0.5);
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

  let stream;
  try {
    stream = await streamLLM(env, model, enhancedHistory);
  } catch (err) {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId })));
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

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId })));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const delta = parser.push(decoder.decode(value, { stream: true }));
          if (delta) {
            fullText += delta;
            controller.enqueue(encoder.encode(sseData({ response: delta })));
          }
        }

        const finalDelta = parser.flush();
        if (finalDelta) {
          fullText += finalDelta;
          controller.enqueue(encoder.encode(sseData({ response: finalDelta })));
        }

        if (fullText) {
          const assistantMsgId = crypto.randomUUID();
          const citationsJson = JSON.stringify(citations);
          await db.run(
            'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
            [assistantMsgId, chatId, 'assistant', fullText, model, citationsJson, userMsgId]
          );
          await db.run('UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?', [assistantMsgId, model, chatId, user.sub]);
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

async function handleRegenerateResponse(req, env, db, user, chatId, parentUserMsg, model) {
  const history = await buildBranchHistory(db, parentUserMsg.id);

  let ragContext = '';
  let citations = [];
  if (isRagEnabled(env)) {
    try {
      const faqResults = await queryFAQs(env, db, parentUserMsg.content, 3, 0.5);
      if (faqResults.length > 0) {
        ragContext += '\n## Relevant FAQs\n';
        for (const faq of faqResults) {
          ragContext += `\n**Q: ${faq.question}**\nA: ${faq.answer}\n`;
          if (faq.id) citations.push(faq.id);
        }
      }

      const chunkResults = await queryDocumentChunks(env, db, parentUserMsg.content, 5, 0.5);
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

  let stream;
  try {
    stream = await streamLLM(env, model, enhancedHistory);
  } catch {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId })));
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

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId })));
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const delta = parser.push(decoder.decode(value, { stream: true }));
          if (delta) {
            fullText += delta;
            controller.enqueue(encoder.encode(sseData({ response: delta })));
          }
        }

        const finalDelta = parser.flush();
        if (finalDelta) {
          fullText += finalDelta;
          controller.enqueue(encoder.encode(sseData({ response: finalDelta })));
        }

        if (fullText) {
          const assistantMsgId = crypto.randomUUID();
          const citationsJson = JSON.stringify(citations);
          await db.run(
            'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
            [assistantMsgId, chatId, 'assistant', fullText, model, citationsJson, parentUserMsg.id]
          );
          await db.run('UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?', [assistantMsgId, model, chatId, user.sub]);
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

export async function chatRouter(req, env, _ctx, user, path) {
  const isChatPath = path === '/api/chats' || path === '/api/chats/shared' || path === '/api/chats/archived' || /^\/api\/chats\/[^/]+(?:\/(?:messages|share|archive|messages\/[^/]+(?:\/(?:branch|regenerate))?))?$/.test(path);
  if (!isChatPath) return null;

  const unauthorized = requireAuth(req, user);
  if (unauthorized) return unauthorized;

  const db = createDB(env.DB);

  if (req.method === 'GET' && path === '/api/chats') {
    const url = new URL(req.url);

    // Strict validation for query parameter 'q'
    let qRaw = url.searchParams.get('q') || '';
    qRaw = qRaw.trim();

    // Validate 'q' parameter: 1-200 alphanumeric characters (whitespace allowed)
    // This prevents SQL injection and ensures predictable search behavior
    if (qRaw.length > 200) {
      return error(req, 'Query parameter "q" exceeds 200 characters', 400);
    }
    // Ensure q contains only printable characters (basic safety check)
    if (!/^[^\x00-\x1F\x7F]*$/.test(qRaw)) {
      return error(req, 'Query parameter "q" contains invalid characters', 400);
    }

    // Strict validation for 'limit' parameter: positive integer, 1-100
    const limitParamStr = url.searchParams.get('limit') || '100';
    if (!/^[1-9]\d{0,2}$/.test(limitParamStr)) {
      return error(req, 'Query parameter "limit" must be a positive integer between 1 and 100', 400);
    }
    const limit = Number.parseInt(limitParamStr, 10);
    if (limit > 100) {
      return error(req, 'Query parameter "limit" must be a positive integer between 1 and 100', 400);
    }

    // Strict validation for 'offset' parameter: non-negative integer
    const offsetParamStr = url.searchParams.get('offset') || '0';
    if (!/^\d+$/.test(offsetParamStr)) {
      return error(req, 'Query parameter "offset" must be a non-negative integer', 400);
    }
    const offset = Number.parseInt(offsetParamStr, 10);

    // Execute search with deterministic sorting (updated_at DESC, created_at DESC)
    // The secondary sort by created_at ensures predictable ordering for ties
    let chats;
    if (qRaw) {
      const like = `%${qRaw}%`;
      chats = await db.all(
        'SELECT id, title, model, pinned, tags, created_at, updated_at FROM chats WHERE user_id = ? AND title LIKE ? ORDER BY updated_at DESC, created_at DESC LIMIT ? OFFSET ?',
        [user.sub, like, limit, offset]
      );
    } else {
      chats = await db.all(
        'SELECT id, title, model, pinned, tags, created_at, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT ? OFFSET ?',
        [user.sub, limit, offset]
      );
    }

    return json(req, { chats, limit, offset, query: qRaw });
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

      // Legacy compatibility: only backfill parent_id for fully-linear legacy chats.
      const hasAnyParent = messages.some((m) => Boolean(m.parent_id));
      if (!hasAnyParent) {
        for (let i = 1; i < messages.length; i += 1) {
          messages[i].parent_id = messages[i - 1].id || null;
        }
      }

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
      return json(req, { chat: updated });
    }

    if (req.method === 'DELETE') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      await db.run('DELETE FROM chats WHERE id = ? AND user_id = ?', [chatId, user.sub]);
      return json(req, { ok: true });
    }
  }

  // Route: POST /api/chats/:id/share - Create or get share link
  const shareMatch = path.match(/^\/api\/chats\/([^/]+)\/share$/);
  if (shareMatch && req.method === 'POST') {
    const chatId = shareMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    let shareId = chat.share_id;
    if (!shareId) {
      // Generate new share_id if not already set
      shareId = crypto.randomUUID();
      await db.run(
        'UPDATE chats SET share_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [shareId, chatId, user.sub]
      );
    }

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

  const deleteMessageMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/);
  if (deleteMessageMatch && req.method === 'DELETE') {
    const chatId = deleteMessageMatch[1];
    const msgId = deleteMessageMatch[2];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const target = await db.first('SELECT id, parent_id FROM messages WHERE id = ? AND chat_id = ?', [msgId, chatId]);
    if (!target) return error(req, 'Message not found', 404);

    const subtreeRows = await db.all(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM messages WHERE id = ? AND chat_id = ?
         UNION ALL
         SELECT m.id FROM messages m
         JOIN subtree s ON m.parent_id = s.id
         WHERE m.chat_id = ?
       )
       SELECT id FROM subtree`,
      [msgId, chatId, chatId]
    );
    const ids = (subtreeRows || []).map((r) => r.id).filter(Boolean);
    if (!ids.length) return json(req, { ok: true, deleted: 0 });
    const placeholders = ids.map(() => '?').join(', ');
    await db.run(`DELETE FROM messages WHERE chat_id = ? AND id IN (${placeholders})`, [chatId, ...ids]);

    if (chat.current_message_id && ids.includes(chat.current_message_id)) {
      await db.run('UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?', [target.parent_id || null, chatId, user.sub]);
    } else {
      await db.run('UPDATE chats SET updated_at = unixepoch() WHERE id = ? AND user_id = ?', [chatId, user.sub]);
    }

    return json(req, { ok: true, deleted: ids.length });
  }

  const branchMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/branch$/);
  if (branchMatch && req.method === 'POST') {
    const chatId = branchMatch[1];
    const msgId = branchMatch[2];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const originalMsg = await db.first('SELECT id, parent_id FROM messages WHERE id = ? AND chat_id = ?', [msgId, chatId]);
    if (!originalMsg) return error(req, 'Message not found', 404);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }
    const content = String(body.content || '').trim();
    if (!content) return error(req, 'content is required', 400);
    const model = String(body.model || chat.model || defaultModel(env)).trim() || defaultModel(env);
    return handleLLMResponse(req, env, db, user, chatId, originalMsg.parent_id || null, content, model);
  }

  const regenerateMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/regenerate$/);
  if (regenerateMatch && req.method === 'POST') {
    const chatId = regenerateMatch[1];
    const msgId = regenerateMatch[2];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const assistantMsg = await db.first(
      'SELECT id, parent_id, created_at FROM messages WHERE id = ? AND chat_id = ? AND role = "assistant"',
      [msgId, chatId]
    );
    if (!assistantMsg) return error(req, 'Assistant message not found', 404);

    let parentUserMsg = null;
    if (assistantMsg.parent_id) {
      parentUserMsg = await db.first(
        'SELECT id, content, parent_id FROM messages WHERE id = ? AND chat_id = ?',
        [assistantMsg.parent_id, chatId]
      );
    }
    // Backward-compat fallback for older chats where assistant.parent_id is missing.
    if (!parentUserMsg) {
      parentUserMsg = await db.first(
        `SELECT id, content, parent_id
         FROM messages
         WHERE chat_id = ? AND role = 'user' AND created_at <= ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [chatId, assistantMsg.created_at]
      );
    }
    if (!parentUserMsg) return error(req, 'Parent user message not found', 404);

    const model = String(chat.model || defaultModel(env)).trim() || defaultModel(env);
    return handleRegenerateResponse(req, env, db, user, chatId, parentUserMsg, model);
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

    return handleLLMResponse(req, env, db, user, chatId, chat.current_message_id || null, content, model);
  }

  return null;
}
