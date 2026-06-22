const DEFAULT_MAX_ENTRIES = 48;
const defaultRevokeFn = (value) => URL.revokeObjectURL(value);

/**
 * Touch attachment cache - adds/updates entry and evicts oldest if needed
 * @param {Object} options
 * @param {Map} options.cache - The cache Map
 * @param {string} options.key - Cache key
 * @param {string} options.url - URL to cache
 * @param {number} [options.maxEntries=48] - Max entries before eviction
 * @param {Function} [options.revokeFn] - Function to revoke old URLs
 */
export function touchAttachmentCache({
  cache,
  key,
  url,
  maxEntries = DEFAULT_MAX_ENTRIES,
  revokeFn = defaultRevokeFn,
}) {
  if (!key || !cache) return;
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, url);
  if (cache.size <= maxEntries) return;
  const oldestEntry = cache.entries().next().value;
  if (!oldestEntry) return;
  const [oldestKey, oldestUrl] = oldestEntry;
  cache.delete(oldestKey);
  if (oldestUrl) {
    revokeFn(oldestUrl);
  }
}

export function clearAttachmentCache(
  cache,
  promiseCache,
  revokeFn = (value) => URL.revokeObjectURL(value)
) {
  if (cache) {
    cache.forEach((url) => {
      if (url) revokeFn(url);
    });
    cache.clear();
  }
  if (promiseCache) {
    promiseCache.clear();
  }
}

export function touchRecentChat(recentChatIds, chatId) {
  if (!chatId || !Array.isArray(recentChatIds)) return;
  const key = String(chatId);
  const existingIndex = recentChatIds.indexOf(key);
  if (existingIndex >= 0) {
    recentChatIds.splice(existingIndex, 1);
  }
  recentChatIds.unshift(key);
}

export function pruneCachedChats({ state, recentChatIds, maxCachedChats = 6 }) {
  const keep = new Set((recentChatIds || []).slice(0, maxCachedChats));
  const nextMessages = { ...(state?.messagesByChat || {}) };
  const nextAttachments = { ...(state?.attachmentsByChat || {}) };
  let changed = false;

  Object.keys(nextMessages).forEach((key) => {
    if (!keep.has(String(key))) {
      delete nextMessages[key];
      changed = true;
    }
  });

  Object.keys(nextAttachments).forEach((key) => {
    if (!keep.has(String(key))) {
      delete nextAttachments[key];
      changed = true;
    }
  });

  return {
    changed,
    messagesByChat: nextMessages,
    attachmentsByChat: nextAttachments,
  };
}

export function normalizeCitations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

export const isTempMessageId = (id) => String(id || '').startsWith('temp-');
