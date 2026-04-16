/**
 * Session Management Router
 * Handles session listing and revocation
 */
import { error } from '../utils/response.js';

/**
 * Router for session management endpoints
 * @param {Request} req - Request object
 * @param {Object} env - Worker environment
 * @param {Object} _ctx - Execution context
 * @param {Object} user - Authenticated user
 * @param {string} path - Request path
 * @returns {Promise<Response|null>}
 */
export async function sessionManagementRouter(req, env, _ctx, user, path) {
  // Only handle /api/user/sessions paths
  if (!path.startsWith('/api/user/sessions')) return null;

  // Require authentication
  if (!user) return error(req, 'Unauthorized', 401);

  const kv = env.SESSIONS;
  if (!kv) {
    // For GET requests, return empty sessions
    // For DELETE requests, return error (cannot revoke without KV)
    if (req.method === 'GET') {
      return Response.json({ sessions: [] });
    }
    return Response.json({ error: 'Session storage unavailable' }, { status: 503 });
  }

  // GET /api/user/sessions - list all sessions
  if (req.method === 'GET' && path === '/api/user/sessions') {
    return getSessions({ userId: user.sub, kv });
  }

  // DELETE /api/user/sessions/:id - revoke a session
  if (req.method === 'DELETE') {
    const sessionId = path.replace('/api/user/sessions/', '').replace('/api/user/sessions', '');
    if (sessionId && sessionId !== path) {
      return revokeSession({ sessionId, userId: user.sub, kv });
    }
  }

  return null;
}

/**
 * Get all active sessions for a user
 * @param {Object} params - Request parameters
 * @param {string} params.userId - User ID
 * @param {KVNamespace} params.kv - KV namespace for sessions
 * @returns {Promise<Response>}
 */
export async function getSessions({ userId, kv }) {
  if (!kv) {
    return Response.json({ sessions: [] });
  }

  // List all sessions for this user
  const prefix = `session:${userId}:`;
  const { keys } = await kv.list({ prefix });

  const sessions = [];
  for (const key of keys) {
    const sessionId = key.name.replace(prefix, '');
    const metadata = await kv.get(key.name);
    if (metadata) {
      try {
        const data = JSON.parse(metadata);
        sessions.push({
          id: sessionId,
          device: data.device || 'Unknown',
          ip: data.ip || 'Unknown',
          lastActive: data.lastActive,
        });
      } catch (e) {
        // Skip corrupted session metadata
        console.warn(`Corrupted session metadata for ${sessionId}:`, e.message);
      }
    }
  }

  // Sort by last active (most recent first)
  sessions.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));

  return Response.json({ sessions });
}

/**
 * Revoke a specific session
 * @param {Object} params - Request parameters
 * @param {string} params.sessionId - Session ID to revoke
 * @param {string} params.userId - User ID
 * @param {KVNamespace} params.kv - KV namespace for sessions
 * @returns {Promise<Response>}
 */
export async function revokeSession({ sessionId, userId, kv }) {
  if (!sessionId) {
    return Response.json({ error: 'Session ID is required' }, { status: 400 });
  }

  const key = `session:${userId}:${sessionId}`;
  const sessionData = await kv.get(key);
  if (!sessionData) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  let session;
  try {
    session = JSON.parse(sessionData);
  } catch (e) {
    // Treat parse failure as corrupted data
    return Response.json({ error: 'Session data corrupted' }, { status: 410 });
  }

  // Check ownership
  if (session.userId !== userId) {
    return Response.json({ error: 'You can only revoke your own sessions' }, { status: 403 });
  }

  // Delete the session
  await kv.delete(key);
  return Response.json({ message: 'Session revoked successfully' });
}

/**
 * Store session metadata
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @param {Object} metadata - Session metadata
 * @param {KVNamespace} kv - KV namespace
 */
export async function storeSessionMetadata(userId, sessionId, metadata, kv) {
  const key = `session:${userId}:${sessionId}`;
  const data = {
    ...metadata,
    userId,
    lastActive: Math.floor(Date.now() / 1000),
  };
  await kv.put(key, JSON.stringify(data));
}

export default {
  getSessions,
  revokeSession,
  storeSessionMetadata,
};
