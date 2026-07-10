import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { authorize } from '../../utils/authorize.js';
import { stripHtml } from '../../utils/sanitize.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { requireOwnedChat } from '../chat-core.js';

export const MAX_TITLE_LENGTH = 200;
export const MAX_MODEL_ID_LENGTH = 200;

export function mapAuthCodeToStatus(code) {
  const map = {
    server_error: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    unauthorized: HTTP_STATUS.UNAUTHORIZED,
    not_found: HTTP_STATUS.NOT_FOUND,
  };
  return map[code] || HTTP_STATUS.FORBIDDEN;
}

/**
 * Combines requireChatAuth + requireOwnedChat into a single call,
 * deduplicating the pattern that appears in 5 chat-collection-* handlers.
 * Returns { denied, error, chat } — check denied for auth failure, error for ownership failure.
 */
// eslint-disable-next-line max-params -- Cloudflare Worker handler
export async function requireOwnedAndChatAuth(req, env, db, user, action, chatId) {
  const denied = await requireChatAuth(req, env, user, action, chatId);
  if (denied) return { denied, error: null, chat: null };
  const { error, chat } = await requireOwnedChat(req, db, chatId, user.sub);
  if (error) return { denied: null, error, chat: null };
  return { denied: null, error: null, chat };
}

// eslint-disable-next-line max-params -- Cloudflare Worker handler
export async function requireChatAuth(req, env, user, action, chatId) {
  const authDecision = await authorize(env, user, {
    action,
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }
  return null;
}

/**
 * Require list-level chat access (no specific resourceId needed)
 * Returns null on success or an error Response on denial.
 */
export async function requireChatListAuth(req, env, user, action) {
  const authDecision = await authorize(env, user, {
    action,
    resource: 'chat',
  });
  if (!authDecision.allow) {
    return error(req, authDecision.reason || 'Forbidden', mapAuthCodeToStatus(authDecision.code));
  }
  return null;
}

export function sanitizeTitle(raw) {
  if (typeof raw !== 'string') return 'New Chat';
  const stripped = stripHtml(raw.trim());
  if (!stripped) return 'New Chat';
  return stripped.slice(0, MAX_TITLE_LENGTH) || 'New Chat';
}

export function sanitizeModelId(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const lower = trimmed.toLowerCase();
  if (lower === 'null' || lower === 'undefined') return fallback;
  if (trimmed.length > MAX_MODEL_ID_LENGTH) return fallback;
  return trimmed;
}

export // eslint-disable-next-line max-params -- Cloudflare Worker handler
async function reloadAndPublishChat(req, env, db, user, chatId, originSessionId) {
  const { error: updatedOwnedErr, chat: updated } = await requireOwnedChat(
    req,
    db,
    chatId,
    user.sub
  );
  if (updatedOwnedErr) return updatedOwnedErr;
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
