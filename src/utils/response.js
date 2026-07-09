import { isHttpError, toHttpErrorPayload } from '../errors/http-errors.js';
import { HTTP_STATUS } from '../shared/http-status.js';

// FNV-1a hash constants
const FNV_HASH = 2166136261;
const FNV_SHIFT_1 = 1;
const FNV_SHIFT_4 = 4;
const FNV_SHIFT_7 = 7;
const FNV_SHIFT_8 = 8;
const FNV_SHIFT_24 = 24;
const HEX_RADIX = 16;

function originHeaders(req) {
  const origin = req.headers.get('Origin');
  if (!origin) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  };
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'",
  };
}

function mergeVary(existing, next) {
  const parts = new Set();
  const add = (value) => {
    if (!value) return;
    String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => parts.add(item));
  };
  add(existing);
  add(next);
  if (!parts.size) return undefined;
  return Array.from(parts).join(', ');
}

function matchesIfNoneMatch(headerValue, etag) {
  if (!headerValue || !etag) return false;
  const values = String(headerValue)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.includes('*') || values.includes(etag);
}

export function createWeakEtag(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  let hash = FNV_HASH;
  for (let i = 0; i < source.length; i += FNV_SHIFT_1) {
    hash ^= source.charCodeAt(i);
    hash +=
      (hash << FNV_SHIFT_1) +
      (hash << FNV_SHIFT_4) +
      (hash << FNV_SHIFT_7) +
      (hash << FNV_SHIFT_8) +
      (hash << FNV_SHIFT_24);
  }
  const hex = (hash >>> 0).toString(HEX_RADIX);
  return `W/"${hex}"`;
}

function buildJsonBody(req, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...originHeaders(req),
      ...securityHeaders(),
      ...extraHeaders,
    },
  });
}

export function json(req, data, status = 200, headers = {}) {
  return buildJsonBody(req, data, status, headers);
}

function buildCachedResponseHeaders(req, options) {
  const { headers = {}, etag = null, cacheControl = null, vary = null } = options || {};

  const origin = originHeaders(req);
  const responseHeaders = {
    'Content-Type': 'application/json',
    ...origin,
    ...securityHeaders(),
    ...headers,
  };
  if (cacheControl) {
    responseHeaders['Cache-Control'] = cacheControl;
  }
  if (etag) {
    responseHeaders.ETag = etag;
  }
  const mergedVary = mergeVary(responseHeaders.Vary, vary);
  if (mergedVary) {
    responseHeaders.Vary = mergedVary;
  }
  return responseHeaders;
}

export function jsonCached(req, data, options = {}) {
  const { status = 200 } = options || {};
  const responseHeaders = buildCachedResponseHeaders(req, options);
  const etag = options.etag;

  const ifNoneMatch = etag ? req.headers.get('If-None-Match') : null;
  if (etag && matchesIfNoneMatch(ifNoneMatch, etag)) {
    const rest = Object.fromEntries(
      Object.entries(responseHeaders).filter(([key]) => key !== 'Content-Type')
    );
    return new Response(null, { status: 304, headers: rest });
  }

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

function isNotStackLine(line) {
  return !line.trim().startsWith('at ') && !/\.(js|ts|mjs|cjs|jsx|tsx|map):\d+/.test(line);
}

function sanitizeErrorMessage(message, status) {
  if (status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    return 'An error occurred. Please try again later.';
  }

  if (typeof message === 'string') {
    return message.split('\n').filter(isNotStackLine).join('\n').trim();
  }

  return String(message);
}

function sanitizeObjectEntry(value) {
  const cleaned = value.split('\n').filter(isNotStackLine).join('\n').trim();
  return cleaned || undefined;
}

function sanitizeObjectEntries(details) {
  const sanitized = {};
  for (const [key, value] of Object.entries(details)) {
    if (key === 'requestId') continue;
    if (typeof value === 'string') {
      const result = sanitizeObjectEntry(value);
      if (result) sanitized[key] = result;
    } else if (typeof value === 'object' && value !== null) {
      const nested = sanitizeErrorDetails(value);
      if (nested && Object.keys(nested).length) sanitized[key] = nested;
    } else {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length ? sanitized : undefined;
}

function sanitizeErrorDetails(details) {
  if (!details) return undefined;
  if (typeof details !== 'object') return details;
  if (Array.isArray(details))
    return details.map((item) => sanitizeErrorDetails(item)).filter(Boolean);
  return sanitizeObjectEntries(details);
}

export function getConnectionTestFailureMessage(status) {
  if (status === HTTP_STATUS.UNAUTHORIZED) return 'Authentication failed \u2014 check your API key';
  if (status === HTTP_STATUS.FORBIDDEN) return 'Access denied \u2014 check your permissions';
  if (status === HTTP_STATUS.NOT_FOUND)
    return 'Endpoint not found \u2014 check your connection URL';
  if (status != null && status >= HTTP_STATUS.INTERNAL_SERVER_ERROR)
    return 'Upstream server error \u2014 try again later';
  return 'Connection failed \u2014 check your settings and try again';
}

/**
 * Build an error Response from an authorization decision.
 * Maps known decision codes to HTTP status codes and falls back to 403.
 */
export function authError(req, decision, defaultMessage = 'Forbidden') {
  const statusCodeMap = {
    server_error: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    unauthorized: HTTP_STATUS.UNAUTHORIZED,
    not_found: HTTP_STATUS.NOT_FOUND,
  };
  return error(
    req,
    decision.reason || defaultMessage,
    statusCodeMap[decision.code] || HTTP_STATUS.FORBIDDEN
  );
}

export function error(req, message, status = 500, details = undefined) {
  if (isHttpError(message)) {
    const payload = toHttpErrorPayload(message);
    return buildJsonBody(req, payload.body, payload.status);
  }

  const sanitized = sanitizeErrorMessage(message, status);

  // Extract requestId from original details before sanitization
  const isPlainObj = details && typeof details === 'object' && !Array.isArray(details);
  const requestId = isPlainObj ? details.requestId : undefined;

  // Sanitize details (removes stack traces, strips requestId, and for 5xx returns undefined)
  const sanitizedDetails = sanitizeErrorDetails(details);

  return buildJsonBody(
    req,
    {
      error: sanitized,
      ...(requestId ? { requestId } : {}),
      ...(sanitizedDetails ? { details: sanitizedDetails } : {}),
    },
    status
  );
}

export function preflight(req) {
  return new Response(null, {
    status: 204,
    headers: {
      ...originHeaders(req),
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-CSRF-Token, x-client-session-id',
      'Access-Control-Max-Age': '86400',
      ...securityHeaders(),
    },
  });
}

export function sseHeaders(req, extra = {}) {
  return {
    ...originHeaders(req),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    ...extra,
  };
}

export function sseData(payload) {
  return `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;
}
