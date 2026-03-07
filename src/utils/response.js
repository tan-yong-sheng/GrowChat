function originHeaders(req) {
  const origin = req.headers.get('Origin');
  if (!origin) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
  };
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

export function error(req, message, status = 500, details = undefined) {
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
