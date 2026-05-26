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
import { consumeModelsInvalidation } from '../shared/utils/model-sync.js';
import { filterEnabledModels, getPreferredModelId } from '../shared/utils/model-state.js';
import { getChatIdFromPath, injectTempChat, resolveActiveChatId } from './app-route-utils.js';
import {
  INITIAL_CHAT_LIMIT,
  FALLBACK_PERMISSIONS,
  normalizePublicRole,
  isKnownAutofillOverlayError,
  installKnownErrorSuppressors,
  isAccessTokenNearExpiry,
  ensureShortcuts,
  ensureRealtime,
  scheduleDeferredTask,
} from './session-helpers.js';

let bootstrapped = false;
let deferredBootstrapPromise = null;
let modelsPrefetchPromise = null;
let modelsInvalidationListenerBound = false;
let modelsCacheGeneration = 0;

function scheduleModelsPrefetch(options = {}) {
  const run = () => {
    prefetchModels(options);
  };

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => run(), { timeout: 1500 });
    return;
  }

  setTimeout(run, 0);
}

export function prefetchModels({ allowCache = true, cacheBust = null, force = false } = {}) {
  if (modelsPrefetchPromise && !force && !cacheBust) return modelsPrefetchPromise;
  if (!state.models?.length) {
    setState({ modelsLoading: true });
  }

  const requestGeneration = modelsCacheGeneration;
  const requestPromise = fetchModels({
    cache: 'no-store',
    cacheBust,
    scope: 'effective',
  })
    .then((data) => {
      if (requestGeneration !== modelsCacheGeneration) return data;
      const models = filterEnabledModels(Array.isArray(data?.models) ? data.models : []);
      const nextActiveModelId = getPreferredModelId(models, [
        state.activeModelId,
        state.defaultModelId,
        state.globalDefaultModelId,
      ]);
      setState({
        models,
        modelCatalogMeta: data?.visibility || null,
        modelsLoading: false,
        activeModelId: nextActiveModelId,
      });
      return data;
    })
    .catch((err) => {
      if (requestGeneration !== modelsCacheGeneration) return null;
      console.warn('Failed to prefetch models:', err);
      if (allowCache) {
        const cached = readModelsCache('effective');
        if (cached?.models?.length) {
          const models = filterEnabledModels(cached.models);
          const nextActiveModelId = getPreferredModelId(models, [
            state.activeModelId,
            state.defaultModelId,
            state.globalDefaultModelId,
          ]);
          setState({
            models,
            modelCatalogMeta: cached?.visibility || null,
            modelsLoading: false,
            activeModelId: nextActiveModelId,
          });
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
  setState({ models: [], modelCatalogMeta: null, modelsLoading: true });
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
    setState({ models: [], modelCatalogMeta: null, modelsLoading: true });
    prefetchModels({ allowCache: false, cacheBust: token, force: true });
  };
  window.addEventListener('storage', (event) => {
    if (event.key !== 'growchat_models_invalidate') return;
    handleInvalidation();
  });
  window.addEventListener('growchat:models-invalidated', handleInvalidation);
  modelsInvalidationListenerBound = true;
}

export function scheduleDeferredBootstrap(user, preloadedRBAC = null) {
  if (deferredBootstrapPromise) return deferredBootstrapPromise;

  deferredBootstrapPromise = new Promise((resolve) => {
    scheduleDeferredTask(() => {
      Promise.resolve()
        .then(() => initRBAC(user, preloadedRBAC))
        .then(() => {
          ensureRealtime();
        })
        .catch((err) => {
          console.warn('Deferred bootstrap failed:', err);
        })
        .finally(resolve);
    });
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

    const permissionsRequest =
      typeof fetchMyPermissions === 'function'
        ? Promise.resolve(fetchMyPermissions())
            .then(
              (value) =>
                value || {
                  permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member,
                }
            )
            .catch(() => ({
              permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member,
            }))
        : Promise.resolve({
            permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member,
          });
    const rolesRequest =
      typeof fetchMyRoles === 'function'
        ? Promise.resolve(fetchMyRoles())
            .then((value) => value || { roles: [{ role_name: roleName }] })
            .catch(() => ({ roles: [{ role_name: roleName }] }))
        : Promise.resolve({ roles: [{ role_name: roleName }] });

    const [permData, roleData] = await Promise.all([permissionsRequest, rolesRequest]);

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

  const refreshTokenValue = auth?.refresh_token || null;
  const shouldRefreshBeforeBootstrap =
    Boolean(refreshTokenValue) && (preferRefresh || isAccessTokenNearExpiry(auth.access_token));
  if (shouldRefreshBeforeBootstrap) {
    const refreshed = await refreshToken(refreshTokenValue);
    if (!refreshed?.access_token) {
      clearAuthState();
      window.location.href = '/auth.html';
      return false;
    }
  }

  let meRes = await apiFetch('/api/users/me');
  if (meRes.status === 401 && refreshTokenValue) {
    const refreshed = await refreshToken(refreshTokenValue);
    if (refreshed?.access_token) {
      meRes = await apiFetch('/api/users/me');
    }
  }
  if (!meRes.ok) {
    clearAuthState();
    window.location.href = '/auth.html';
    return false;
  }
  const meData = await meRes.json();
  const user = meData.user || {};

  const bootstrapRoleName = normalizePublicRole(user.primary_role);
  setState({
    permissions: FALLBACK_PERMISSIONS[bootstrapRoleName] || FALLBACK_PERMISSIONS.member,
    userRoles: [{ role_name: bootstrapRoleName }],
  });

  ensureShortcuts();
  bindModelsInvalidationListener();

  const path = window.location.pathname;
  const routeChatId = getChatIdFromPath(path);
  const urlParams = new URLSearchParams(window.location.search);
  const modelParam = urlParams.get('model');
  const isHomeRoute = path === '/' || path === '';

  const cachedChats = readChatsCache(user.id);
  const invalidateToken = checkModelsInvalidation();
  const isSettingsFirstRoute =
    path.startsWith('/admin/settings') || path.startsWith('/admin/system');
  const shouldBootstrapChats = !isSettingsFirstRoute;

  const cachedDefaultModelId = localStorage.getItem('defaultModelId');
  const serverDefaultModelId = user.preferences?.defaultModelId || null;
  const globalDefaultModelId = meData?.app_config?.default_model_id || null;
  const initialModelId = getPreferredModelId(
    [],
    [modelParam, serverDefaultModelId, globalDefaultModelId, cachedDefaultModelId]
  );

  if (shouldBootstrapChats) {
    const applyChatsState = (chatsData, { resetConversationState = false } = {}) => {
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
        ...(resetConversationState
          ? {
              messagesByChat: {},
              models: state.models || [],
              modelCatalogMeta: state.modelCatalogMeta || null,
              activeModelId: initialModelId,
              defaultModelId: serverDefaultModelId || null,
              globalDefaultModelId: globalDefaultModelId || null,
            }
          : {}),
      });
    };

    const hasCachedChats = cachedChats?.chats?.length;
    if (hasCachedChats) {
      applyChatsState(cachedChats, { resetConversationState: true });
      const refreshChats = () => {
        fetchChats({ limit: INITIAL_CHAT_LIMIT, offset: 0 })
          .then((fresh) => {
            writeChatsCache(user.id, fresh);
            applyChatsState(fresh);
          })
          .catch((err) => {
            console.warn('Failed to refresh chats:', err);
          });
      };
      setTimeout(refreshChats, 25000);
    } else {
      applyChatsState(
        {
          chats: [],
          limit: INITIAL_CHAT_LIMIT,
          offset: 0,
          has_more: false,
        },
        { resetConversationState: true }
      );
      fetchChats({ limit: INITIAL_CHAT_LIMIT, offset: 0 })
        .then((fresh) => {
          writeChatsCache(user.id, fresh);
          applyChatsState(fresh);
        })
        .catch((err) => {
          console.warn('Failed to fetch initial chats:', err);
        });
    }
  } else {
    setState({
      user,
      chats: [],
      chatsPagination: {
        limit: INITIAL_CHAT_LIMIT,
        offset: 0,
        hasMore: false,
        loading: false,
      },
      activeChatId: null,
      messagesByChat: {},
      models: state.models || [],
      modelCatalogMeta: state.modelCatalogMeta || null,
      activeModelId: initialModelId,
      defaultModelId: serverDefaultModelId || null,
      globalDefaultModelId: globalDefaultModelId || null,
    });
  }
  if (serverDefaultModelId && serverDefaultModelId !== cachedDefaultModelId) {
    localStorage.setItem('defaultModelId', serverDefaultModelId);
  }
  if (shouldBootstrapChats) {
    scheduleModelsPrefetch({
      allowCache: true,
      cacheBust: invalidateToken,
      force: true,
    });
  }

  bootstrapped = true;
  scheduleDeferredBootstrap(user);
  return true;
}
