import { escapeHtml } from '../../../shared/utils/dom-escape.js';
import { apiFetch, fetchAdminGroups, fetchAdminModels } from '../../../shared/api.js';
import { consumeModelsInvalidation } from '../../../shared/utils/model-sync.js';
import { consumeConnectionsInvalidation } from '../../../shared/utils/connection-sync.js';
import { consumeToolServersInvalidation } from '../../../shared/utils/tool-server-sync.js';
import { captureRenderState, restoreRenderState } from '../../../shared/components/search-bar.js';
import { renderButton } from '../../../shared/components/button.js';
import {
  cloneAclRules,
  normalizeAclRule,
  sortResourcesByVisibility,
} from './policies-acl-helpers.js';
import {
  renderSkeleton,
  renderFamilySkeleton,
  renderResourceList,
  buildFamilyToolbarHtml,
  buildFamilyFooterHtml,
  buildFamilyPanelHtml,
} from './policies-rendering.js';
import { loadFamilyAccess } from './policies-acl-modal.js';
import { buildStickyHeaderHtml } from './policies-sticky-header.js';
import { bindPolicyEventListeners } from './policies-event-handlers.js';
import { createLoadFamilyResources } from './policies-load-family.js';
import { createPoliciesStateOps } from './policies-state-ops.js';

const FAMILIES = [
  { key: 'connections', label: 'Connections' },
  { key: 'models', label: 'Models' },
  { key: 'mcp-servers', label: 'Integrations - MCP Servers' },
];
const PAGE_SIZES = [20, 50, 100];
const DEFAULT_SELECTION = () => new Set();
const DEFAULT_VISIBILITY_FILTERS = {
  allowed: true,
  inaccessible: true,
  denied: true,
  disabled: false,
};

function isActiveTab(container) {
  const settingsTab =
    container?.dataset?.settingsTab ||
    document.querySelector('#admin-sub-content')?.dataset.settingsTab ||
    document.querySelector('[data-settings-tab]')?.dataset.settingsTab ||
    '';
  const pathname = window.location.pathname || '';
  return (
    settingsTab === 'policies' &&
    (pathname === '/' ||
      pathname.startsWith('/admin/settings/policies') ||
      pathname.startsWith('/admin/users/policies'))
  );
}

