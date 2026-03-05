import { apiFetch, clearAuthState, getAuthState } from './api.js';
import { renderChat } from './chat.js';

async function bootstrap() {
  const auth = getAuthState();
  if (!auth?.access_token) {
    window.location.href = '/auth.html';
    return;
  }

  const meRes = await apiFetch('/api/users/me');
  if (!meRes.ok) {
    clearAuthState();
    window.location.href = '/auth.html';
    return;
  }

  const chatsRes = await apiFetch('/api/chats');
  if (!chatsRes.ok) {
    document.getElementById('app').innerHTML = '<div class="p-6">Failed to load chats.</div>';
    return;
  }

  const chatsData = await chatsRes.json();
  const state = {
    chats: chatsData.chats || [],
    activeChatId: chatsData.chats?.[0]?.id || null,
    messagesByChat: {},
  };

  renderChat(document.getElementById('app'), state);
}

bootstrap();
