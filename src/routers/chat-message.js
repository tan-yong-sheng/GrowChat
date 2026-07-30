/**
 * Chat Message Router — Dispatcher
 *
 * Delegates to per-route handlers for chat message operations.
 */
import { handleSendMessage } from './chat-message-send.js';
import { handleBranchMessage } from './chat-message-branch.js';
import { handleRegenerateMessage } from './chat/chat-message-regenerate.js';
import { handleCancelMessage } from './chat/chat-message-cancel.js';
import { handleResumeMessage } from './chat/chat-message-resume.js';
import { handleMessageStatus } from './chat/chat-message-status.js';
import { handleUpdateMessage } from './chat/chat-message-update.js';
import { handleDeleteMessage } from './chat/chat-message-delete.js';

const MESSAGE_ROUTES = [
  {
    pattern: /^\/api\/chats\/([^/]+)\/messages$/,
    method: 'POST',
    handler: handleSendMessage,
    params: ['chatId'],
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/branch$/,
    method: 'POST',
    handler: handleBranchMessage,
    params: ['chatId', 'msgId'],
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/regenerate$/,
    method: 'POST',
    handler: handleRegenerateMessage,
    params: ['chatId', 'msgId'],
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/cancel$/,
    method: 'POST',
    handler: handleCancelMessage,
    params: ['chatId', 'msgId'],
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/resume$/,
    method: 'GET',
    handler: handleResumeMessage,
    params: ['chatId', 'msgId'],
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/status$/,
    method: 'GET',
    handler: handleMessageStatus,
    params: ['chatId', 'msgId'],
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/,
    method: 'PUT',
    handler: handleUpdateMessage,
    params: ['chatId', 'msgId'],
  },
  {
    pattern: /^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/,
    method: 'DELETE',
    handler: handleDeleteMessage,
    params: ['chatId', 'msgId'],
  },
];

function resolveRoute(method, path) {
  for (const route of MESSAGE_ROUTES) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (!match) continue;
    const routeParams = {};
    for (let i = 0; i < route.params.length; i += 1) {
      routeParams[route.params[i]] = match[i + 1];
    }
    return { route, routeParams };
  }
  return null;
}

export async function chatMessageRouter({
  req,
  env,
  ctx,
  db,
  user,
  path,
  originSessionId,
  assistantStreamRunner,
  requestContext = {},
}) {
  const resolved = resolveRoute(req.method, path);
  if (!resolved) return null;

  const { route, routeParams } = resolved;
  const handlerContext = {
    req,
    env,
    ctx,
    db,
    user,
    path,
    originSessionId,
    assistantStreamRunner,
    requestContext,
    ...routeParams,
  };

  return route.handler(handlerContext);
}
