/**
 * Session Management Router
 * Handles session listing and revocation
 */

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
      const data = JSON.parse(metadata);
      sessions.push({
        id: sessionId,
        device: data.device || 'Unknown',
        ip: data.ip || 'Unknown',
        lastActive: data.lastActive,
      });
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

  const session = JSON.parse(sessionData);

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
    userId,
    ...metadata,
    lastActive: Math.floor(Date.now() / 1000),
  };
  await kv.put(key, JSON.stringify(data));
}

export default {
  getSessions,
  revokeSession,
  storeSessionMetadata,
};
