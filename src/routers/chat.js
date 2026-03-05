import { createDB } from '../db.js';
import { error, json, sseData, sseHeaders } from '../utils/response.js';
import { SseLineParser, streamLLM } from '../llm.js';

const BUILTIN_DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

function defaultModel(env) {
  // Prefer the env-configured DEFAULT_MODEL (wrangler var) so operators
  // can switch the default without a code change. Fall back to the free
  // Workers AI model when the var is absent or empty.
  return (env.DEFAULT_MODEL && env.DEFAULT_MODEL.trim()) || BUILTIN_DEFAULT_MODEL;
}

function requireAuth(req, user) {
  if (!user) return error(req, 'Unauthorized', 401);
  return null;
}

async function getOwnedChat(db, chatId, userId) {
  return db.first('SELECT * FROM chats WHERE id = ? AND user_id = ?', [chatId, userId]);
}

export async function chatRouter(req, env, _ctx, user, path) {
  const unauthorized = requireAuth(req, user);
  if (unauthorized) return unauthorized;

  const db = createDB(env.DB);

  if (req.method === 'GET' && path === '/api/chats') {
    const chats = await db.all(
      'SELECT id, title, model, pinned, tags, created_at, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100',
      [user.sub]
    );

    return json(req, { chats });
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

  const chatIdMatch = path.match(/^\/api\/chats\/([^/]+)$/);
  if (chatIdMatch) {
    const chatId = chatIdMatch[1];

    if (req.method === 'GET') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      const messages = await db.all(
        'SELECT id, role, content, model, citations, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
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
      return json(req, { chat: updated });
    }

    if (req.method === 'DELETE') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      await db.run('DELETE FROM chats WHERE id = ? AND user_id = ?', [chatId, user.sub]);
      return json(req, { ok: true });
    }
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
    await db.run(
      'INSERT INTO messages (id, chat_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())',
      [userMsgId, chatId, 'user', content, model]
    );

    const history = await db.all(
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 30',
      [chatId]
    );

    let stream;
    try {
      stream = await streamLLM(env, model, history);
    } catch (err) {
      // LLM setup failed (missing key, bad model, network error) — return a
      // proper SSE error event instead of crashing the Worker with a 1101.
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
            await db.run(
              'INSERT INTO messages (id, chat_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())',
              [assistantMsgId, chatId, 'assistant', fullText, model]
            );
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

  return null;
}
