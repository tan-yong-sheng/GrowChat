export function touchAttachmentCache(
  cache,
  key,
  url,
  maxEntries = 48,
  revokeFn = (value) => URL.revokeObjectURL(value)
) {
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
