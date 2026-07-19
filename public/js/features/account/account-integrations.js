import { fetchUserMcpServers } from '../../shared/api/resources.js';
import { renderErrorBanner } from '../../shared/components/section-header.js';
import { broadcastToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import { removeItemById, upsertItemById } from '../../shared/utils/list-state.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';
import { escapeHtml, escapeSelector } from '../../shared/utils/dom-escape.js';
import { sortResourcesByEnabledThenVisibilityThenLabel } from '../../shared/utils/resource-sort.js';
import { saveUserPreferences } from '../../shared/utils/save-user-preferences.js';
import { buildTraceAttrs } from '../../shared/utils/trace-attrs.js';

import {
  clonePreferences,
  normalizeServer,
  renderLoadingSkeleton,
} from './account-integrations-helpers.js';
import { createIntegrationsModal } from './account-integrations-modal.js';
import { createIntegrationsEvents } from './account-integrations-events.js';
import { buildMergedServer } from './account-integrations-merge.js';

function buildIntegrationsEvents({
  container,
  sectionState,
  canManageToolServers,
  canManageAcls,
  state,
  persistPreferences,
  openModalRef,
  removeServerRef,
}) {
  return createIntegrationsEvents({
    container,
    sectionState,
    canManageToolServers,
    canManageAcls,
    state,
    persistPreferences,
    get openModal() {
      return openModalRef.value;
    },
    get removeServer() {
      return removeServerRef.value;
    },
    escapeHtml,
    escapeSelector,
  });
}

function setupIntegrationsRuntime({
  container,
  state,
  sectionState,
  canManageToolServers,
  canManageAcls,
  refreshPreferencesUi,
}) {
  const renderRef = { value: () => {} };
  const openModalRef = { value: () => {} };
  const removeServerRef = { value: () => {} };
  const persistPreferencesRef = { current: async () => {} };
  const events = buildIntegrationsEvents({
    container,
    sectionState,
    canManageToolServers,
    canManageAcls,
    state,
    persistPreferences: (...args) => persistPreferencesRef.current(...args),
    openModalRef,
    removeServerRef,
  });
  const {
    ensureMounted,
    syncFeedback,
    syncHeaderButtons,
    syncListState,
    syncListShell,
    syncActionFooter,
    bindDelegatedEvents,
  } = events;

  function render() {
    return renderIntegrationsView({
      container,
      ensureMounted,
      sectionState,
      canManageToolServers,
      syncFeedback,
      syncHeaderButtons,
      syncListShell,
      bindDelegatedEvents,
      syncActionFooter,
    });
  }
  renderRef.value = render;

  const { persistPreferences } = buildIntegrationsPersistence({
    state,
    sectionState,
    refreshPreferencesUi: refreshPreferencesUi || (() => {}),
  });
  persistPreferencesRef.current = persistPreferences;
  const loadServers = buildIntegrationsLoader({ sectionState, render });
  const { upsertServer, removeServer, mergeSavedServer } = buildServerMutators({ sectionState });
  removeServerRef.value = removeServer;

  const modal = buildIntegrationsModalBinding({
    container,
    sectionState,
    canManageToolServers,
    canManageAcls,
    mergeSavedServer,
    removeServer,
    upsertServer,
    persistPreferences,
    syncFeedback,
    syncListState,
    syncListShell,
    syncActionFooter,
    renderRef,
  });
  openModalRef.value = modal.openModal;

  return { render, loadServers };
}

function renderIntegrationsView({
  container,
  ensureMounted,
  sectionState,
  canManageToolServers,
  syncFeedback,
  syncHeaderButtons,
  syncListShell,
  bindDelegatedEvents,
  syncActionFooter,
}) {
  if (!ensureMounted()) {
    container.innerHTML = buildIntegrationsMarkup({ sectionState, canManageToolServers });
    container.dataset.integrationsMounted = '1';
    syncHeaderButtons();
    syncListShell();
    bindDelegatedEvents();
    syncActionFooter();
    return;
  }
  syncFeedback();
  syncHeaderButtons();
  syncListShell();
  syncActionFooter();
}

function buildIntegrationsModalBinding({
  container,
  sectionState,
  canManageToolServers,
  canManageAcls,
  mergeSavedServer,
  removeServer,
  upsertServer,
  persistPreferences,
  syncFeedback,
  syncListState,
  syncListShell,
  syncActionFooter,
  renderRef,
}) {
  return createIntegrationsModal({
    container,
    sectionState,
    canManageToolServers,
    canManageAcls,
    mergeSavedServer,
    removeServer,
    upsertServer,
    persistPreferences,
    syncFeedback,
    syncListState,
    syncListShell,
    syncActionFooter,
    get render() {
      return renderRef.value;
    },
  });
}

function buildIntegrationsSectionState(state) {
  return {
    loading: false,
    saving: false,
    error: '',
    servers: Array.isArray(state.settings?.integrations?.servers)
      ? state.settings.integrations.servers.map(normalizeServer).filter(Boolean)
      : [],
    sharedServers: Array.isArray(state.settings?.integrations?.accessible_servers)
      ? state.settings.integrations.accessible_servers
          .map(normalizeServer)
          .filter((server) => Boolean(server) && server.enabled !== false)
      : [],
  };
}

function buildServerMutators({ sectionState }) {
  const upsertServer = (nextServer) => {
    const normalized = normalizeServer(nextServer);
    if (!normalized.id) return;
    sectionState.servers = upsertItemById(sectionState.servers, normalized);
    sectionState.error = '';
  };
  const removeServer = (serverId) => {
    sectionState.servers = removeItemById(sectionState.servers, serverId);
    sectionState.error = '';
  };
  return { upsertServer, removeServer, mergeSavedServer: buildMergedServer };
}

function normalizeIntegrationsPayload(payload) {
  return {
    servers: Array.isArray(payload?.servers)
      ? sortResourcesByEnabledThenVisibilityThenLabel(
          payload.servers.map(normalizeServer).filter(Boolean)
        )
      : [],
    sharedServers: Array.isArray(payload?.accessible_servers)
      ? sortResourcesByEnabledThenVisibilityThenLabel(
          payload.accessible_servers
            .map(normalizeServer)
            .filter((server) => Boolean(server) && server.enabled !== false)
        )
      : [],
  };
}

function buildIntegrationsPersistence({ state, sectionState, refreshPreferencesUi }) {
  let preferencesSaveVersion = 0;
  const applyPersistedPreferences = (persisted) => {
    state.settings = {
      ...(state.settings || {}),
      preferences: persisted,
    };
    sectionState.error = '';
  };
  const applyPreferencesRollback = (rollback) => {
    state.settings = {
      ...(state.settings || {}),
      preferences: rollback.preferences || clonePreferences(state.settings?.preferences || {}),
    };
  };
  const handlePreferencesSaveError = (error, requestVersion, rollback) => {
    if (requestVersion !== preferencesSaveVersion) return;
    if (rollback) applyPreferencesRollback(rollback);
    sectionState.error = error?.message || 'Failed to update shared integration visibility';
    refreshPreferencesUi();
  };
  const persistPreferences = async ({ rollback = null } = {}) => {
    const requestVersion = ++preferencesSaveVersion;
    const preferences = clonePreferences(state.settings?.preferences || {});
    try {
      const persisted = await saveUserPreferences(preferences, {
        errorMessage: 'Failed to update shared integration visibility',
      });
      if (requestVersion !== preferencesSaveVersion) return;
      applyPersistedPreferences(persisted);
      broadcastToolServersInvalidation();
      refreshPreferencesUi();
    } catch (error) {
      handlePreferencesSaveError(error, requestVersion, rollback);
    }
  };
  return { persistPreferences };
}

function buildIntegrationsLoader({ sectionState, render }) {
  return async () => {
    sectionState.loading = true;
    sectionState.error = '';
    render();
    try {
      const payload = await fetchUserMcpServers({ cache: 'no-store' });
      const { servers, sharedServers } = normalizeIntegrationsPayload(payload);
      sectionState.servers = servers;
      sectionState.sharedServers = sharedServers;
    } catch (err) {
      sectionState.error = err?.message || 'Failed to load integrations';
    } finally {
      sectionState.loading = false;
      render();
    }
  };
}

function buildIntegrationsMarkup({ sectionState, canManageToolServers }) {
  const traceAttrs = buildTraceAttrs({
    route: '/account/settings/integrations',
    scope: 'account',
    family: 'mcp-servers',
    owner: 'account effective truth',
    read: ['/api/users/me/settings', '/api/users/me/resources/mcp-servers'],
    write: ['/api/users/me/resources/mcp-servers/:id', '/api/users/me'],
    invalidation: 'account settings only',
  });
  return `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full"${traceAttrs}>
        ${sectionState.error ? renderErrorBanner({ message: sectionState.error }) : '<div id="integrations-feedback" class="hidden mt-4 rounded-md border px-4 py-3 text-sm"></div>'}
        <div class="pt-0.5 pb-6 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Integrations</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <div class="flex items-center justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage MCP Servers</div>
                <button id="add-tool-server" data-account-integration-add class="p-1 transition-colors ${canManageToolServers ? 'text-gray-400 hover:text-gray-600' : 'text-gray-300 opacity-50 cursor-not-allowed'}" title="Add MCP Server" aria-label="Add MCP Server"${canManageToolServers ? '' : ' disabled aria-disabled="true"'}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              <hr class="border-gray-100/30 my-2" />

              <div id="tool-servers-list" class="space-y-2 overflow-y-auto overflow-x-hidden pr-1 max-h-[calc(100dvh-20rem)] [scrollbar-gutter:stable]">
                ${sectionState.loading ? renderLoadingSkeleton() : ''}
              </div>
            </section>

            <div id="integrations-feedback" class="hidden mt-4 rounded-md border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>
    `;
}

export function renderAccountIntegrationsSection(
  container,
  state = {},
  { onRefresh: _onRefresh, footerHost: _footerHost, routeCache: _routeCache } = {}
) {
  const capabilities = normalizeWorkspaceCapabilities(state.capabilities, {
    route: 'account',
  });
  const canManageToolServers = capabilities.canManageToolServers !== false;
  const canManageAcls = capabilities.canManageAcls !== false;
  const sectionState = buildIntegrationsSectionState(state);
  const refreshPreferencesUi = () => {};
  const { render, loadServers } = setupIntegrationsRuntime({
    container,
    state,
    sectionState,
    canManageToolServers,
    canManageAcls,
    refreshPreferencesUi,
  });
  render();
  loadServers();
}
