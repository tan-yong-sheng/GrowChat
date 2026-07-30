import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { getConfigBool } from '../utils/app-config.js';

function resolveEmailConfigured(env) {
  const emailProvider = (env.EMAIL_PROVIDER || 'resend').toLowerCase();
  return emailProvider === 'resend' ? !!env.RESEND_API_KEY : false;
}

async function readBootstrapState(db) {
  const row = await db.first('SELECT COUNT(*) as count FROM users');
  const initialized = Number(row && row.count) > 0;
  const publicRegistrationEnabled = await getConfigBool(db, 'public_registration', true);
  return { initialized, publicRegistrationEnabled };
}

function shouldIgnoreHealthProbeError(err) {
  return /no such table:\s*users/i.test(String(err && err.message));
}

async function probeHealthState(env, logger) {
  if (!env.DB) {
    return { initialized: false, publicRegistrationEnabled: true };
  }
  try {
    const db = createDB(env.DB);
    return await readBootstrapState(db);
  } catch (err) {
    if (!shouldIgnoreHealthProbeError(err)) {
      logger.warn('Health check bootstrap probe failed', { error: err?.message || err });
    }
  }
  return { initialized: false, publicRegistrationEnabled: true };
}

function buildHealthResponse(req, env, initialized, publicRegistrationEnabled) {
  return json(req, {
    ok: true,
    initialized,
    publicRegistrationEnabled,
    authConfigured: !!env.JWT_SECRET,
    emailConfigured: resolveEmailConfigured(env),
    service: env.APP_NAME || 'GrowChat',
    timestamp: new Date().toISOString(),
    bindings: {
      db: !!env.DB,
      sessions: !!env.SESSIONS,
      realtime: !!env.MESSAGE_QUEUE,
    },
  });
}

async function fetchSharedChat(db, shareId) {
  return db.first(
    `SELECT
      id, user_id, title, model, pinned,
      created_at, updated_at
    FROM chats
    WHERE share_id = ?`,
    [shareId]
  );
}

async function fetchSharedMessages(db, chatId) {
  return db.all(
    `SELECT
      id, role, content, model, created_at
    FROM messages
    WHERE chat_id = ?
    ORDER BY created_at ASC`,
    [chatId]
  );
}

function buildSharedChatResponse(req, chat, messages) {
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
}

function wantsSharedChatHtml(req, env) {
  const url = new URL(req.url);
  const wantsJson = url.searchParams.get('format') === 'json';
  const accept = req.headers.get('Accept') || '';
  const wantsHtml = accept.includes('text/html');
  return !wantsJson && wantsHtml && env.ASSETS;
}

async function handleSharedChatRoute(req, env, path) {
  const shareMatch = path.match(/^\/s\/([^/]+)$/);
  if (!shareMatch) return null;
  if (req.method !== 'GET') {
    return error(req, 'Method not allowed', 405);
  }
  if (wantsSharedChatHtml(req, env)) {
    const indexUrl = new URL('/index.html', req.url);
    return env.ASSETS.fetch(new Request(indexUrl.toString(), req));
  }

  const shareId = shareMatch[1];
  const db = createDB(env.DB);
  const chat = await fetchSharedChat(db, shareId);
  if (!chat) {
    return error(req, 'Shared chat not found', 404);
  }
  const messages = await fetchSharedMessages(db, chat.id);
  return buildSharedChatResponse(req, chat, messages);
}

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
    const { initialized, publicRegistrationEnabled } = await probeHealthState(env, logger);
    return buildHealthResponse(req, env, initialized, publicRegistrationEnabled);
  }

  try {
    return await handleSharedChatRoute(req, env, path);
  } catch (err) {
    logger.error('Public share endpoint error', { error: err?.message || err });
    return error(req, 'Internal server error', 500);
  }
}
