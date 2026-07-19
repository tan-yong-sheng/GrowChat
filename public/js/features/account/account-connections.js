import { fetchUserConnections } from '../../shared/api/resources.js';
import { renderErrorBanner } from '../../shared/components/section-header.js';
import { broadcastConnectionsInvalidation } from '../../shared/utils/connection-sync.js';
import { broadcastModelsInvalidation } from '../../shared/utils/model-sync.js';
import { removeItemById, upsertItemById } from '../../shared/utils/list-state.js';
import { normalizeConnectionModelSelectionMode } from '../../shared/utils/connection-model-selection.js';
import { normalizeUserResourceOverrides } from '../../shared/utils/user-resource-overrides.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';
import { sortResourcesByEnabledThenVisibilityThenLabel } from '../../shared/utils/resource-sort.js';
import { saveUserPreferences } from '../../shared/utils/save-user-preferences.js';

import {
  normalizePersonalConnection,
  clonePreferences,
  buildListCard,
  buildAccessibleCard,
} from './account-connections-helpers.js';
import { createConnectionModal } from './account-connections-modal.js';
import { handleConnectionToggleClick } from './account-connections-toggle-handler.js';

/**
 * Resolve a field from 3 connection sources with optional fallback.
 * Priority: saved > payload > existing (using || for truthy-first semantics).
 */
function resolveConnectionField(sources, fieldName, fallback) {
  const { saved, payload, existing } = sources;
  const value = saved?.[fieldName] || payload?.[fieldName] || existing?.[fieldName];
  return value !== undefined && value !== null ? value : fallback;
}

/**
 * Resolve enabled from 3 connection sources with boolean priority.
 * Returns the first boolean value found, or existing?.enabled ?? true.
 */
function resolveConnectionEnabled(sources) {
  const { saved, payload, existing } = sources;
  if (typeof saved?.enabled === 'boolean') {
    return saved.enabled;
  }
  if (typeof payload?.enabled === 'boolean') {
    return payload.enabled;
  }
  if (typeof existing?.enabled === 'boolean') {
    return existing.enabled;
  }
  return existing?.enabled ?? true;
}

/**
 * Resolve manual_models_mode from 3 connection sources.
 * Checks multiple key paths (camelCase + snake_case), falls back to normalization || 'all'.
 * Preserves || semantics (not ??) to match existing behavior.
 */
const MANUAL_MODELS_MODE_FIELDS = ['manual_models_mode', 'manualModelsMode'];

function firstPresentManualModelsMode(sources) {
  for (const source of sources) {
    if (!source) continue;
    for (const field of MANUAL_MODELS_MODE_FIELDS) {
      if (source[field]) return source[field];
    }
  }
  return null;
}

function resolveConnectionManualModelsMode(sources) {
  const raw = firstPresentManualModelsMode([sources.saved, sources.payload, sources.existing]);
  return normalizeConnectionModelSelectionMode(raw) || raw || 'all';
}

/**
 * Resolve manual_models from 3 connection sources.
 * Returns the first array found, or existing?.manual_models || [].
 */
function resolveConnectionManualModels(sources) {
  const { saved, payload, existing } = sources;
  if (Array.isArray(saved?.manual_models)) {
    return saved.manual_models;
  }
  if (Array.isArray(payload?.manual_models)) {
    return payload.manual_models;
  }
  return existing?.manual_models || [];
}

function buildConnectionsFromPayload(payload) {
  return {
    my_connections: Array.isArray(payload?.my_connections) ? payload.my_connections : [],
    connections: Array.isArray(payload?.connections) ? payload.connections : [],
  };
}

function applyConnectionsPayload(state, viewState, getConnections, payload) {
  state.settings = { ...state.settings, connections: buildConnectionsFromPayload(payload) };
  const next = getConnections();
  viewState.personal = next.personal;
  viewState.accessible = next.accessible;
  viewState.error = '';
}

async function handleRefreshFallback({ err, state, viewState, getConnections, onRefresh }) {
  if (typeof onRefresh === 'function') {
    const nextState = await onRefresh();
    viewState.error = '';
    if (nextState) {
      state.settings = nextState.settings;
      const nextConnections = getConnections();
      viewState.personal = nextConnections.personal;
      viewState.accessible = nextConnections.accessible;
    }
  } else {
    viewState.error = err?.message || 'Failed to load connections';
  }
}

