const CONNECTION_INVALIDATE_KEY = 'growchat_connections_invalidate';
const CONNECTION_INVALIDATE_SEEN_KEY = 'growchat_connections_invalidate_seen';

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function getSessionStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

export function broadcastConnectionsInvalidation(token = String(Date.now())) {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(CONNECTION_INVALIDATE_KEY, token);
    } catch {
      // ignore storage errors
    }
  }

  try {
    const evt = typeof CustomEvent === 'function'
      ? new CustomEvent('growchat:connections-invalidated', { detail: { token } })
      : null;
    if (evt && globalThis.dispatchEvent) {
      globalThis.dispatchEvent(evt);
    }
  } catch {
    // ignore event dispatch errors
  }

  return token;
}

export function consumeConnectionsInvalidation() {
  const storage = getStorage();
  const session = getSessionStorage();
  if (!storage || !session) return null;

  try {
    const token = storage.getItem(CONNECTION_INVALIDATE_KEY);
    const seen = session.getItem(CONNECTION_INVALIDATE_SEEN_KEY);
    if (!token || token === seen) return null;
    session.setItem(CONNECTION_INVALIDATE_SEEN_KEY, token);
    return token;
  } catch {
    return null;
  }
}
