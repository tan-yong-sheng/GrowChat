/**
 * Chat Collection Router — Dispatcher
 *
 * Delegates to per-route handlers for chat collection operations.
 */
import { createDB } from '../db.js';
import { handleListChats, handleGetChat, handleCloneChat } from './chat-collection-ops.js';
import { handleCreateChat } from './chat/chat-collection-create.js';
import { handleListSharedChats } from './chat/chat-collection-shared-list.js';
import { handleListArchivedChats } from './chat/chat-collection-archived-list.js';
import { handleUpdateChat } from './chat/chat-collection-update.js';
import { handleDeleteChat } from './chat/chat-collection-delete.js';
import { handlePinChat } from './chat/chat-collection-pin.js';
import { handleShareChat } from './chat/chat-collection-share.js';
import { handleUnshareChat } from './chat/chat-collection-unshare.js';
import { handleArchiveChat } from './chat/chat-collection-archive.js';
import { publishRealtimeNow } from './chat-message-helpers.js';

const EXACT_ROUTES = [
  {
    method: 'GET',
    path: '/api/chats',
    handler: (c) => handleListChats(c.req, c.env, c.db, c.user),
  },
  {
    method: 'POST',
    path: '/api/chats',
    handler: (c) =>
      handleCreateChat({
        req: c.req,
        env: c.env,
        db: c.db,
        user: c.user,
        originSessionId: c.originSessionId,
      }),
  },
  {
    method: 'GET',
    path: '/api/chats/shared',
    handler: (c) => handleListSharedChats(c.req, c.env, c.db, c.user),
  },
  {
    method: 'GET',
    path: '/api/chats/archived',
    handler: (c) => handleListArchivedChats(c.req, c.env, c.db, c.user),
  },
];

const PATTERN_ROUTES = [
  {
    pattern: /^\/api\/chats\/([^/]+)$/,
    handlers: {
      GET: (c, chatId) => handleGetChat(c.req, c.env, c.db, c.user, chatId),
      PUT: (c, chatId) =>
        handleUpdateChat({
          req: c.req,
          env: c.env,
          db: c.db,
          user: c.user,
          chatId,
          originSessionId: c.originSessionId,
        }),
      DELETE: (c, chatId) =>
        handleDeleteChat({
          req: c.req,
          env: c.env,
          db: c.db,
          user: c.user,
          chatId,
          originSessionId: c.originSessionId,
        }),
    },
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/pin$/,
    handlers: {
      POST: (c, chatId) =>
        handlePinChat({
          req: c.req,
          env: c.env,
          db: c.db,
          user: c.user,
          chatId,
          originSessionId: c.originSessionId,
        }),
    },
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/clone$/,
    handlers: {
      POST: (c, chatId) =>
        handleCloneChat(c.req, c.env, c.db, c.user, chatId, c.originSessionId, publishRealtimeNow),
    },
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/share$/,
    handlers: {
      POST: (c, chatId) =>
        handleShareChat({
          req: c.req,
          env: c.env,
          db: c.db,
          user: c.user,
          chatId,
          originSessionId: c.originSessionId,
        }),
      DELETE: (c, chatId) =>
        handleUnshareChat({ req: c.req, env: c.env, db: c.db, user: c.user, chatId }),
    },
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/archive$/,
    handlers: {
      POST: (c, chatId) =>
        handleArchiveChat({
          req: c.req,
          env: c.env,
          db: c.db,
          user: c.user,
          chatId,
          originSessionId: c.originSessionId,
        }),
    },
  },
];

function resolveExactRoute(method, path) {
  for (const route of EXACT_ROUTES) {
    if (route.method === method && route.path === path) {
      return route.handler;
    }
  }
  return null;
}

function resolvePatternRoute(method, path) {
  for (const route of PATTERN_ROUTES) {
    const match = path.match(route.pattern);
    if (!match) continue;
    const handler = route.handlers[method];
    if (handler) return { handler, chatId: match[1] };
  }
  return null;
}

export async function chatCollectionRouter(
  req,
  env,
  user,
  path,
  originSessionId,
  db = createDB(env.DB)
) {
  const context = {
    req,
    env,
    db,
    user,
    path,
    originSessionId,
  };

  const exactHandler = resolveExactRoute(req.method, path);
  if (exactHandler) return exactHandler(context);

  const patternRoute = resolvePatternRoute(req.method, path);
  if (patternRoute) return patternRoute.handler(context, patternRoute.chatId);

  return null;
}
