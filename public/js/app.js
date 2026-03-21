import { apiFetch, clearAuthState, fetchChats, fetchModels, fetchMyPermissions, fetchMyRoles, fetchPublicSharedChat, getAuthState, isAccessTokenUsable, readChatsCache, readModelsCache, refreshToken, writeChatsCache } from './api.js';
import { state, setState } from './store.js';
import { initShortcuts } from './shortcuts.js';
import { startRealtimeSync, stopRealtimeSync } from './realtime.js';
import { consumeModelsInvalidation } from './utils/model-sync.js';
import { getPreferredModelId } from './utils/model-state.js';
import {
  getChatIdFromPath,
  injectTempChat,
  resolveActiveChatId,
  shouldStartRealtime,
} from './app-route-utils.js';
import {
  renderAdminSkeleton,
  renderChatSkeleton,
  renderSharedChatPage,
} from './app-shells.js';

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

const AUTOFILL_OVERLAY_ERROR_MESSAGE = "Cannot read properties of null (reading 'includes')";
const AUTOFILL_OVERLAY_SOURCE = 'bootstrap-autofill-overlay.js';

let bootstrapped = false;
let shortcutsInitialized = false;
let realtimeStarted = false;
let deferredBootstrapPromise = null;
let modelsPrefetchPromise = null;
let modelsInvalidationListenerBound = false;
let modelsCacheGeneration = 0;

function isKnownAutofillOverlayError(error) {
  const message = String(error?.message || error?.reason?.message || error?.reason || '');
  const source = String(error?.filename || error?.sourceURL || error?.stack || '');
  return message.includes(AUTOFILL_OVERLAY_ERROR_MESSAGE) || source.includes(AUTOFILL_OVERLAY_SOURCE);
}

function installKnownErrorSuppressors() {
  const suppress = (event) => {
    if (!isKnownAutofillOverlayError(event)) return;
    event.preventDefault();
  };

  window.addEventListener('error', suppress);
  window.addEventListener('unhandledrejection', suppress);
}

function checkModelsInvalidation() {
  const token = consumeModelsInvalidation();
  if (!token) return null;
  modelsCacheGeneration += 1;
  modelsPrefetchPromise = null;
  setState({ models: [], modelsLoading: true });
  prefetchModels({ allowCache: false, cacheBust: token, force: true });
  return token;
}

function prefetchModels({ allowCache = true, cacheBust = null, force = false } = {}) {
  if (modelsPrefetchPromise && !force && !cacheBust && allowCache) return modelsPrefetchPromise;
  const cached = allowCache ? readModelsCache() : null;
  if (cached?.models?.length) {
    const nextActiveModelId = getPreferredModelId(cached.models, [
      state.activeModelId,
      state.defaultModelId,
      state.globalDefaultModelId,
    ]);
    setState({ models: cached.models, modelsLoading: false, activeModelId: nextActiveModelId });
    return Promise.resolve(cached);
  }

  if (!state.models?.length) {
    setState({ modelsLoading: true });
  }
  const cacheMode = allowCache ? 'default' : 'no-store';
  const requestGeneration = modelsCacheGeneration;
  const requestPromise = fetchModels({ cache: cacheMode, cacheBust })
    .then((data) => {
      if (requestGeneration !== modelsCacheGeneration) return data;
      const models = Array.isArray(data?.models) ? data.models : [];
      const nextActiveModelId = getPreferredModelId(models, [
        state.activeModelId,
        state.defaultModelId,
        state.globalDefaultModelId,
      ]);
      setState({ models, modelsLoading: false, activeModelId: nextActiveModelId });
      return data;
    })
    .catch((err) => {
      if (requestGeneration !== modelsCacheGeneration) return null;
      console.warn('Failed to prefetch models:', err);
      setState({ modelsLoading: false });
      return null;
    })
    .finally(() => {
      if (modelsPrefetchPromise === requestPromise) {
        modelsPrefetchPromise = null;
      }
    });
  modelsPrefetchPromise = requestPromise;
  return requestPromise;
}

