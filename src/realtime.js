import { sseHeaders } from './utils/response.js';

const INTERNAL_REALTIME_ORIGIN = 'https://growchat-realtime.internal';
const MAX_SESSION_ID_LENGTH = 200;

function sanitizeSessionId(value) {
  return String(value || '')
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, MAX_SESSION_ID_LENGTH);
}

function getRealtimeStub(env, userId) {
  if (!env?.MESSAGE_QUEUE || !userId) return null;
  const objectId = env.MESSAGE_QUEUE.idFromName(`user:${userId}`);
  return env.MESSAGE_QUEUE.get(objectId);
}

export function getOriginSessionId(req) {
  return sanitizeSessionId(req.headers.get('x-client-session-id'));
}

export function createRealtimeEvent({ type, userId, chatId = null, messageId = null, originSessionId = '', data = null }) {
  return {
    type: String(type || '').trim(),
    user_id: String(userId || '').trim(),
    chat_id: chatId ? String(chatId) : null,
    message_id: messageId ? String(messageId) : null,
    origin_session_id: sanitizeSessionId(originSessionId),
    ts: Date.now(),
    data: data && typeof data === 'object' ? data : data ?? null,
  };
}

export async function connectRealtimeStream(req, env, userId) {
  const stub = getRealtimeStub(env, userId);
  if (!stub) {
    return new Response('Realtime binding missing', { status: 500 });
  }

  const upstream = await stub.fetch(`${INTERNAL_REALTIME_ORIGIN}/connect`, {
    method: 'GET',
    headers: {
      'x-client-session-id': getOriginSessionId(req) || crypto.randomUUID(),
    },
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: sseHeaders(req, Object.fromEntries(upstream.headers.entries())),
  });
}

export async function publishRealtimeEvent(env, event) {
  const normalized = createRealtimeEvent(event || {});
  if (!normalized.type || !normalized.user_id) return false;

  const stub = getRealtimeStub(env, normalized.user_id);
  if (!stub) return false;

  const response = await stub.fetch(`${INTERNAL_REALTIME_ORIGIN}/publish`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(normalized),
  });

  return response.ok;
}
