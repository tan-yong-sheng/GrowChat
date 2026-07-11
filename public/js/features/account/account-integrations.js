/* global openToolServerAccessModal, aclDraftRegistry */
import {
  createUserMcpServer,
  deleteUserMcpServer,
  fetchUserMcpServers,
  testUserMcpServer,
  updateUserMcpServer,
} from '../../shared/api/resources.js';
import { apiFetch } from '../../shared/api.js';
import { buildMcpServerModalMarkup } from '../../shared/components/server-modal.js';
import { renderErrorBanner } from '../../shared/components/section-header.js';
import { renderStatusBadge } from '../../shared/components/status-badge.js';
import { broadcastToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import { removeItemById, upsertItemById } from '../../shared/utils/list-state.js';
import {
  isResourceHidden,
  isToolHidden,
  normalizeUserResourceOverrides,
  setResourceVisibility,
  setToolVisibility,
} from '../../shared/utils/user-resource-overrides.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';
import { escapeHtml, escapeSelector } from '../../shared/utils/dom-escape.js';
import { sortResourcesByEnabledThenVisibilityThenLabel } from '../../shared/utils/resource-sort.js';
import { clearModalHash, setModalHash } from '../../shared/utils/modal-hash.js';
import { buildTraceAttrs } from '../../shared/utils/trace-attrs.js';

import {
  normalizeTool,
  normalizeToolList,
  clonePreferences,
  normalizeServer,
  shouldShowAuthField,
  renderLoadingSkeleton,
  buildFormMarkup,
  updateToolToggle,
  buildListCard,
} from './account-integrations-helpers.js';
import { createIntegrationsModal } from './account-integrations-modal.js';
import { createIntegrationsEvents } from './account-integrations-events.js';

/**
 * Return the first truthy value among the candidates.
 * Mirrors the `a || b || c` fallback chain semantics exactly.
 */
function firstTruthy(...candidates) {
  for (const c of candidates) {
    if (c) return c;
  }
  return undefined;
}

export function renderAccountIntegrationsSection(
  container,
  state = {},
  { onRefresh, footerHost, routeCache } = {}
) {
  const capabilities = normalizeWorkspaceCapabilities(state.capabilities, {
    route: 'account',
  });
  const canManageToolServers = capabilities.canManageToolServers !== false;
  const canManageAcls = capabilities.canManageAcls !== false;
  const sectionState = {
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
  let preferencesSaveVersion = 0;

  const normalizeFromPayload = (payload) => ({
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
  });

  // fallow-ignore-next-line code-duplication
  const persistPreferences = async ({ rollback = null } = {}) => {
    const requestVersion = ++preferencesSaveVersion;
    const preferences = clonePreferences(state.settings?.preferences || {});
    try {
      const res = await apiFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({ preferences }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error || err.message || 'Failed to update shared integration visibility'
        );
      }
      const payload = await res.json().catch(() => ({}));
      if (requestVersion !== preferencesSaveVersion) return;
      state.settings = {
        ...(state.settings || {}),
        preferences: payload?.user?.preferences || preferences,
      };
      sectionState.error = '';
      broadcastToolServersInvalidation();
      syncListShell();
      syncFeedback();
    } catch (error) {
      if (requestVersion !== preferencesSaveVersion) return;
      if (rollback) {
        state.settings = {
          ...(state.settings || {}),
          preferences: rollback.preferences || clonePreferences(state.settings?.preferences || {}),
        };
      }
      sectionState.error = error?.message || 'Failed to update shared integration visibility';
      syncFeedback();
      syncListShell();
    }
  };

  let activeModal = null;
  let activeModalHash = '';

  const events = createIntegrationsEvents({
    container,
    sectionState,
    canManageToolServers,
    canManageAcls,
    state,
    persistPreferences,
    get openModal() {
      return openModal;
    },
    get removeServer() {
      return removeServer;
    },
    escapeHtml,
    escapeSelector,
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

  const loadServers = async () => {
    sectionState.loading = true;
    sectionState.error = '';
    render();
    try {
      const payload = await fetchUserMcpServers({ cache: 'no-store' });
      const { servers, sharedServers } = normalizeFromPayload(payload);
      sectionState.servers = servers;
      sectionState.sharedServers = sharedServers;
    } catch (err) {
      sectionState.error = err?.message || 'Failed to load integrations';
    } finally {
      sectionState.loading = false;
      render();
    }
  };

  function render() {
    if (!ensureMounted()) {
      const traceAttrs = buildTraceAttrs({
        route: '/account/settings/integrations',
        scope: 'account',
        family: 'mcp-servers',
        owner: 'account effective truth',
        read: ['/api/users/me/settings', '/api/users/me/resources/mcp-servers'],
        write: ['/api/users/me/resources/mcp-servers/:id', '/api/users/me'],
        invalidation: 'account settings only',
      });
      container.innerHTML = `
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
      container.dataset.integrationsMounted = '1';
      syncHeaderButtons();
      syncListShell();
      bindDelegatedEvents();
      syncActionFooter();
    } else {
      syncFeedback();
      syncHeaderButtons();
      syncListShell();
      syncActionFooter();
    }
  }

  const refreshServers = async () => {
    try {
      const payload = await fetchUserMcpServers({ cache: 'no-store' });
      const { servers, sharedServers } = normalizeFromPayload(payload);
      sectionState.servers = servers;
      sectionState.sharedServers = sharedServers;
    } catch (err) {
      if (typeof onRefresh === 'function') {
        const nextState = await onRefresh();
        if (nextState?.settings?.integrations?.servers) {
          sectionState.servers = sortResourcesByEnabledThenVisibilityThenLabel(
            nextState.settings.integrations.servers.map(normalizeServer).filter(Boolean)
          );
          sectionState.sharedServers = Array.isArray(
            nextState.settings?.integrations?.accessible_servers
          )
            ? sortResourcesByEnabledThenVisibilityThenLabel(
                nextState.settings.integrations.accessible_servers
                  .map(normalizeServer)
                  .filter((server) => Boolean(server) && server.enabled !== false)
              )
            : sectionState.sharedServers;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
    sectionState.error = '';
    render();
  };
  const upsertServer = (nextServer) => {
    const normalized = normalizeServer(nextServer);
    if (!normalized.id) return;
    sectionState.servers = upsertItemById(sectionState.servers, normalized);
    sectionState.error = '';
  };

  const mergeSavedServer = (payload, savedServer, existingServer = null) => {
    return normalizeServer({
      ...existingServer,
      ...payload,
      ...savedServer,
      id: firstTruthy(savedServer?.id, existingServer?.id) || '',
      name: firstTruthy(savedServer?.name, payload?.name, existingServer?.name) || '',
      url: firstTruthy(savedServer?.url, payload?.url, existingServer?.url) || '',
      headers: firstTruthy(savedServer?.headers, existingServer?.headers, payload?.headers) || '',
      enabled:
        typeof savedServer?.enabled === 'boolean'
          ? savedServer.enabled
          : (payload?.enabled ?? existingServer?.enabled),
      auth_type:
        firstTruthy(savedServer?.auth_type, payload?.auth_type, existingServer?.auth_type) ||
        'none',
      auth_bearer_token:
        firstTruthy(
          savedServer?.auth_bearer_token,
          payload?.auth_bearer_token,
          existingServer?.auth_bearer_token
        ) || '',
      auth_basic_username:
        firstTruthy(
          savedServer?.auth_basic_username,
          payload?.auth_basic_username,
          existingServer?.auth_basic_username
        ) || '',
      auth_basic_password:
        firstTruthy(
          savedServer?.auth_basic_password,
          payload?.auth_basic_password,
          existingServer?.auth_basic_password
        ) || '',
      oauth_client_name:
        firstTruthy(
          savedServer?.oauth_client_name,
          payload?.oauth_client_name,
          existingServer?.oauth_client_name
        ) || '',
      oauth_scope:
        firstTruthy(savedServer?.oauth_scope, payload?.oauth_scope, existingServer?.oauth_scope) ||
        '',
      oauth_client_id:
        firstTruthy(
          savedServer?.oauth_client_id,
          payload?.oauth_client_id,
          existingServer?.oauth_client_id
        ) || '',
      oauth_client_secret:
        firstTruthy(
          savedServer?.oauth_client_secret,
          payload?.oauth_client_secret,
          existingServer?.oauth_client_secret
        ) || '',
      oauth_token_auth_method:
        firstTruthy(
          savedServer?.oauth_token_auth_method,
          payload?.oauth_token_auth_method,
          existingServer?.oauth_token_auth_method
        ) || '',
      tools: Array.isArray(savedServer?.tools)
        ? savedServer.tools
        : Array.isArray(payload?.tools)
          ? payload.tools
          : Array.isArray(existingServer?.tools)
            ? existingServer.tools
            : [],
      toolsExpanded: Boolean(savedServer?.toolsExpanded ?? existingServer?.toolsExpanded),
      toolsError: String(savedServer?.toolsError || existingServer?.toolsError || '').trim(),
    });
  };

  const removeServer = (serverId) => {
    sectionState.servers = removeItemById(sectionState.servers, serverId);
    sectionState.error = '';
  };

  const modal = createIntegrationsModal({
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
      return render;
    },
  });
  const { closeModal, setSaving, openModal } = modal;

  render();
  loadServers();
}
