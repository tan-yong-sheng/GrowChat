const TOOL_SERVER_INVALIDATE_KEY = 'growchat_tool_servers_invalidate';
const TOOL_SERVER_INVALIDATE_SEEN_KEY = 'growchat_tool_servers_invalidate_seen';

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

export function broadcastToolServersInvalidation(token = String(Date.now())) {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(TOOL_SERVER_INVALIDATE_KEY, token);
    } catch {
      // ignore storage errors
    }
  }

  try {
    const evt = typeof CustomEvent === 'function'
      ? new CustomEvent('growchat:tool-servers-invalidated', { detail: { token } })
      : null;
    if (evt && globalThis.dispatchEvent) {
      globalThis.dispatchEvent(evt);
    }
  } catch {
    // ignore event dispatch errors
  }

  return token;
}

export function consumeToolServersInvalidation() {
  const storage = getStorage();
  const session = getSessionStorage();
  if (!storage || !session) return null;

  try {
    const token = storage.getItem(TOOL_SERVER_INVALIDATE_KEY);
    const seen = session.getItem(TOOL_SERVER_INVALIDATE_SEEN_KEY);
    if (!token || token === seen) return null;
    session.setItem(TOOL_SERVER_INVALIDATE_SEEN_KEY, token);
    return token;
  } catch {
    return null;
  }
}
