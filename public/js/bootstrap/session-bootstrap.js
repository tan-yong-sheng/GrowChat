import {
  apiFetch,
  clearAuthState,
  fetchChats,
  fetchModels,
  fetchMyPermissions,
  fetchMyRoles,
  getAuthState,
  isAccessTokenUsable,
  readChatsCache,
  readModelsCache,
  refreshToken,
  writeChatsCache,
} from '../shared/api.js';
import { state, setState } from '../shared/store.js';
import { initShortcuts } from '../shared/shortcuts.js';
import { startRealtimeSync, stopRealtimeSync } from '../shared/realtime.js';
import { consumeModelsInvalidation } from '../shared/utils/model-sync.js';
import { getPreferredModelId } from '../shared/utils/model-state.js';
import { getChatIdFromPath, injectTempChat, resolveActiveChatId, shouldStartRealtime } from './app-route-utils.js';

export const INITIAL_CHAT_LIMIT = 30;

const FALLBACK_PERMISSIONS = {
  admin: [
    'chat.read', 'chat.write', 'chat.delete', 'chat.share',
    'model.use', 'model.admin',
    'file.upload', 'file.delete', 'admin.user.read', 'admin.user.write',
    'admin.audit.read', 'admin.rbac.admin',
  ],
  member: [
    'chat.read', 'chat.write',
    'model.use', 'file.upload',
  ],
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

function normalizePublicRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return value === 'admin' ? 'admin' : 'member';
}

function isKnownAutofillOverlayError(error) {
  const message = String(error?.message || error?.reason?.message || error?.reason || '');
  const source = String(error?.filename || error?.sourceURL || error?.stack || '');
  return message.includes(AUTOFILL_OVERLAY_ERROR_MESSAGE) || source.includes(AUTOFILL_OVERLAY_SOURCE);
}

export function installKnownErrorSuppressors() {
  const suppress = (event) => {
    if (!isKnownAutofillOverlayError(event)) return;
    event.preventDefault();
  };

  window.addEventListener('error', suppress);
  window.addEventListener('unhandledrejection', suppress);
}

function isAccessTokenNearExpiry(token, thresholdSeconds = 300) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return true;
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    const decoded = JSON.parse(atob(padded));
    const exp = Number(decoded?.exp || 0);
    if (!Number.isFinite(exp)) return true;
    return exp <= Math.floor(Date.now() / 1000) + thresholdSeconds;
  } catch {
    return true;
  }
}

export function prefetchModels({ allowCache = true, cacheBust = null, force = false } = {}) {
  if (modelsPrefetchPromise && !force && !cacheBust) return modelsPrefetchPromise;
  if (!state.models?.length) {
    setState({ modelsLoading: true });
  }

  const requestGeneration = modelsCacheGeneration;
  const requestPromise = fetchModels({ cache: 'no-store', cacheBust })
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
      if (allowCache) {
        const cached = readModelsCache();
        if (cached?.models?.length) {
          const nextActiveModelId = getPreferredModelId(cached.models, [
            state.activeModelId,
            state.defaultModelId,
            state.globalDefaultModelId,
          ]);
          setState({ models: cached.models, modelsLoading: false, activeModelId: nextActiveModelId });
          return cached;
        }
      }
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

export function checkModelsInvalidation() {
  const token = consumeModelsInvalidation();
  if (!token) return null;
  modelsCacheGeneration += 1;
  modelsPrefetchPromise = null;
  setState({ models: [], modelsLoading: true });
  prefetchModels({ allowCache: false, cacheBust: token, force: true });
  return token;
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

export function ensureShortcuts() {
  if (shortcutsInitialized) return;
  initShortcuts();
  shortcutsInitialized = true;
}

export function ensureRealtime() {
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

export function scheduleDeferredBootstrap(user, preloadedRBAC = null) {
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
    const roleName = normalizePublicRole(user.primary_role);
    const hasPreloadedPermissions = Array.isArray(preloaded?.permissions);
    const hasPreloadedRoles = Array.isArray(preloaded?.roles);
    if (hasPreloadedPermissions || hasPreloadedRoles) {
      setState({
        permissions: hasPreloadedPermissions ? preloaded.permissions : [],
        userRoles: hasPreloadedRoles ? preloaded.roles : [],
        rbacLoading: false,
      });
      return;
    }

    const [permData, roleData] = await Promise.all([
      fetchMyPermissions().catch(() => ({ permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member })),
      fetchMyRoles().catch(() => ({ roles: [{ role_name: roleName }] })),
    ]);

    setState({
      permissions: permData.permissions || [],
      userRoles: roleData.roles || [],
      rbacLoading: false,
    });
  } catch (err) {
    console.warn('RBAC initialization fallback:', err);
    const roleName = normalizePublicRole(user.primary_role);
    setState({
      permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member,
      userRoles: [{ role_name: roleName }],
      rbacLoading: false,
    });
  }
}

export async function ensureSession({ preferRefresh = false } = {}) {
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

  let currentAuth = auth;
  const shouldRefreshBeforeBootstrap =
    Boolean(auth?.refresh_token) && (preferRefresh || isAccessTokenNearExpiry(auth.access_token));
  if (shouldRefreshBeforeBootstrap) {
    const refreshed = await refreshToken(auth.refresh_token);
    if (refreshed?.access_token) {
      currentAuth = refreshed;
    } else {
      clearAuthState();
      window.location.href = '/auth.html';
      return false;
    }
  }

  let meRes = await apiFetch('/api/users/me?include=permissions,roles');
  if (meRes.status === 401 && currentAuth?.refresh_token) {
    const refreshed = await refreshToken(currentAuth.refresh_token);
    if (refreshed?.access_token) {
      currentAuth = refreshed;
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

  const cachedDefaultModelId = localStorage.getItem('defaultModelId');
  const serverDefaultModelId = user.preferences?.defaultModelId || null;
  const globalDefaultModelId = meData?.app_config?.default_model_id || null;
  const initialModelId = getPreferredModelId([], [modelParam, serverDefaultModelId, globalDefaultModelId, cachedDefaultModelId]);

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
      models: [],
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
    models: state.models || [],
    activeModelId: initialModelId,
    defaultModelId: serverDefaultModelId || null,
    globalDefaultModelId: globalDefaultModelId || null,
  });
  if (serverDefaultModelId && serverDefaultModelId !== cachedDefaultModelId) {
    localStorage.setItem('defaultModelId', serverDefaultModelId);
  }
  prefetchModels({ allowCache: true, cacheBust: invalidateToken, force: true });

  bootstrapped = true;
  scheduleDeferredBootstrap(user, { permissions: meData.permissions, roles: meData.roles });
  return true;
}