function getConnectionsFromState(state) {
  const connections = state.settings?.connections || {};
  return {
    personal: Array.isArray(connections.my_connections)
      ? sortResourcesByEnabledThenVisibilityThenLabel(
          connections.my_connections.map((connection) => normalizePersonalConnection(connection))
        )
      : [],
    accessible: Array.isArray(connections.connections)
      ? sortResourcesByEnabledThenVisibilityThenLabel(
          connections.connections.map((connection) => ({
            id: String(connection.id || '').trim(),
            name: String(connection.name || connection.id || '').trim(),
            note: String(connection.note || connection.base_url || '').trim(),
            access_label: String(connection.access_label || 'Shared').trim(),
            hidden_for_user: Boolean(connection.hidden_for_user),
            visible_for_user: connection.visible_for_user !== false,
          }))
        )
      : [],
  };
}

/**
 * Merge 3 connection sources (saved > payload > existing) into a normalized connection record.
 *
 * @param {Object} payload - The request payload
 * @param {Object|null} savedConnection - The saved/returned connection (highest priority)
 * @param {Object|null} existingConnection - The existing connection (lowest priority)
 * @returns {Object} Normalized connection record
 */
function buildMergedConnection(payload, savedConnection, existingConnection = null) {
  const sources = { saved: savedConnection, payload, existing: existingConnection };
  const merged = {
    id: resolveConnectionField(sources, 'id', ''),
    name: resolveConnectionField(sources, 'name', ''),
    base_url: resolveConnectionField(sources, 'base_url', ''),
    provider_type: resolveConnectionField(sources, 'provider_type', 'openai-compatible'),
    provider_family: resolveConnectionField(sources, 'provider_family', 'openai'),
    auth_type: resolveConnectionField(sources, 'auth_type', ''),
    enabled: resolveConnectionEnabled(sources),
    manual_models_mode: resolveConnectionManualModelsMode(sources),
    headers: resolveConnectionField(sources, 'headers', {}),
    key: resolveConnectionField(sources, 'key', ''),
    manual_models: resolveConnectionManualModels(sources),
  };
  const normalized = normalizePersonalConnection(merged);
  if (existingConnection?.has_key && !normalized.has_key) {
    normalized.has_key = true;
  }
  return normalized;
}

function buildConnectionMutators({ viewState }) {
  const upsertPersonalConnection = (nextConnection) => {
    const normalized = normalizePersonalConnection(nextConnection);
    if (!normalized.id) return;
    viewState.personal = upsertItemById(viewState.personal, normalized);
    viewState.error = '';
  };
  const mergeSavedConnection = buildMergedConnection;
  const removePersonalConnection = (connectionId) => {
    viewState.personal = removeItemById(viewState.personal, connectionId);
    viewState.error = '';
  };
  return { upsertPersonalConnection, mergeSavedConnection, removePersonalConnection };
}

function buildPreferencesPersistence({ state, viewState, render }) {
  let preferencesSaveVersion = 0;
  const applyPersistedConnectionPreferences = (persisted) => {
    state.settings = {
      ...(state.settings || {}),
      preferences: persisted,
    };
    viewState.error = '';
  };
  const applyConnectionPreferencesRollback = (rollback) => {
    state.settings = {
      ...(state.settings || {}),
      preferences: rollback.preferences || clonePreferences(state.settings?.preferences || {}),
    };
  };
  const handleConnectionPreferencesError = (err, requestVersion, rollback) => {
    if (requestVersion !== preferencesSaveVersion) return;
    if (rollback) applyConnectionPreferencesRollback(rollback);
    viewState.error = err?.message || 'Failed to save preferences';
    render();
  };
  const persistPreferences = async ({ rollback = null } = {}) => {
    const requestVersion = ++preferencesSaveVersion;
    const preferences = clonePreferences(state.settings?.preferences || {});
    try {
      const persisted = await saveUserPreferences(preferences, {
        errorMessage: 'Failed to save preferences',
      });
      if (requestVersion !== preferencesSaveVersion) return;
      applyPersistedConnectionPreferences(persisted);
      broadcastConnectionsInvalidation();
      broadcastModelsInvalidation();
      render();
    } catch (err) {
      handleConnectionPreferencesError(err, requestVersion, rollback);
    }
  };
  return { persistPreferences };
}

function buildConnectionRefresh({ state, viewState, getConnections, onRefresh, render }) {
  const showPageError = (message = '') => {
    viewState.error = String(message || '');
    render();
  };
  const refreshConnections = async () => {
    try {
      const payload = await fetchUserConnections({ cache: 'no-store' });
      applyConnectionsPayload(state, viewState, getConnections, payload);
    } catch (err) {
      await handleRefreshFallback({ err, state, viewState, getConnections, onRefresh });
    }
    render();
  };
  return { showPageError, refreshConnections };
}

