import { connectRealtimeStream } from '../features/realtime/realtime.js';

export async function realtimeRouter(req, env, _ctx, user, path) {
  if (path !== '/api/realtime/stream') return null;

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  return connectRealtimeStream(req, env, user.sub);
}
