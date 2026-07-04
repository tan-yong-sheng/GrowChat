import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { getConfigBool } from '../utils/app-config.js';

/**
 * Public routes handler for shared chats.
 * Routes: GET /s/:share_id - View a shared chat with messages (read-only, no auth required)
 */
export async function publicRouter(req, env, _ctx, _user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  if (path === '/api/health') {
    if (req.method !== 'GET') {
      return error(req, 'Method not allowed', 405);
    }

    let initialized = false;
    let publicRegistrationEnabled = true;
    if (env.DB) {
      try {
        const db = createDB(env.DB);
        const row = await db.first('SELECT COUNT(*) as count FROM users');
        initialized = Number(row?.count || 0) > 0;
        publicRegistrationEnabled = await getConfigBool(db, 'public_registration', true);
      } catch (err) {
        if (!/no such table:\s*users/i.test(String(err?.message || ''))) {
          logger.warn('Health check bootstrap probe failed', { error: err?.message || err });
        }
      }
    }

    return json(req, {
      ok: true,
      initialized,
      publicRegistrationEnabled,
      service: env.APP_NAME || 'GrowChat',
      timestamp: new Date().toISOString(),
      bindings: {
        db: !!env.DB,
        sessions: !!env.SESSIONS,
        realtime: !!env.MESSAGE_QUEUE,
      },
    });
  }

  const shareMatch = path.match(/^\/s\/([^/]+)$/);
  if (!shareMatch) return null;

  if (req.method !== 'GET') {
    return error(req, 'Method not allowed', 405);
  }

  const shareId = shareMatch[1];
  const url = new URL(req.url);
  const wantsJson = url.searchParams.get('format') === 'json';
  const accept = req.headers.get('Accept') || '';
  const wantsHtml = accept.includes('text/html');

  // Browser navigation should render SPA entry; JS app will fetch /s/:id?format=json.
  if (!wantsJson && wantsHtml && env.ASSETS) {
    const indexUrl = new URL('/index.html', req.url);
    return env.ASSETS.fetch(new Request(indexUrl.toString(), req));
  }

  try {
    const db = createDB(env.DB);

    // Look up chat by share_id (case-sensitive)
    const chat = await db.first(
      `SELECT
        id, user_id, title, model, pinned,
        created_at, updated_at
      FROM chats
      WHERE share_id = ?`,
      [shareId]
    );

    if (!chat) {
      return error(req, 'Shared chat not found', 404);
    }

    // Fetch messages for the shared chat (sanitized - no sensitive data)
    const messages = await db.all(
      `SELECT
        id, role, content, model, created_at
      FROM messages
      WHERE chat_id = ?
      ORDER BY created_at ASC`,
      [chat.id]
    );

    // Return sanitized chat metadata and messages
    // Note: Do NOT expose user_id or other sensitive data
    const publicChat = {
      id: chat.id,
      title: chat.title,
      model: chat.model,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
      message_count: messages.length,
    };

    return json(req, {
      chat: publicChat,
      messages: messages,
      shared: true,
    });
  } catch (err) {
    logger.error('Public share endpoint error', { error: err?.message || err });
    return error(req, 'Internal server error', 500);
  }
}