export function renderPoliciesSettings(container, _data = {}) {
  const initialParams = new URLSearchParams(window.location.search || '');
  const initialGroupId = String(initialParams.get('group') || 'all').trim() || 'all';
  const initialDeepLinkFamily = String(initialParams.get('family') || '').trim();
  const initialDeepLinkResource = String(initialParams.get('resource') || '').trim();
  const initialDeepLinkOpen = String(initialParams.get('open') || '')
    .trim()
    .toLowerCase();

  const state = {
    loading: true,
    error: null,
    groups: [],
    selectedGroupId: initialGroupId,
    query: '',
    visibilityFilters: { ...DEFAULT_VISIBILITY_FILTERS },
    filtersOpen: false,
    activeFamily: 'models',
    saving: false,
    familyStatus: { connections: 'idle', models: 'idle', 'mcp-servers': 'idle' },
    familyError: { connections: null, models: null, 'mcp-servers': null },
    paginationByFamily: {
      connections: { page: 1, pageSize: 20 },
      models: { page: 1, pageSize: 20 },
      'mcp-servers': { page: 1, pageSize: 20 },
    },
    selectionByFamily: {
      connections: DEFAULT_SELECTION(),
      models: DEFAULT_SELECTION(),
      'mcp-servers': DEFAULT_SELECTION(),
    },
    resources: { models: [], connections: [], 'mcp-servers': [] },
    modelConnectionRulesById: new Map(),
    pendingDeepLink: null,
    deepLinkOpened: false,
  };

  if (
    FAMILIES.some((family) => family.key === initialDeepLinkFamily) &&
    initialDeepLinkResource &&
    (initialDeepLinkOpen === 'access' || initialDeepLinkOpen === 'acl')
  ) {
    state.pendingDeepLink = {
      familyKey: initialDeepLinkFamily,
      resourceId: initialDeepLinkResource,
    };
    state.activeFamily = initialDeepLinkFamily;
  }

  const familyLoadSeq = { connections: 0, models: 0, 'mcp-servers': 0 };
  const familyAbortControllers = { connections: null, models: null, 'mcp-servers': null };
  let cleanupListeners = null;

  const abortFamilyLoad = (familyKey) => {
    const controller = familyAbortControllers[familyKey];
    if (controller) controller.abort();
    familyAbortControllers[familyKey] = null;
  };
  const abortAllFamilyLoads = () => {
    for (const familyKey of FAMILIES.map((family) => family.key)) {
      abortFamilyLoad(familyKey);
    }
  };

  const invalidateFamilyState = (
    familyKeys = [],
    { renderActive = false, reloadActive = false } = {}
  ) => {
    const normalizedKeys = Array.isArray(familyKeys) ? familyKeys : [];
    let shouldRender = false;
    let shouldReload = false;
    for (const familyKey of normalizedKeys) {
      if (!familyKey || !state.familyStatus[familyKey]) continue;
      abortFamilyLoad(familyKey);
      state.familyStatus[familyKey] = 'idle';
      state.familyError[familyKey] = null;
      if (familyKey === 'models') state.modelConnectionRulesById = new Map();
      shouldRender = shouldRender || state.activeFamily === familyKey;
      shouldReload = shouldReload || state.activeFamily === familyKey;
    }
    if (renderActive && shouldRender && isActiveTab(container)) render();
    if (reloadActive && shouldReload) void loadFamilyResources(state.activeFamily, { force: true });
  };

  const handleModelsInvalidation = () => {
    if (!consumeModelsInvalidation()) return;
    invalidateFamilyState(['models', 'connections'], { renderActive: true, reloadActive: true });
  };
  const handleConnectionsInvalidation = () => {
    if (!consumeConnectionsInvalidation()) return;
    invalidateFamilyState(['models', 'connections'], { renderActive: true, reloadActive: true });
  };
  const handleToolServersInvalidation = () => {
    if (!consumeToolServersInvalidation()) return;
    invalidateFamilyState(['mcp-servers'], { renderActive: true, reloadActive: true });
  };

  function resolveCurrentConnections(resources) {
    return Array.isArray(resources) ? resources : [];
  }

  function buildConnectionRulesMap(currentConnections, normalizeRule) {
    const map = new Map();
    for (const resource of currentConnections) {
      const cid = String(resource?.id || '').trim();
      if (!cid) continue;
      map.set(
        cid,
        cloneAclRules(Array.isArray(resource?.rules) ? resource.rules : [], normalizeRule)
      );
    }
    return map;
  }

  function fallbackConnectionRulesMap(modelRules) {
    return modelRules instanceof Map ? modelRules : new Map();
  }

  const getConnectionRulesByIdForWarnings = () => {
    const currentConnections = resolveCurrentConnections(state.resources.connections);
    if (currentConnections.length) {
      return buildConnectionRulesMap(currentConnections, normalizeAclRule);
    }
    return fallbackConnectionRulesMap(state.modelConnectionRulesById);
  };

  const handleVisibilityOutsideClick = (event) => {
    if (!state.filtersOpen) return;
    const button = container.querySelector('#policy-visibility-toggle');
    const menu = container.querySelector('[data-policy-visibility-menu]');
    if (button?.contains(event?.target) || menu?.contains(event?.target)) return;
    state.filtersOpen = false;
    render();
  };

  const {
    getSelectedSet,
    setSelectedSet,
    getPagination,
    setPagination,
    applyResourceRulesImmediate,
    getPagedResources,
    openDeepLinkedAccessModal,
  } = createPoliciesStateOps({
    state,
    DEFAULT_SELECTION,
    PAGE_SIZES,
    container,
    render,
    cloneAclRules,
    normalizeAclRule,
    getConnectionRulesByIdForWarnings,
  });

  const loadFamilyResources = createLoadFamilyResources({
    state,
    familyLoadSeq,
    familyAbortControllers,
    abortFamilyLoad,
    isActiveTab,
    container,
    render,
    apiFetch,
    fetchAdminModels,
    loadFamilyAccess,
    cloneAclRules,
    normalizeAclRule,
    sortResourcesByVisibility,
    openDeepLinkedAccessModal,
  });

  function render() {
    if (!isActiveTab(container)) return;
    const renderSnapshot = captureRenderState(container, {
      inputId: 'policy-search',
      scrollSelector: '[data-policies-scroll]',
    });

    if (state.loading) {
      container.innerHTML = `<div class="flex flex-col min-h-0 animate-in fade-in duration-150 w-full"><div class="max-w-6xl mx-auto w-full px-1">${renderSkeleton()}</div></div>`;
      return;
    }
    if (state.error) {
      container.innerHTML = `<div class="flex items-center justify-center h-full p-6"><div class="max-w-md w-full rounded-lg border border-red-100 bg-red-50/60 p-6 text-center"><div class="text-sm font-semibold text-red-700">Unable to load policies</div><div class="mt-2 text-sm text-red-600">${escapeHtml(state.error)}</div></div></div>`;
      return;
    }

    const groupOptions = [
      `<option value="all"${state.selectedGroupId === 'all' ? ' selected' : ''}>All groups</option>`,
      ...state.groups.map(
        (g) =>
          `<option value="${escapeHtml(g.id)}"${state.selectedGroupId === g.id ? ' selected' : ''}>${escapeHtml(g.name || g.id)}</option>`
      ),
    ].join('');
    const familyOptions = FAMILIES.map(
      (f) =>
        `<option value="${escapeHtml(f.key)}"${state.activeFamily === f.key ? ' selected' : ''}>${escapeHtml(f.label)}</option>`
    ).join('');
    const activeFamily = FAMILIES.find((f) => f.key === state.activeFamily) || FAMILIES[0];
    const activePaged = getPagedResources(activeFamily.key);
    const activeSelectedIds = getSelectedSet(activeFamily.key);
    const activeSelectionCount = activeSelectedIds.size;
    const activeVisibleIds = activePaged.items.map((r) => r.id);
    const activeVisibleSelectedCount = activeVisibleIds.filter((id) =>
      activeSelectedIds.has(id)
    ).length;
    const activeAllVisibleSelected =
      activeVisibleIds.length > 0 && activeVisibleSelectedCount === activeVisibleIds.length;
    const activeVisibilityCount = Object.entries(state.visibilityFilters).filter(
      ([k, v]) => DEFAULT_VISIBILITY_FILTERS[k] !== v
    ).length;
    const activeFamilyStatus = state.familyStatus[activeFamily.key] || 'idle';
    const activeFamilyError = state.familyError[activeFamily.key] || '';

    const stickyHeader = buildStickyHeaderHtml({
      groupOptions,
      familyOptions,
      query: state.query,
      visibilityFilters: state.visibilityFilters,
      filtersOpen: state.filtersOpen,
      activeVisibilityCount,
    });

    const toolbar = buildFamilyToolbarHtml({
      escapeHtml,
      renderButton,
      activeFamily,
      activeSelectionCount,
      activeAllVisibleSelected,
      activeVisibleIds,
      activeVisibleSelectedCount,
    });

    const footer = buildFamilyFooterHtml({ activeFamily, activePaged, PAGE_SIZES });

    const panel = buildFamilyPanelHtml({
      escapeHtml,
      activeFamily,
      activeFamilyStatus,
      activeFamilyError,
      activePaged,
      activeSelectedIds,
      state,
      getConnectionRulesByIdForWarnings,
      renderResourceList,
      renderFamilySkeleton,
    });

    container.innerHTML = `<div class="flex flex-col min-h-0 animate-in fade-in duration-300">${stickyHeader}${activeFamilyStatus === 'loaded' ? `<div class="shrink-0 bg-white border-b border-gray-100"><div class="max-w-6xl mx-auto w-full px-0.5 py-3">${toolbar}</div></div>` : ''}<div class="flex-1 min-h-0" data-policies-scroll="1"><div class="max-w-6xl mx-auto w-full space-y-4 pb-6 pt-4"><section class="space-y-4">${panel}</section></div></div><div class="shrink-0 bg-white border-t border-gray-100"><div class="max-w-6xl mx-auto w-full space-y-0.5">${footer}</div></div></div>`;

    bindPolicyEventListeners(container, {
      state,
      FAMILIES,
      PAGE_SIZES,
      getSelectedSet,
      setSelectedSet,
      getPagination,
      setPagination,
      getPagedResources,
      render,
      getConnectionRulesByIdForWarnings,
      applyResourceRulesImmediate,
      abortAllFamilyLoads,
      loadFamilyResources,
    });

    restoreRenderState(container, renderSnapshot, {
      inputId: 'policy-search',
      scrollSelector: '[data-policies-scroll]',
    });
  }

  const load = async () => {
    state.loading = true;
    state.error = null;
    render();
    try {
      const groupsPayload = await fetchAdminGroups();
      state.groups = Array.isArray(groupsPayload.groups) ? groupsPayload.groups : [];
      if (
        state.selectedGroupId !== 'all' &&
        !state.groups.some((g) => g.id === state.selectedGroupId)
      )
        state.selectedGroupId = 'all';
    } catch (err) {
      state.error = err?.message || 'Failed to load policies';
    } finally {
      state.loading = false;
      if (isActiveTab(container)) render();
      if (!state.error) void loadFamilyResources(state.activeFamily);
    }
  };

  const handlePoliciesUpdated = () => {
    loadFamilyResources(state.activeFamily, { force: true }).catch((err) => {
      state.error = err?.message || 'Failed to reload policies';
      state.loading = false;
      if (isActiveTab(container)) render();
    });
  };
  const handleStorageInvalidation = (event) => {
    if (event.key === 'growchat_models_invalidate') handleModelsInvalidation();
    if (event.key === 'growchat_connections_invalidate') handleConnectionsInvalidation();
    if (event.key === 'growchat_tool_servers_invalidate') handleToolServersInvalidation();
  };

  window.addEventListener('growchat:policies-updated', handlePoliciesUpdated);
  window.addEventListener('growchat:models-invalidated', handleModelsInvalidation);
  window.addEventListener('growchat:connections-invalidated', handleConnectionsInvalidation);
  window.addEventListener('growchat:tool-servers-invalidated', handleToolServersInvalidation);
  window.addEventListener('storage', handleStorageInvalidation);
  document.addEventListener('click', handleVisibilityOutsideClick, true);
  cleanupListeners = () => {
    window.removeEventListener('growchat:policies-updated', handlePoliciesUpdated);
    window.removeEventListener('growchat:models-invalidated', handleModelsInvalidation);
    window.removeEventListener('growchat:connections-invalidated', handleConnectionsInvalidation);
    window.removeEventListener('growchat:tool-servers-invalidated', handleToolServersInvalidation);
    window.removeEventListener('storage', handleStorageInvalidation);
    document.removeEventListener('click', handleVisibilityOutsideClick, true);
    abortAllFamilyLoads();
  };
  container.__cleanup = () => {
    cleanupListeners?.();
    cleanupListeners = null;
  };
  load();
}