function bindModelsInvalidationListener() {
  if (modelsInvalidationListenerBound) return;
  const handleInvalidation = () => {
    const token = consumeModelsInvalidation();
    if (!token) return;
    modelsCacheGeneration += 1;
    modelsPrefetchPromise = null;
    setState({ models: [], modelsLoading: true });
    prefetchModels({ allowCache: false, cacheBust: token, force: true });
  };
  window.addEventListener('storage', (event) => {
    if (event.key !== 'growchat_models_invalidate') return;
    handleInvalidation();
  });
  window.addEventListener('growchat:models-invalidated', handleInvalidation);
  modelsInvalidationListenerBound = true;
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

async function ensureSession() {
  if (bootstrapped) return true;

  const auth = getAuthState();
  if (!auth?.access_token || !isAccessTokenUsable(auth.access_token)) {
    if (auth?.refresh_token) {
      const refreshed = await refreshToken(auth.refresh_token);
      if (refreshed?.access_token) {
        return ensureSession();
      }
    }
    clearAuthState();
    window.location.href = '/auth.html';
    return false;
  }

  let meRes = await apiFetch('/api/users/me?include=permissions,roles');
  if (meRes.status === 401 && auth?.refresh_token) {
    const refreshed = await refreshToken(auth.refresh_token);
    if (refreshed?.access_token) {
      meRes = await apiFetch('/api/users/me?include=permissions,roles');
    }
  }
  if (!meRes.ok) {
    clearAuthState();
    window.location.href = '/auth.html';
    return false;
  }
  const meData = await meRes.json();
  const user = meData.user || {};

  ensureShortcuts();
  bindModelsInvalidationListener();

  const path = window.location.pathname;
  const routeChatId = getChatIdFromPath(path);
  const urlParams = new URLSearchParams(window.location.search);
  const modelParam = urlParams.get('model');
  const isHomeRoute = path === '/' || path === '';

  const cachedChats = readChatsCache(user.id);
  const invalidateToken = checkModelsInvalidation();
  const shouldInvalidateModels = Boolean(invalidateToken);
  const cachedModels = shouldInvalidateModels ? null : readModelsCache();
  const hasCachedModels = Array.isArray(cachedModels?.models) && cachedModels.models.length > 0;

  const cachedDefaultModelId = localStorage.getItem('defaultModelId');
  const serverDefaultModelId = user.preferences?.defaultModelId || null;
  const globalDefaultModelId = meData?.app_config?.default_model_id || null;
  const initialModelId = getPreferredModelId(cachedModels?.models || [], [
    modelParam,
    serverDefaultModelId,
    globalDefaultModelId,
    cachedDefaultModelId,
  ]);

  if (cachedChats?.chats?.length) {
    const cachedActiveChatId = resolveActiveChatId(routeChatId, cachedChats.chats, isHomeRoute);
    const nextCachedChats = injectTempChat(cachedChats.chats, routeChatId, initialModelId);

    setState({
      user,
      chats: nextCachedChats || [],
      chatsPagination: {
        limit: cachedChats.limit || INITIAL_CHAT_LIMIT,
        offset: cachedChats.offset || (cachedChats.chats?.length || 0),
        hasMore: cachedChats.has_more === true,
        loading: false,
      },
      activeChatId: cachedActiveChatId,
      messagesByChat: {},
      models: cachedModels?.models || [],
      modelsLoading: false,
      activeModelId: initialModelId,
      defaultModelId: serverDefaultModelId || null,
      globalDefaultModelId: globalDefaultModelId || null,
    });
  }

  let chatsData = cachedChats;
  const hasCachedChats = cachedChats?.chats?.length;
  if (!hasCachedChats) {
    try {
      chatsData = await fetchChats({ limit: INITIAL_CHAT_LIMIT, offset: 0 });
      writeChatsCache(user.id, chatsData);
    } catch {
      document.getElementById('app').innerHTML = '<div class="p-6 text-center mt-20 text-gray-500">Failed to load chats. Please refresh.</div>';
      return false;
    }
  } else {
    fetchChats({ limit: INITIAL_CHAT_LIMIT, offset: 0 })
      .then((fresh) => {
        writeChatsCache(user.id, fresh);
        const nextFreshChats = injectTempChat(fresh.chats || [], routeChatId, initialModelId);
        setState({
          chats: nextFreshChats,
          chatsPagination: {
            limit: fresh.limit || INITIAL_CHAT_LIMIT,
            offset: (fresh.offset || 0) + (fresh.chats?.length || 0),
            hasMore: fresh.has_more === true,
            loading: false,
          },
          activeChatId: resolveActiveChatId(routeChatId, fresh.chats, isHomeRoute),
        });
      })
      .catch((err) => {
        console.warn('Failed to refresh chats:', err);
      });
  }

  const nextChatsData = injectTempChat(chatsData.chats || [], routeChatId, initialModelId);
  setState({
    user,
    chats: nextChatsData,
    chatsPagination: {
      limit: chatsData.limit || INITIAL_CHAT_LIMIT,
      offset: (chatsData.offset || 0) + (chatsData.chats?.length || 0),
      hasMore: chatsData.has_more === true,
      loading: false,
    },
    activeChatId: resolveActiveChatId(routeChatId, chatsData.chats, isHomeRoute),
    messagesByChat: {},
    models: cachedModels?.models || state.models || [],
    activeModelId: initialModelId,
    defaultModelId: serverDefaultModelId || null,
    globalDefaultModelId: globalDefaultModelId || null,
  });
  if (serverDefaultModelId && serverDefaultModelId !== cachedDefaultModelId) {
    localStorage.setItem('defaultModelId', serverDefaultModelId);
  }
  if (!hasCachedModels || shouldInvalidateModels) {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 500));
    idle(() => {
      prefetchModels({ allowCache: !shouldInvalidateModels, cacheBust: invalidateToken });
    });
  }

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
    if (state.activeChatId !== routeChatId) {
      setState({ activeChatId: routeChatId });
    }
  }

  if (path.startsWith('/admin')) {
    await renderAdminRoute(app);
    return;
  }

  const invalidateModels = checkModelsInvalidation();
  if (invalidateModels) {
    setState({ models: [], modelsLoading: true });
    prefetchModels({ allowCache: false, cacheBust: invalidateModels });
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
  installKnownErrorSuppressors();
  await renderCurrentRoute();
}

bootstrap();
