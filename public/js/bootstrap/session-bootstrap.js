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
  isAccessTokenNearExpiry,
  ensureShortcuts,
  ensureRealtime,
  scheduleDeferredTask,
} from './session-helpers.js';

export {
  installKnownErrorSuppressors,
  isKnownAutofillOverlayError,
  isAccessTokenNearExpiry,
  ensureShortcuts,
  ensureRealtime,
  scheduleDeferredTask,
} from './session-helpers.js';

let bootstrapped = false;
let deferredBootstrapPromise = null;
let modelsPrefetchPromise = null;
let modelsInvalidationListenerBound = false;
// modelsCacheGeneration moved to shared/utils/models-cache-generation.js
// to avoid cross-feature import violations from chat/ → bootstrap/
import {
  getModelsCacheGeneration,
  incrementModelsCacheGeneration,
} from '../shared/utils/models-cache-generation.js';
export { getModelsCacheGeneration, incrementModelsCacheGeneration };

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

function applyPrefetchedModels(data) {
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
}

function applyCachedModelsIfAvailable() {
  const cached = readModelsCache('effective');
  if (cached?.models?.length) {
    applyPrefetchedModels(cached);
    return cached;
  }
  return null;
}

function handlePrefetchError(err, { requestGeneration, allowCache }) {
  if (requestGeneration !== getModelsCacheGeneration()) return null;
  console.warn('Failed to prefetch models:', err);
  if (allowCache) {
    const cached = applyCachedModelsIfAvailable();
    if (cached) return cached;
  }
  setState({ modelsLoading: false });
  return null;
}

