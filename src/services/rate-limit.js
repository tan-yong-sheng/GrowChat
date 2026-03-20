import { APP_LIMITS } from '../config/app.js';

const DEFAULT_KEY_PREFIX = 'rate-limit';

function normalizeWindowSeconds(windowSeconds) {
  const parsed = Number(windowSeconds);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60;
  }
  return Math.floor(parsed);
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.floor(parsed);
}

export function buildRateLimitKey(action, subject) {
  const normalizedAction = String(action || 'general').trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');
  const normalizedSubject = String(subject || 'anonymous').trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');
  return `${DEFAULT_KEY_PREFIX}:${normalizedAction}:${normalizedSubject}`;
}

export function resolveRateLimitSubject(req, fallback = 'anonymous') {
  const ip = req?.headers?.get?.('CF-Connecting-IP')
    || req?.headers?.get?.('x-forwarded-for')
    || req?.headers?.get?.('x-real-ip');
  return String(ip || fallback).trim() || fallback;
}

export async function checkRateLimit(store, {
  action,
  subject,
  limit,
  windowSeconds,
  now = Date.now(),
}) {
  const maxRequests = normalizeLimit(limit);
  const windowSize = normalizeWindowSeconds(windowSeconds);
  const resetAt = now + (windowSize * 1000);

  if (!store?.get || !store?.put) {
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt,
      key: buildRateLimitKey(action, subject),
    };
  }

  const key = buildRateLimitKey(action, subject);
  const raw = await store.get(key);
  const current = Number.parseInt(String(raw || '0'), 10);
  const count = Number.isFinite(current) && current > 0 ? current : 0;

  if (count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      key,
    };
  }

  await store.put(key, String(count + 1), { expirationTtl: windowSize });

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - count - 1),
    resetAt,
    key,
  };
}

export const RATE_LIMITS = {
  authRegister: {
    limit: APP_LIMITS.maxRegisterPerTenMinutes,
    windowSeconds: 600,
  },
  authLogin: {
    limit: APP_LIMITS.maxLoginPerTenMinutes,
    windowSeconds: 600,
  },
  fileUpload: {
    limit: APP_LIMITS.maxFileUploadPerHour,
    windowSeconds: 3600,
  },
  chatSend: {
    limit: APP_LIMITS.maxChatSendPerMinute,
    windowSeconds: 60,
  },
};
