export function getChatIdFromPath(pathname) {
  const match = String(pathname || '').match(/^\/c\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function isTempChatId(id) {
  return String(id || '').startsWith('temp-');
}

export function buildTempChatStub(id, modelId = null) {
  const nowTs = Math.floor(Date.now() / 1000);
  return {
    id,
    title: 'New Chat',
    model: modelId || null,
    pinned: 0,
    tags: '[]',
    created_at: nowTs,
    updated_at: nowTs,
  };
}

export function injectTempChat(chats, routeChatId, modelId = null) {
  if (!routeChatId || !isTempChatId(routeChatId)) return chats;
  const exists = (chats || []).some((chat) => String(chat?.id) === String(routeChatId));
  if (exists) return chats;
  const tempChat = buildTempChatStub(routeChatId, modelId);
  return [tempChat, ...(chats || [])];
}

export function resolveActiveChatId(routeChatId, chats, isHomeRoute) {
  if (routeChatId) return routeChatId;
  if (isHomeRoute) return null;
  return chats?.[0]?.id || null;
}

export function shouldStartRealtime(url = new URL(window.location.href)) {
  const path = url.pathname || '/';
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLocal && url.searchParams.get('realtime') !== '1') return false;
  if (path.startsWith('/auth') || path.startsWith('/admin') || path.startsWith('/s/')) return false;
  return path === '/' || path.startsWith('/c/');
}