export function prefetchModels({ allowCache = true, cacheBust = null, force = false } = {}) {
  if (modelsPrefetchPromise && !force && !cacheBust) return modelsPrefetchPromise;
  if (!state.models?.length) {
    setState({ modelsLoading: true });
  }

  const requestGeneration = getModelsCacheGeneration();
  const requestPromise = fetchModels({
    cache: 'no-store',
    cacheBust,
    scope: 'effective',
  })
    .then((data) => {
      if (requestGeneration !== getModelsCacheGeneration()) return data;
      applyPrefetchedModels(data);
      return data;
    })
    .catch((err) => handlePrefetchError(err, { requestGeneration, allowCache }))
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
  incrementModelsCacheGeneration();
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
    incrementModelsCacheGeneration();
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

function resolvePermissionsRequest(roleName) {
  if (typeof fetchMyPermissions !== 'function') {
    return Promise.resolve({
      permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member,
    });
  }
  return Promise.resolve(fetchMyPermissions())
    .then(
      (value) =>
        value || {
          permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member,
        }
    )
    .catch(() => ({
      permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member,
    }));
}

function resolveRolesRequest(roleName) {
  if (typeof fetchMyRoles !== 'function') {
    return Promise.resolve({ roles: [{ role_name: roleName }] });
  }
  return Promise.resolve(fetchMyRoles())
    .then((value) => value || { roles: [{ role_name: roleName }] })
    .catch(() => ({ roles: [{ role_name: roleName }] }));
}

function applyPreloadedRbacState(hasPreloadedPermissions, hasPreloadedRoles, preloaded) {
  setState({
    permissions: hasPreloadedPermissions ? preloaded.permissions : [],
    userRoles: hasPreloadedRoles ? preloaded.roles : [],
    rbacLoading: false,
  });
}

function applyFetchedRbacState(permData, roleData) {
  setState({
    permissions: permData.permissions || [],
    userRoles: roleData.roles || [],
    rbacLoading: false,
  });
}

function applyFallbackRbacState(roleName) {
  setState({
    permissions: FALLBACK_PERMISSIONS[roleName] || FALLBACK_PERMISSIONS.member,
    userRoles: [{ role_name: roleName }],
    rbacLoading: false,
  });
}

async function initRBAC(user, preloaded = null) {
  setState({ rbacLoading: true });
  const roleName = normalizePublicRole(user.primary_role);
  try {
    const hasPreloadedPermissions = Array.isArray(preloaded?.permissions);
    const hasPreloadedRoles = Array.isArray(preloaded?.roles);
    if (hasPreloadedPermissions || hasPreloadedRoles) {
      applyPreloadedRbacState(hasPreloadedPermissions, hasPreloadedRoles, preloaded);
      return;
    }

    const [permData, roleData] = await Promise.all([
      resolvePermissionsRequest(roleName),
      resolveRolesRequest(roleName),
    ]);

    applyFetchedRbacState(permData, roleData);
  } catch (err) {
    console.warn('RBAC initialization fallback:', err);
    applyFallbackRbacState(roleName);
  }
}

async function ensureValidAccessToken(auth) {
  if (auth?.access_token && isAccessTokenUsable(auth.access_token)) {
    return true;
  }
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

async function refreshAccessTokenIfNeeded(auth, preferRefresh) {
  const refreshTokenValue = auth?.refresh_token || null;
  if (!refreshTokenValue) return null;
  const shouldRefresh = preferRefresh || isAccessTokenNearExpiry(auth.access_token);
  if (!shouldRefresh) return null;
  const refreshed = await refreshToken(refreshTokenValue);
  if (!refreshed?.access_token) {
    clearAuthState();
    window.location.href = '/auth.html';
    return false;
  }
  return refreshTokenValue;
}

async function fetchCurrentUser(refreshTokenValue) {
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
    return null;
  }
  const meData = await meRes.json();
  return meData.user || {};
}

function applyInitialRoleState(user) {
  const bootstrapRoleName = normalizePublicRole(user.primary_role);
  setState({
    permissions: FALLBACK_PERMISSIONS[bootstrapRoleName] || FALLBACK_PERMISSIONS.member,
    userRoles: [{ role_name: bootstrapRoleName }],
  });
}

function resolveRouteContext() {
  const path = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  return {
    path,
    routeChatId: getChatIdFromPath(path),
    modelParam: urlParams.get('model'),
    isHomeRoute: path === '/' || path === '',
    isSettingsFirstRoute: path.startsWith('/admin/settings') || path.startsWith('/admin/system'),
  };
}

function resolveInitialModelId(user, meData, modelParam) {
  const cachedDefaultModelId = localStorage.getItem('defaultModelId');
  const serverDefaultModelId = user.preferences?.defaultModelId || null;
  const globalDefaultModelId = meData?.app_config?.default_model_id || null;
  return {
    initialModelId: getPreferredModelId(
      [],
      [modelParam, serverDefaultModelId, globalDefaultModelId, cachedDefaultModelId]
    ),
    serverDefaultModelId,
    cachedDefaultModelId,
  };
}

function buildChatsPagination(chatsData) {
  return {
    limit: chatsData.limit || INITIAL_CHAT_LIMIT,
    offset: (chatsData.offset || 0) + (chatsData.chats?.length || 0),
    hasMore: chatsData.has_more === true,
    loading: false,
  };
}

function buildResetConversationState(
  resetConversationState,
  initialModelId,
  serverDefaultModelId,
  globalDefaultModelId
) {
  if (!resetConversationState) return null;
  return {
    messagesByChat: {},
    models: state.models || [],
    modelCatalogMeta: state.modelCatalogMeta || null,
    activeModelId: initialModelId,
    defaultModelId: serverDefaultModelId || null,
    globalDefaultModelId: globalDefaultModelId || null,
  };
}

function applyChatsState(
  chatsData,
  user,
  {
    routeChatId,
    isHomeRoute,
    initialModelId,
    serverDefaultModelId,
    globalDefaultModelId,
    resetConversationState = false,
  } = {}
) {
  const nextChatsData = injectTempChat({
    chats: chatsData.chats || [],
    routeChatId,
    modelId: initialModelId,
  });
  const resetState = buildResetConversationState(
    resetConversationState,
    initialModelId,
    serverDefaultModelId,
    globalDefaultModelId
  );
  setState({
    user,
    chats: nextChatsData,
    chatsPagination: buildChatsPagination(chatsData),
    activeChatId: resolveActiveChatId({ routeChatId, chats: chatsData.chats, isHomeRoute }),
    ...(resetState || {}),
  });
}

function fetchAndApplyChats(user, applyArgs) {
  return fetchChats({ limit: INITIAL_CHAT_LIMIT, offset: 0 })
    .then((fresh) => {
      writeChatsCache(user.id, fresh);
      applyChatsState(fresh, user, applyArgs);
    })
    .catch((err) => {
      console.warn('Failed to refresh chats:', err);
    });
}

function bootstrapChatsFromCache(cachedChats, user, applyArgs) {
  applyChatsState(cachedChats, user, { ...applyArgs, resetConversationState: true });
  setTimeout(() => fetchAndApplyChats(user, applyArgs), 25000);
}

function bootstrapChatsFresh(user, applyArgs) {
  applyChatsState(
    {
      chats: [],
      limit: INITIAL_CHAT_LIMIT,
      offset: 0,
      has_more: false,
    },
    user,
    { ...applyArgs, resetConversationState: true }
  );
  fetchAndApplyChats(user, applyArgs);
}

function applyEmptyChatsState(user, initialModelId, serverDefaultModelId, globalDefaultModelId) {
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

function persistDefaultModelIfChanged(serverDefaultModelId, cachedDefaultModelId) {
  if (serverDefaultModelId && serverDefaultModelId !== cachedDefaultModelId) {
    localStorage.setItem('defaultModelId', serverDefaultModelId);
  }
}

function shouldScheduleModelsPrefetch(shouldBootstrapChats, invalidateToken) {
  if (!shouldBootstrapChats) return;
  scheduleModelsPrefetch({
    allowCache: true,
    cacheBust: invalidateToken,
    force: true,
  });
}

export async function ensureSession({ preferRefresh = false } = {}) {
  if (bootstrapped) return true;

  const auth = getAuthState();
  const tokenOk = await ensureValidAccessToken(auth);
  if (!tokenOk) return false;

  const refreshTokenValue = await refreshAccessTokenIfNeeded(auth, preferRefresh);
  if (refreshTokenValue === false) return false;

  const user = await fetchCurrentUser(refreshTokenValue);
  if (!user) return false;
  const meData = { user };

  applyInitialRoleState(user);
  ensureShortcuts();
  bindModelsInvalidationListener();

  const routeContext = resolveRouteContext();
  const cachedChats = readChatsCache(user.id);
  const invalidateToken = checkModelsInvalidation();
  const shouldBootstrapChats = !routeContext.isSettingsFirstRoute;
  const modelResolution = resolveInitialModelId(user, meData, routeContext.modelParam);
  const { initialModelId, serverDefaultModelId, cachedDefaultModelId } = modelResolution;

  if (shouldBootstrapChats) {
    const applyArgs = {
      routeChatId: routeContext.routeChatId,
      isHomeRoute: routeContext.isHomeRoute,
      initialModelId,
      serverDefaultModelId,
      globalDefaultModelId: meData?.app_config?.default_model_id || null,
    };
    const hasCachedChats = cachedChats?.chats?.length;
    if (hasCachedChats) {
      bootstrapChatsFromCache(cachedChats, user, applyArgs);
    } else {
      bootstrapChatsFresh(user, applyArgs);
    }
  } else {
    applyEmptyChatsState(
      user,
      initialModelId,
      serverDefaultModelId,
      meData?.app_config?.default_model_id || null
    );
  }

  persistDefaultModelIfChanged(serverDefaultModelId, cachedDefaultModelId);
  shouldScheduleModelsPrefetch(shouldBootstrapChats, invalidateToken);

  bootstrapped = true;
  scheduleDeferredBootstrap(user);
  return true;
}
