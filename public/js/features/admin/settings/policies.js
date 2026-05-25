import { apiFetch, fetchAdminGroups, fetchAdminModels } from '../../../shared/api.js';
import {
  broadcastModelsInvalidation,
  consumeModelsInvalidation,
} from '../../../shared/utils/model-sync.js';
import {
  consumeConnectionsInvalidation,
  broadcastConnectionsInvalidation,
} from '../../../shared/utils/connection-sync.js';
import {
  broadcastToolServersInvalidation,
  consumeToolServersInvalidation,
} from '../../../shared/utils/tool-server-sync.js';
import { captureRenderState, restoreRenderState } from '../../../shared/components/search-bar.js';
import { renderButton } from '../../../shared/components/button.js';
import {
  cloneAclRules,
  normalizeAclRule,
  getResourceAccessState,
  sortResourcesByVisibility,
  buildModelAccessModalWarning,
} from './policies-acl-helpers.js';
import {
  escapeHtml,
  renderSkeleton,
  renderFamilySkeleton,
  renderResourceList,
} from './policies-rendering.js';
import { loadFamilyAccess, saveFamilyAccess, openAccessModal } from './policies-acl-modal.js';
import { buildStickyHeaderHtml } from './policies-sticky-header.js';
import { bindPolicyEventListeners } from './policies-event-handlers.js';
import { createLoadFamilyResources } from './policies-load-family.js';

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

  const getConnectionRulesByIdForWarnings = () => {
    const currentConnections = Array.isArray(state.resources.connections)
      ? state.resources.connections
      : [];
    if (currentConnections.length) {
      const map = new Map();
      for (const resource of currentConnections) {
        const cid = String(resource?.id || '').trim();
        if (!cid) continue;
        map.set(
          cid,
          cloneAclRules(Array.isArray(resource?.rules) ? resource.rules : [], normalizeAclRule)
        );
      }
      return map;
    }
    return state.modelConnectionRulesById instanceof Map
      ? state.modelConnectionRulesById
      : new Map();
  };

  const handleVisibilityOutsideClick = (event) => {
    if (!state.filtersOpen) return;
    const button = container.querySelector('#policy-visibility-toggle');
    const menu = container.querySelector('[data-policy-visibility-menu]');
    if (button?.contains(event?.target) || menu?.contains(event?.target)) return;
    state.filtersOpen = false;
    render();
  };

  const getSelectedSet = (familyKey) => state.selectionByFamily[familyKey] || DEFAULT_SELECTION();
  const setSelectedSet = (familyKey, values) => {
    state.selectionByFamily[familyKey] = new Set(
      Array.isArray(values) ? values : Array.from(values || [])
    );
  };
  const getPagination = (familyKey) =>
    state.paginationByFamily[familyKey] || { page: 1, pageSize: 20 };
  const setPagination = (familyKey, next) => {
    state.paginationByFamily[familyKey] = {
      page: Math.max(1, Number.parseInt(next?.page || 1, 10) || 1),
      pageSize: PAGE_SIZES.includes(Number.parseInt(next?.pageSize, 10))
        ? Number.parseInt(next.pageSize, 10)
        : 20,
    };
  };

  const applyResourceRulesImmediate = async (familyKey, resourceIds, nextRules) => {
    const ids = new Set(
      (Array.isArray(resourceIds) ? resourceIds : [resourceIds])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    );
    if (!ids.size) return;
    const targetResources = (state.resources[familyKey] || []).filter((r) =>
      ids.has(String(r.id || '').trim())
    );
    if (!targetResources.length) return;
    const previousState = targetResources.map((r) => ({
      id: r.id,
      rules: cloneAclRules(r.rules || [], normalizeAclRule),
    }));
    state.resources[familyKey] = (state.resources[familyKey] || []).map((r) => {
      if (!ids.has(String(r.id || '').trim())) return r;
      return { ...r, rules: cloneAclRules(nextRules, normalizeAclRule) };
    });
    render();
    try {
      const updates = targetResources.map((r) => ({
        [familyKey === 'models'
          ? 'model_id'
          : familyKey === 'connections'
            ? 'connection_id'
            : 'tool_server_id']: r.id,
        rules: cloneAclRules(nextRules, normalizeAclRule),
      }));
      await saveFamilyAccess({ familyKey, updates });
      broadcastModelsInvalidation();
      broadcastConnectionsInvalidation();
      broadcastToolServersInvalidation();
    } catch (err) {
      state.resources[familyKey] = (state.resources[familyKey] || []).map((r) => {
        const prev = previousState.find((p) => p.id === r.id);
        return prev ? { ...r, rules: cloneAclRules(prev.rules, normalizeAclRule) } : r;
      });
      render();
      const banner = container.querySelector('[data-policy-error-banner]');
      if (banner) {
        banner.textContent = err?.message || 'Failed to save policy changes';
        banner.classList.remove('hidden');
        setTimeout(() => banner.classList.add('hidden'), 5000);
      }
      throw err;
    }
  };

  const filterResources = (familyKey, resources = []) => {
    const query = state.query.trim().toLowerCase();
    return (Array.isArray(resources) ? resources : []).filter((resource) => {
      if (resource?.enabled === false && !state.visibilityFilters.disabled) return false;
      const text = [
        resource.id,
        resource.name,
        resource.title,
        resource.provider,
        resource.providerType,
        resource.base_url,
        resource.url,
      ]
        .join(' ')
        .toLowerCase();
      if (query && !text.includes(query)) return false;
      const category = getResourceAccessState(
        resource,
        state.selectedGroupId === 'all' ? '' : state.selectedGroupId
      );
      return Boolean(state.visibilityFilters[category]);
    });
  };

  const getPagedResources = (familyKey) => {
    const list = state.resources[familyKey] || [];
    const filtered = filterResources(familyKey, list);
    const pagination = getPagination(familyKey);
    const pageSize = pagination.pageSize || 20;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(pagination.page || 1, 1), totalPages);
    const start = total === 0 ? 0 : (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return {
      filtered,
      items,
      total,
      totalPages,
      page,
      pageSize,
      start,
      end: Math.min(start + pageSize, total),
    };
  };

  const openDeepLinkedAccessModal = async (familyKey) => {
    if (
      state.deepLinkOpened ||
      !state.pendingDeepLink ||
      state.pendingDeepLink.familyKey !== familyKey
    )
      return;
    const targetResource = (state.resources[familyKey] || []).find(
      (r) => String(r.id || '').trim() === state.pendingDeepLink.resourceId
    );
    if (!targetResource) return;
    state.deepLinkOpened = true;
    const connectionRulesById = getConnectionRulesByIdForWarnings();
    await openAccessModal({
      familyKey,
      resource: targetResource,
      groups: state.groups,
      selectedGroupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
      resourceWarning:
        familyKey === 'models'
          ? buildModelAccessModalWarning(
              [targetResource],
              state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
              connectionRulesById
            )
          : null,
      onSaved: async (nextRules, targetResources) => {
        await applyResourceRulesImmediate(
          familyKey,
          targetResources.map((item) => item.id),
          nextRules
        );
      },
    });
  };

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

  const render = () => {
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
      container.innerHTML = `<div class="flex items-center justify-center h-full p-6"><div class="max-w-md w-full rounded-3xl border border-red-100 bg-red-50/60 p-6 text-center"><div class="text-sm font-semibold text-red-700">Unable to load policies</div><div class="mt-2 text-sm text-red-600">${escapeHtml(state.error)}</div></div></div>`;
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

    const toolbar = `<div class="flex items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-white px-3 py-2 shadow-sm"><div class="flex items-center gap-2 min-w-0 flex-wrap"><span class="text-xs text-gray-500 truncate">${escapeHtml(activeSelectionCount ? `${activeSelectionCount} selected` : 'No selection')}</span>${activeAllVisibleSelected ? '' : renderButton({ label: 'Select visible', variant: 'secondary', className: 'px-3 py-1.5 text-[11px]', dataAttrs: { 'select-visible-family': activeFamily.key } })}${activeSelectionCount ? renderButton({ label: 'Clear', variant: 'secondary', className: 'px-3 py-1.5 text-[11px]', dataAttrs: { 'clear-selection-family': activeFamily.key } }) : ''}${renderButton({ label: 'Bulk ACL', variant: 'primary', className: 'px-3 py-1.5 text-[11px]', disabled: !activeSelectionCount, dataAttrs: { 'bulk-edit-family': activeFamily.key } })}</div><div class="text-xs text-gray-400">${activeVisibleIds.length ? `${activeVisibleSelectedCount}/${activeVisibleIds.length} visible selected` : 'No visible rows'}</div></div>`;

    const footer = `<div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500 border-t border-gray-100"><div class="flex items-center gap-4"><div class="flex items-center gap-3"><span>Show</span><select data-page-size-family="${activeFamily.key}" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">${PAGE_SIZES.map((s) => `<option value="${s}" ${activePaged.pageSize === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span>per page</span></div><div class="flex items-center gap-4"><div class="text-xs text-gray-400">${activePaged.total ? `${activePaged.start + 1}-${activePaged.end} of ${activePaged.total}` : '0 of 0'}</div><div class="flex items-center gap-2"><button type="button" data-prev-page-family="${activeFamily.key}" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition disabled:opacity-50" ${activePaged.page <= 1 ? 'disabled' : ''}>Prev</button><div class="text-sm text-gray-600">Page ${activePaged.page} / ${activePaged.totalPages}</div><button type="button" data-next-page-family="${activeFamily.key}" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition disabled:opacity-50" ${activePaged.page >= activePaged.totalPages ? 'disabled' : ''}>Next</button></div></div></div></div>`;

    const panel = `<div data-family-panel="${activeFamily.key}" class="space-y-4">${activeFamilyStatus === 'error' ? `<div class="rounded-3xl border border-red-100 bg-red-50/70 p-5 text-sm text-red-700"><div class="font-semibold">Unable to load ${escapeHtml(activeFamily.label.toLowerCase())}</div><div class="mt-1 text-red-600">${escapeHtml(activeFamilyError || 'Please try again.')}</div></div>` : activeFamilyStatus === 'loaded' ? renderResourceList({ title: activeFamily.label, familyKey: activeFamily.key, resources: activePaged.items, groupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId, selectedIds: activeSelectedIds, connectionRulesById: activeFamily.key === 'models' ? getConnectionRulesByIdForWarnings() : new Map(), onToggleSelection: true, onEdit: null }) : renderFamilySkeleton()}</div>`;

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
  };

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
