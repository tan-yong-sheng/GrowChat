import { clearModelsCache } from '../api.js';

const MODEL_INVALIDATE_KEY = 'growchat_models_invalidate';
const MODEL_INVALIDATE_SEEN_KEY = 'growchat_models_invalidate_seen';

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

export function broadcastModelsInvalidation(token = String(Date.now())) {
  clearModelsCache();

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(MODEL_INVALIDATE_KEY, token);
    } catch {
      // ignore storage errors
    }
  }

  try {
    const evt =
      typeof CustomEvent === 'function'
        ? new CustomEvent('growchat:models-invalidated', { detail: { token } })
        : null;
    if (evt && globalThis.dispatchEvent) {
      globalThis.dispatchEvent(evt);
    }
  } catch {
    // ignore event dispatch errors
  }

  return token;
}

export function consumeModelsInvalidation() {
  const storage = getStorage();
  const session = getSessionStorage();
  if (!storage || !session) return null;

  try {
    const token = storage.getItem(MODEL_INVALIDATE_KEY);
    const seen = session.getItem(MODEL_INVALIDATE_SEEN_KEY);
    if (!token || token === seen) return null;
    clearModelsCache();
    session.setItem(MODEL_INVALIDATE_SEEN_KEY, token);
    return token;
  } catch {
    return null;
  }
}
