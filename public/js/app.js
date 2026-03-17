import { apiFetch, clearAuthState, fetchChats, fetchModels, fetchMyPermissions, fetchMyRoles, fetchPublicSharedChat, getAuthState } from './api.js';
import { renderMessageContent } from './utils.js';
import { state, setState } from './store.js';
import { initShortcuts } from './shortcuts.js';
import { startRealtimeSync, stopRealtimeSync } from './realtime.js';

const INITIAL_CHAT_LIMIT = 30;

async function renderAdminRoute(container) {
  const { renderAdminPage } = await import('./admin.js');
  container.dataset.view = 'admin';
  return renderAdminPage(container);
}

let renderChatFn = null;
async function ensureRenderChat() {
  if (renderChatFn) return renderChatFn;
  const mod = await import('./chat.js');
  renderChatFn = mod.renderChat;
  return renderChatFn;
}

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

let bootstrapped = false;
let shortcutsInitialized = false;
let realtimeStarted = false;
let deferredBootstrapPromise = null;
let modelsPrefetchPromise = null;

function prefetchModels() {
  if (modelsPrefetchPromise) return modelsPrefetchPromise;
  setState({ modelsLoading: true });
  modelsPrefetchPromise = fetchModels()
    .then((data) => {
      const models = Array.isArray(data?.models) ? data.models : [];
      setState({ models, modelsLoading: false });
    })
    .catch((err) => {
      console.warn('Failed to prefetch models:', err);
      setState({ modelsLoading: false });
    });
  return modelsPrefetchPromise;
}

function shouldStartRealtime() {
  const url = new URL(window.location.href);
  const path = url.pathname || '/';
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLocal && url.searchParams.get('realtime') !== '1') return false;
  if (path.startsWith('/auth') || path.startsWith('/admin') || path.startsWith('/s/')) return false;
  return path === '/' || path.startsWith('/c/');
}

function ensureShortcuts() {
  if (shortcutsInitialized) return;
  initShortcuts();
  shortcutsInitialized = true;
}

function ensureRealtime() {
  if (!shouldStartRealtime()) return;
  if (realtimeStarted) return;
  startRealtimeSync({
    onEvent: (event) => {
      window.dispatchEvent(new CustomEvent('growchat:realtime', { detail: event }));
    },
  });
  window.addEventListener('beforeunload', stopRealtimeSync, { once: true });
  realtimeStarted = true;
}

function scheduleDeferredBootstrap(user, preloadedRBAC = null) {
  if (deferredBootstrapPromise) return deferredBootstrapPromise;

  deferredBootstrapPromise = (async () => {
    await Promise.resolve();

    await initRBAC(user, preloadedRBAC);
    ensureRealtime();

  })().catch((err) => {
    console.warn('Deferred bootstrap failed:', err);
  });

  return deferredBootstrapPromise;
}

