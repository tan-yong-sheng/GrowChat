import { json } from '../../utils/response.js';
import { stripHtml } from '../../utils/sanitize.js';
import { createRealtimeEvent } from '../../features/realtime/realtime.js';
import { publishRealtimeNow } from '../chat-message-helpers.js';
import { requireOwnedChat } from '../chat-core.js';

export const MAX_TITLE_LENGTH = 200;
export const MAX_MODEL_ID_LENGTH = 200;

export function mapAuthCodeToStatus(code) {
  const map = { server_error: 500, unauthorized: 401, not_found: 404 };
  return map[code] || 403;
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

export async function reloadAndPublishChat(req, env, db, user, chatId, originSessionId) {
  const updatedOwned = await requireOwnedChat(req, db, chatId, user.sub);
  if (updatedOwned.error) return updatedOwned.error;
  const updated = updatedOwned.chat;
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