import { sseHeaders } from '../../utils/response.js';

const INTERNAL_REALTIME_ORIGIN = 'https://growchat-realtime.internal';
const MAX_SESSION_ID_LENGTH = 200;

function sanitizeSessionId(value) {
  return Array.from(String(value || '').trim())
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .slice(0, MAX_SESSION_ID_LENGTH);
}

function getRealtimeStub(env, userId) {
  if (!env?.MESSAGE_QUEUE || !userId) return null;
  const objectId = env.MESSAGE_QUEUE.idFromName(`user:${userId}`);
  return env.MESSAGE_QUEUE.get(objectId);
}

export function getOriginSessionId(req) {
  const url = new URL(req.url);
  return sanitizeSessionId(
    req.headers.get('x-client-session-id') || url.searchParams.get('client_session_id')
  );
}

export function createRealtimeEvent({
  type,
  userId,
  chatId = null,
  messageId = null,
  originSessionId = '',
  data = null,
}) {
  return {
    type: String(type || '').trim(),
    user_id: String(userId || '').trim(),
    chat_id: chatId ? String(chatId) : null,
    message_id: messageId ? String(messageId) : null,
    origin_session_id: sanitizeSessionId(originSessionId),
    ts: Date.now(),
    data: data && typeof data === 'object' ? data : (data ?? null),
  };
}

function pickTruthyString(input, keys) {
  for (const key of keys) {
    const value = input && input[key];
    if (value) return value;
  }
  return '';
}

function pickTrimmedString(input, keys) {
  return String(pickTruthyString(input, keys)).trim();
}

function pickOptionalString(input, keys) {
  const value = pickTruthyString(input, keys);
  return value ? String(value) : null;
}

function coerceDataValue(value) {
  if (value && typeof value === 'object') return value;
  return value ?? null;
}

function normalizeRealtimeEvent(event) {
  const input = event && typeof event === 'object' ? event : {};
  return {
    type: pickTrimmedString(input, ['type']),
    user_id: pickTrimmedString(input, ['user_id', 'userId']),
    chat_id: pickOptionalString(input, ['chat_id', 'chatId']),
    message_id: pickOptionalString(input, ['message_id', 'messageId']),
    origin_session_id: sanitizeSessionId(
      pickTruthyString(input, ['origin_session_id', 'originSessionId'])
    ),
    ts: Number(input.ts || Date.now()),
    data: coerceDataValue(input.data),
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
  const normalized = normalizeRealtimeEvent(event);
  if (!normalized.type || !normalized.user_id) return false;

  const stub = getRealtimeStub(env, normalized.user_id);
  if (!stub) return false;

  try {
    const response = await stub.fetch(`${INTERNAL_REALTIME_ORIGIN}/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(normalized),
    });

    return response.ok;
  } catch {
    return false;
  }
}
