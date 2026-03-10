import { apiFetch, clearAuthState, fetchMyPermissions, fetchMyRoles, fetchPublicSharedChat, getAuthState } from './api.js';
import { renderAdminPage } from './admin.js';
import { renderChat } from './chat.js';
import { renderMessageContent } from './utils.js';
import { state, setState } from './store.js';
import { initShortcuts } from './shortcuts.js';
import { startRealtimeSync, stopRealtimeSync } from './realtime.js';

const FALLBACK_PERMISSIONS = {
  admin: [
    'chat.read', 'chat.write', 'chat.delete', 'chat.share',
    'model.use', 'model.admin', 'kb.read', 'kb.write', 'kb.reindex',
    'file.upload', 'file.delete', 'admin.user.read', 'admin.user.write',
    'admin.audit.read', 'admin.rbac.admin'
  ],
  user: [
    'chat.read', 'chat.write', 'chat.delete', 'chat.share',
    'model.use', 'kb.read', 'kb.write', 'file.upload', 'file.delete'
  ],
  inactive: []
};

async function initRBAC(user) {
  setState({ rbacLoading: true });
  try {
    const [permData, roleData] = await Promise.all([
      fetchMyPermissions().catch(() => ({ permissions: FALLBACK_PERMISSIONS[user.role] || FALLBACK_PERMISSIONS.user })),
      fetchMyRoles().catch(() => ({ roles: [{ role_name: user.role }] }))
    ]);

    setState({
      permissions: permData.permissions || [],
      userRoles: roleData.roles || [],
      rbacLoading: false
    });
  } catch (err) {
    console.warn('RBAC initialization fallback:', err);
    setState({
      permissions: FALLBACK_PERMISSIONS[user.role] || FALLBACK_PERMISSIONS.user,
      userRoles: [{ role_name: user.role }],
      rbacLoading: false
    });
  }
}

function renderSharedChatPage(container, data) {
  const chat = data?.chat || {};
  const messages = data?.messages || [];
  container.innerHTML = `
    <div class="min-h-screen bg-[#fafafa] text-gray-900">
      <div class="max-w-3xl mx-auto px-4 py-6">
        <div class="flex items-center justify-between mb-6">
          <a href="/" class="text-sm text-gray-600 hover:text-gray-800">← GrowChat</a>
          <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">Shared Chat</span>
        </div>
        <h1 class="text-2xl font-semibold mb-1">${chat.title || 'Shared Chat'}</h1>
        <p class="text-sm text-gray-500 mb-6">Read-only view</p>
        <div class="space-y-5">
          ${messages.map((m) => `
            <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="${m.role === 'user' ? 'bg-[#f0f0f0]' : 'bg-white border border-gray-200'} rounded-2xl px-4 py-3 max-w-[85%]">
                <p class="text-xs uppercase text-gray-400 mb-1">${m.role}</p>
                <div class="prose prose-sm max-w-none break-words">${renderMessageContent(m.content)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function getChatIdFromPath(pathname) {
  const match = pathname.match(/^\/c\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function bootstrap() {
  const path = window.location.pathname;
  const sharedMatch = path.match(/^\/s\/([^/]+)$/);
  const routeChatId = getChatIdFromPath(path);
  if (sharedMatch) {
    try {
      const data = await fetchPublicSharedChat(sharedMatch[1]);
      renderSharedChatPage(document.getElementById('app'), data);
    } catch {
      document.getElementById('app').innerHTML = '<div class="p-8 text-center text-gray-500">Shared chat not found.</div>';
    }
    return;
  }

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
  const meData = await meRes.json();
  const user = meData.user || {};

  await initRBAC(user);

  startRealtimeSync({
    onEvent: (event) => {
      window.dispatchEvent(new CustomEvent('growchat:realtime', { detail: event }));
    },
  });
  window.addEventListener('beforeunload', stopRealtimeSync, { once: true });

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

  const initialModelId = modelParam || 
                         user.preferences?.defaultModelId ||
                         localStorage.getItem('defaultModelId') ||
                         chatsData.chats?.[0]?.model || 
                         modelsData.models?.[0]?.id || 
                         null;
  
  // Initialize global state
  setState({
    user,
    chats: chatsData.chats || [],
    activeChatId: (routeChatId && chatsData.chats?.some((chat) => chat.id === routeChatId))
      ? routeChatId
      : (chatsData.chats?.[0]?.id || null),
    messagesByChat: {},
    models: modelsData.models || [],
    activeModelId: initialModelId,
    defaultModelId: user.preferences?.defaultModelId || localStorage.getItem('defaultModelId'),
  });

  if (path.startsWith('/admin')) {
    renderAdminPage(document.getElementById('app'));
  } else {
    renderChat(document.getElementById('app'));
  }

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
