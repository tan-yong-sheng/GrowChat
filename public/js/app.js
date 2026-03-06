import { apiFetch, clearAuthState, getAuthState } from './api.js';
import { renderChat } from './chat.js';
import { state, setState } from './store.js';
import { initShortcuts } from './shortcuts.js';

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

  // Initialize global shortcuts
  initShortcuts();

  const [chatsRes, modelsRes] = await Promise.all([
    apiFetch('/api/chats'),
    apiFetch('/api/models'),
  ]);

  if (!chatsRes.ok) {
    document.getElementById('app').innerHTML = '<div class="p-6 text-center mt-20 text-gray-500">Failed to load chats. Please refresh.</div>';
    return;
  }

  const chatsData = await chatsRes.json();
  let modelsData = { models: [] };
  if (modelsRes.ok) {
    modelsData = await modelsRes.json();
  }

  // Parse URL parameters for initial state
  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('q');
  const shouldSubmit = urlParams.get('submit') === 'true';
  const modelParam = urlParams.get('model');

  const defaultModelId = modelParam || 
                         chatsData.chats?.[0]?.model || 
                         modelsData.models?.[0]?.id || 
                         null;
  
  // Initialize global state
  setState({
    chats: chatsData.chats || [],
    activeChatId: chatsData.chats?.[0]?.id || null,
    messagesByChat: {},
    models: modelsData.models || [],
    activeModelId: defaultModelId,
  });

  renderChat(document.getElementById('app'));

  // Handle URL-driven prefill/submit
  if (q) {
    const input = document.getElementById('message-input');
    if (input) {
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (shouldSubmit) {
        document.getElementById('composer')?.dispatchEvent(new Event('submit', { bubbles: true }));
      }
    }
  }
}

bootstrap();
