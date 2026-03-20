import { isHttpError, toHttpErrorPayload } from '../errors/http-errors.js';

function originHeaders(req) {
  const origin = req.headers.get('Origin');
  if (!origin) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
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
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const hex = (hash >>> 0).toString(16);
  return `W/\"${hex}\"`;
}

export function json(req, data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...originHeaders(req),
      ...headers,
    },
  });
}

export function jsonCached(req, data, options = {}) {
  const {
    status = 200,
    headers = {},
    etag = null,
    cacheControl = null,
    vary = null,
  } = options || {};

  const origin = originHeaders(req);
  const responseHeaders = {
    'Content-Type': 'application/json',
    ...origin,
    ...headers,
  };
  if (cacheControl) responseHeaders['Cache-Control'] = cacheControl;
  if (etag) responseHeaders.ETag = etag;
  const mergedVary = mergeVary(responseHeaders.Vary, vary);
  if (mergedVary) responseHeaders.Vary = mergedVary;

  const ifNoneMatch = etag ? req.headers.get('If-None-Match') : null;
  if (etag && matchesIfNoneMatch(ifNoneMatch, etag)) {
    const { ['Content-Type']: _ignored, ...rest } = responseHeaders;
    return new Response(null, { status: 304, headers: rest });
  }

  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function error(req, message, status = 500, details = undefined) {
  if (isHttpError(message)) {
    const payload = toHttpErrorPayload(message);
    return json(req, payload.body, payload.status);
  }
  return json(req, { error: message, ...(details ? { details } : {}) }, status);
}

export function preflight(req) {
  return new Response(null, {
    status: 204,
    headers: {
      ...originHeaders(req),
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-session-id',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export function sseHeaders(req, extra = {}) {
  return {
    ...originHeaders(req),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    ...extra,
  };
}

export function sseData(payload) {
  return `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;
}
