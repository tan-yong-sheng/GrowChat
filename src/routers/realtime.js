import { sseHeaders } from '../utils/response.js';

/**
 * Realtime placeholder endpoint
 * Supports both GET and POST to be tolerant with different frontend builds.
 */
export async function realtimeRouter(req, _env, _ctx, user, path) {
  if (path !== '/api/realtime/stream') return null;

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(':\n\n'));
      controller.close();
    },
  });

  return new Response(readable, { headers: sseHeaders(req) });
}
