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
  const normalizedAction = String(action || 'general')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-');
  const normalizedSubject = String(subject || 'anonymous')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-');
  return `${DEFAULT_KEY_PREFIX}:${normalizedAction}:${normalizedSubject}`;
}

function extractClientIp(req) {
  const headers = req && req.headers;
  if (!headers) return null;
  return (
    headers.get('CF-Connecting-IP') ||
    headers.get('x-forwarded-for') ||
    headers.get('x-real-ip') ||
    null
  );
}

export function resolveRateLimitSubject(req, fallback = 'anonymous') {
  // NOTE: In local development (wrangler dev), none of these headers are present.
  // All local requests will share the 'anonymous' fallback rate limit key.
  // This means rate limits apply globally across all local users during dev.
  // To test per-IP rate limiting locally, set CF-Connecting-IP header manually.
  const ip = extractClientIp(req);
  return String(ip || fallback).trim() || fallback;
}

function buildBypassResult({ action, subject, limit, windowSeconds, now }) {
  const maxRequests = normalizeLimit(limit);
  const windowSize = normalizeWindowSeconds(windowSeconds);
  return {
    allowed: true,
    remaining: maxRequests,
    resetAt: now + windowSize * 1000,
    key: buildRateLimitKey(action, subject),
  };
}

function isRateLimitDisabled(env) {
  const val = env && env.DISABLE_RATE_LIMIT;
  return val === 'true' || val === '1';
}

function resolveStore(env) {
  if (!env) return null;
  const store = env.CACHE || env;
  if (store.get && store.put) return store;
  return null;
}

export async function checkRateLimit(env, opts) {
  if (isRateLimitDisabled(env)) return buildBypassResult({ ...opts, now: opts.now || Date.now() });

  const store = resolveStore(env);
  if (!store) return buildBypassResult({ ...opts, now: opts.now || Date.now() });

  const { action, subject, limit, windowSeconds } = opts;
  const now = opts.now || Date.now();
  const maxRequests = normalizeLimit(limit);
  const windowSize = normalizeWindowSeconds(windowSeconds);
  const resetAt = now + windowSize * 1000;

  const key = buildRateLimitKey(action, subject);
  const raw = await store.get(key);
  const current = Number.parseInt(raw || '0', 10);
  const count = Number.isFinite(current) && current > 0 ? current : 0;

  // Increment and write. Only refresh the TTL when the request is allowed.
  // Denied requests leave the key untouched so the TTL naturally expires and
  // the client cannot keep the key alive indefinitely with a trickle of
  // denied requests.
  const nextCount = count + 1;

  if (nextCount > maxRequests) {
    await store.put(key, String(nextCount));
    return { allowed: false, remaining: 0, resetAt, key };
  }

  await store.put(key, String(nextCount), { expirationTtl: windowSize });
  return { allowed: true, remaining: Math.max(0, maxRequests - nextCount), resetAt, key };
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
  authForgotPassword: {
    limit: 5,
    windowSeconds: 3600,
  },
  authResetPassword: {
    limit: 5,
    windowSeconds: 3600,
  },
  authResendVerification: {
    limit: 5,
    windowSeconds: 3600,
  },
  fileUpload: {
    limit: APP_LIMITS.maxFileUploadPerHour,
    windowSeconds: 3600,
  },
  fileDownload: {
    limit: 100,
    windowSeconds: 3600,
  },
  fileList: {
    limit: 50,
    windowSeconds: 3600,
  },
  fileSearch: {
    limit: 100,
    windowSeconds: 3600,
  },
  chatSend: {
    limit: APP_LIMITS.maxChatSendPerMinute,
    windowSeconds: 60,
  },
};