async function initRBAC(user, preloaded = null) {
  setState({ rbacLoading: true });
  try {
    const hasPreloadedPermissions = Array.isArray(preloaded?.permissions);
    const hasPreloadedRoles = Array.isArray(preloaded?.roles);
    if (hasPreloadedPermissions || hasPreloadedRoles) {
      setState({
        permissions: hasPreloadedPermissions ? preloaded.permissions : [],
        userRoles: hasPreloadedRoles ? preloaded.roles : [],
        rbacLoading: false
      });
      return;
    }

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

function renderAdminSkeleton(container) {
  container.innerHTML = `
    <div class="min-h-screen bg-[#fafafa] text-gray-900">
      <div class="max-w-6xl mx-auto px-4 py-6">
        <div class="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <div class="bg-white border border-gray-100 rounded-2xl p-4 animate-pulse">
            <div class="h-4 w-28 bg-gray-200 rounded mb-4"></div>
            <div class="space-y-3">
              <div class="h-3 w-32 bg-gray-200 rounded"></div>
              <div class="h-3 w-36 bg-gray-200 rounded"></div>
              <div class="h-3 w-24 bg-gray-200 rounded"></div>
            </div>
            <div class="mt-6 h-3 w-20 bg-gray-200 rounded"></div>
          </div>
          <div class="bg-white border border-gray-100 rounded-2xl p-6 animate-pulse">
            <div class="h-5 w-44 bg-gray-200 rounded mb-4"></div>
            <div class="space-y-3">
              <div class="h-3 w-full bg-gray-200 rounded"></div>
              <div class="h-3 w-11/12 bg-gray-200 rounded"></div>
              <div class="h-3 w-10/12 bg-gray-200 rounded"></div>
            </div>
            <div class="mt-6 h-3 w-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderChatSkeleton(container) {
  container.innerHTML = `
    <div class="h-full w-full bg-white overflow-hidden">
      <div class="flex h-full">
        <aside class="hidden md:flex w-[260px] flex-shrink-0 border-r border-gray-100 bg-[#f9f9f9] p-4">
          <div class="w-full space-y-4 animate-pulse">
            <div class="h-6 w-32 bg-gray-200 rounded"></div>
            <div class="h-10 w-full bg-gray-200 rounded-xl"></div>
            <div class="h-10 w-full bg-gray-200 rounded-xl"></div>
            <div class="mt-6 space-y-2">
              <div class="h-3 w-20 bg-gray-200 rounded"></div>
              <div class="h-8 w-full bg-gray-200 rounded-lg"></div>
              <div class="h-8 w-full bg-gray-200 rounded-lg"></div>
              <div class="h-8 w-full bg-gray-200 rounded-lg"></div>
            </div>
          </div>
        </aside>
        <main class="flex-1 flex flex-col min-w-0">
          <div class="h-[58px] border-b border-gray-100 bg-white/95 flex items-center px-4">
            <div class="h-6 w-40 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div class="flex-1 p-6">
            <div class="max-w-3xl space-y-4 animate-pulse">
              <div class="h-4 w-64 bg-gray-200 rounded"></div>
              <div class="h-24 w-full bg-gray-200 rounded-2xl"></div>
              <div class="h-24 w-11/12 bg-gray-200 rounded-2xl"></div>
              <div class="h-24 w-10/12 bg-gray-200 rounded-2xl"></div>
            </div>
          </div>
        </main>
      </div>
    </div>
  `;
}

function getChatIdFromPath(pathname) {
  const match = pathname.match(/^\/c\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureSession() {
  if (bootstrapped) return true;

  const auth = getAuthState();
  if (!auth?.access_token) {
    window.location.href = '/auth.html';
    return false;
  }

  const meRes = await apiFetch('/api/users/me?include=permissions,roles');
  if (!meRes.ok) {
    clearAuthState();
    window.location.href = '/auth.html';
    return false;
  }
  const meData = await meRes.json();
  const user = meData.user || {};

  ensureShortcuts();

  let chatsData;
  try {
    chatsData = await fetchChats({ limit: INITIAL_CHAT_LIMIT, offset: 0 });
  } catch {
    document.getElementById('app').innerHTML = '<div class="p-6 text-center mt-20 text-gray-500">Failed to load chats. Please refresh.</div>';
    return false;
  }

  const path = window.location.pathname;
  const routeChatId = getChatIdFromPath(path);
  const urlParams = new URLSearchParams(window.location.search);
  const modelParam = urlParams.get('model');
  const isHomeRoute = path === '/' || path === '';

  const cachedDefaultModelId = localStorage.getItem('defaultModelId');
  const serverDefaultModelId = user.preferences?.defaultModelId || null;
  const globalDefaultModelId = meData?.app_config?.default_model_id || null;
  const initialModelId = modelParam ||
    serverDefaultModelId ||
    globalDefaultModelId ||
    cachedDefaultModelId ||
    chatsData.chats?.[0]?.model ||
    null;

  setState({
    user,
    chats: chatsData.chats || [],
    chatsPagination: {
      limit: chatsData.limit || INITIAL_CHAT_LIMIT,
      offset: (chatsData.offset || 0) + (chatsData.chats?.length || 0),
      hasMore: chatsData.has_more === true,
      loading: false,
    },
    activeChatId: (routeChatId && chatsData.chats?.some((chat) => chat.id === routeChatId))
      ? routeChatId
      : (isHomeRoute ? null : (chatsData.chats?.[0]?.id || null)),
    messagesByChat: {},
    models: [],
    activeModelId: initialModelId,
    defaultModelId: serverDefaultModelId || null,
    globalDefaultModelId: globalDefaultModelId || null,
  });
  if (serverDefaultModelId && serverDefaultModelId !== cachedDefaultModelId) {
    localStorage.setItem('defaultModelId', serverDefaultModelId);
  }
  prefetchModels();

  bootstrapped = true;
  scheduleDeferredBootstrap(user, { permissions: meData.permissions, roles: meData.roles });
  return true;
}

export async function renderCurrentRoute() {
  const path = window.location.pathname;
  const app = document.getElementById('app');
  const sharedMatch = path.match(/^\/s\/([^/]+)$/);
  const routeChatId = getChatIdFromPath(path);

  if (sharedMatch) {
    try {
      const data = await fetchPublicSharedChat(sharedMatch[1]);
      renderSharedChatPage(app, data);
    } catch {
      app.innerHTML = '<div class="p-8 text-center text-gray-500">Shared chat not found.</div>';
    }
    return;
  }

  if (!path.startsWith('/admin') && !sharedMatch && (!bootstrapped || app.dataset.view === 'admin')) {
    renderChatSkeleton(app);
  }

  const ok = await ensureSession();
  if (!ok) return;

  if (routeChatId) {
    const exists = state.chats.some((chat) => chat.id === routeChatId);
    if (exists && state.activeChatId !== routeChatId) {
      setState({ activeChatId: routeChatId });
    }
  }

  if (path.startsWith('/admin')) {
    await renderAdminRoute(app);
    return;
  }

  const renderChat = await ensureRenderChat();
  renderChat(app);
  app.dataset.view = 'chat';

  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('q');
  const shouldSubmit = urlParams.get('submit') === 'true';
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

async function bootstrap() {
  await renderCurrentRoute();
}

bootstrap();