function computeConnectionLists({ state, viewState, canManageConnections }) {
  const hiddenConnections = new Set(
    normalizeUserResourceOverrides(state.settings?.preferences).connections.hidden_ids || []
  );
  const sortedPersonal = sortResourcesByEnabledThenVisibilityThenLabel(viewState.personal);
  const sortedAccessible = sortResourcesByEnabledThenVisibilityThenLabel(viewState.accessible);
  const personalMarkup = sortedPersonal.length
    ? sortedPersonal.map((connection) => buildListCard(connection, canManageConnections)).join('')
    : '';
  const accessibleMarkup = sortedAccessible.length
    ? sortedAccessible
        .map((connection) =>
          buildAccessibleCard(
            connection,
            hiddenConnections.has(connection.id),
            canManageConnections
          )
        )
        .join('')
    : '';
  return { personalMarkup, accessibleMarkup };
}

function buildConnectionsPageMarkup({
  viewState,
  canManageConnections,
  personalMarkup,
  accessibleMarkup,
}) {
  return `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        ${viewState.error ? renderErrorBanner({ message: viewState.error }) : ''}
        <div class="pt-0.5 pb-6 bg-white">
          <div class="max-w-2xl mx-auto w-full flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Connections</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <div class="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pr-2">
                <div class="flex flex-col">
                  <div class="text-xs font-medium text-gray-900">LLM Providers</div>
                  <div class="text-label-sm text-gray-400">Manage each provider directly below.</div>
                </div>
              </div>
            </section>

            <section id="manage-connections-section" class="space-y-1 mt-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage LLM Chat Providers</div>
                <button id="add-connection" data-account-connection-add class="shrink-0 p-1 transition-colors ${canManageConnections ? 'text-gray-400 hover:text-gray-600' : 'text-gray-300 opacity-50 cursor-not-allowed'}" title="Add Connection" aria-label="Add Connection"${canManageConnections ? '' : ' disabled aria-disabled="true"'}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              <hr class="border-gray-100/30 my-2" />

              <div data-account-personal-connections class="space-y-2">
                ${personalMarkup}
              </div>
              ${accessibleMarkup ? `<div class="mt-3 space-y-2">${accessibleMarkup}</div>` : ''}
            </section>

            <div id="connections-feedback" class="hidden mt-4 rounded-md border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>
    `;
}

function wireConnectionsEvents({
  container,
  canManageConnections,
  viewState,
  state,
  render,
  persistPreferences,
  showPageError,
  openConnectionModal,
}) {
  container
    .querySelector('[data-action="add-connection"], #add-connection, [data-account-connection-add]')
    ?.addEventListener('click', () => {
      if (!canManageConnections) return;
      openConnectionModal(null);
    });

  container.querySelectorAll('[data-list-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!canManageConnections) return;
      const connectionId =
        button.dataset.accountConnectionEdit || button.closest('[data-connection-row]')?.dataset.id;
      const connection = viewState.personal.find((item) => item.id === connectionId);
      if (connection) {
        openConnectionModal(connection);
      }
    });
  });

  container.querySelectorAll('.connection-toggle').forEach((toggleBtn) => {
    toggleBtn.addEventListener('click', () =>
      handleConnectionToggleClick(toggleBtn, {
        viewState,
        state,
        canManageConnections,
        render,
        persistPreferences,
        showPageError,
      })
    );
  });
}

export function renderAccountConnectionsSection(
  container,
  state = {},
  { onRefresh, routeCache } = {}
) {
  const capabilities = normalizeWorkspaceCapabilities(state.capabilities, {
    route: 'account',
  });
  const canManageConnections = capabilities.canManageConnections !== false;
  const getConnections = () => getConnectionsFromState(state);
  const viewState = {
    saving: false,
    error: '',
    ...getConnections(),
  };

  function render() {
    const lists = computeConnectionLists({ state, viewState, canManageConnections });
    container.innerHTML = buildConnectionsPageMarkup({
      viewState,
      canManageConnections,
      ...lists,
    });
    wireConnectionsEvents({
      container,
      canManageConnections,
      viewState,
      state,
      render,
      persistPreferences,
      showPageError,
      openConnectionModal,
    });
  }

  const { showPageError, refreshConnections } = buildConnectionRefresh({
    state,
    viewState,
    getConnections,
    onRefresh,
    render,
  });
  routeCache?.registerConnectionsRefresh?.(async () => {
    await refreshConnections();
  });

  const { upsertPersonalConnection, mergeSavedConnection, removePersonalConnection } =
    buildConnectionMutators({ viewState });
  const { persistPreferences } = buildPreferencesPersistence({ state, viewState, render });

  const modal = createConnectionModal({
    container,
    viewState,
    canManageConnections,
    upsertPersonalConnection,
    mergeSavedConnection,
    removePersonalConnection,
    render,
  });
  const { openConnectionModal } = modal;

  render();
}
