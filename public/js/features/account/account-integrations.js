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
import { renderSettingsActionFooter } from '../../shared/components/settings-action-footer.js';
import { broadcastToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import { createStagedSaveQueue } from '../../shared/utils/staged-save.js';
import { removeItemById, upsertItemById } from '../../shared/utils/list-state.js';
import {
  isResourceHidden,
  isToolHidden,
  normalizeUserResourceOverrides,
  setResourceVisibility,
  setToolVisibility,
} from '../../shared/utils/user-resource-overrides.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeSelector(value) {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw);
  }
  return raw.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function normalizeTool(tool = {}) {
  const name = String(tool.name || tool.id || tool.title || '').trim();
  if (!name) return null;
  return {
    name,
    title: String(tool.title || tool.name || name).trim(),
    description: String(tool.description || '').trim(),
    parameters:
      tool.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters)
        ? tool.parameters
      : (tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)
          ? tool.inputSchema
          : undefined),
    enabled: tool.enabled !== false,
    visible_for_user: tool.visible_for_user !== false,
    hidden_for_user: tool.hidden_for_user === true,
    _expanded: Boolean(tool._expanded),
  };
}

function normalizeToolList(tools = []) {
  return (Array.isArray(tools) ? tools : [])
    .map(normalizeTool)
    .filter(Boolean);
}

function clonePreferences(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(source);
    } catch {
      return { ...source };
    }
  }
  try {
    return JSON.parse(JSON.stringify(source));
  } catch {
    return { ...source };
  }
}

function normalizeServer(server = {}) {
  const headers = server.headers && typeof server.headers === 'object' && !Array.isArray(server.headers)
    ? server.headers
    : server.headers || '';
  return {
    id: String(server.id || '').trim(),
    name: String(server.name || server.id || '').trim(),
    url: String(server.url || '').trim(),
    headers,
    enabled: server.enabled !== false,
    auth_type: String(server.auth_type || 'none').toLowerCase(),
    auth_bearer_token: String(server.auth_bearer_token || '').trim(),
    auth_basic_username: String(server.auth_basic_username || '').trim(),
    auth_basic_password: String(server.auth_basic_password || '').trim(),
    oauth_client_name: String(server.oauth_client_name || '').trim(),
    oauth_scope: String(server.oauth_scope || '').trim(),
    oauth_client_id: String(server.oauth_client_id || '').trim(),
    oauth_client_secret: String(server.oauth_client_secret || '').trim(),
    oauth_token_auth_method: String(server.oauth_token_auth_method || '').trim(),
    note: String(server.note || server.url || '').trim(),
    oauth_connected: Boolean(server.oauth_connected),
    oauth_connected_at: server.oauth_connected_at || null,
    tools: normalizeToolList(server.tools),
    toolsExpanded: Boolean(server.toolsExpanded),
    toolsError: String(server.toolsError || '').trim(),
    visible_for_user: server.visible_for_user !== false,
    hidden_for_user: server.hidden_for_user === true,
  };
}

function providerHint(authType) {
  switch (String(authType || 'none').toLowerCase()) {
    case 'bearer':
      return 'Bearer token';
    case 'basic':
      return 'Username and password';
    case 'oauth':
      return 'OAuth client details';
    default:
      return 'No auth';
  }
}

function shouldShowAuthField(authType, fieldType) {
  return String(authType || 'none').toLowerCase() === fieldType;
}

function renderSummaryPill(text, tone = 'gray') {
  const tones = {
    gray: 'border-gray-200 bg-gray-50 text-gray-500',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
  };
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone] || tones.gray}">${escapeHtml(text)}</span>`;
}

function renderLoadingSkeleton() {
  return `
    <div class="space-y-2">
      ${Array.from({ length: 4 }).map(() => `
        <div class="border-b border-gray-50 last:border-0">
          <div class="py-2.5 flex items-center justify-between pr-2 animate-pulse">
            <div class="flex flex-col min-w-0 flex-1 space-y-2">
              <div class="h-3.5 w-40 bg-gray-200 rounded-full"></div>
              <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
              <div class="h-2.5 w-56 bg-gray-100 rounded-full"></div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="h-6 w-12 rounded-full bg-gray-100 border border-gray-200"></div>
              <div class="h-6 w-6 rounded-full bg-gray-100 border border-gray-200"></div>
              <div class="h-5 w-9 rounded-full bg-gray-100 border border-gray-200"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildFormMarkup(server = null, modalMode = 'create', canManage = true) {
  return buildMcpServerModalMarkup({
    rootId: 'account-integration-modal',
    server,
    isVisible: true,
    modalMode,
    canManage,
  });
}

function buildListCard(server, canManageToolServers = true, { scope = 'personal', hiddenForUser = false } = {}) {
  const serverEnabled = server.enabled !== false;
  const tools = Array.isArray(server.tools) ? server.tools : [];
  const visibleTools = tools.filter((tool) => tool.enabled !== false && tool.visible_for_user !== false);
  const totalCount = tools.filter((tool) => tool.enabled !== false).length;
  const enabledCount = visibleTools.length;
  const actionButtonClass = canManageToolServers
    ? 'p-1 text-gray-600 hover:text-gray-700 transition-colors'
    : 'p-1 text-gray-300 opacity-50 cursor-not-allowed';
  const isShared = scope === 'shared';
  const sharedToggleClass = 'relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none';
  const toggleClass = canManageToolServers || isShared
    ? `relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${serverEnabled ? 'bg-black' : 'bg-gray-200'}`
    : 'relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-200 opacity-50';
  const toggleOn = isShared ? !hiddenForUser : serverEnabled;
  const toggleLabel = isShared ? (hiddenForUser ? 'Show for me' : 'Hide for me') : (serverEnabled ? 'Disable server' : 'Enable server');
  const toolRows = tools.map((tool) => {
    const description = String(tool.description || '');
    const maxLen = 160;
    const isExpanded = Boolean(tool._expanded);
    const hasMore = description.length > maxLen;
    const preview = hasMore && !isExpanded
      ? `${description.slice(0, maxLen).trimEnd()}…`
      : description;
    const toolEnabled = tool.enabled !== false;
    if (isShared) {
      const toolVisible = tool.visible_for_user !== false;
      const canToggleVisibility = tool.enabled !== false;
      return `
        <div class="rounded-xl border border-gray-100 px-3 py-2 ${toolVisible ? 'bg-white' : 'bg-gray-50/60 opacity-75'}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs font-medium text-gray-900">${escapeHtml(tool.title || tool.name || 'Tool')}</div>
              <div class="text-[10px] text-gray-600 font-mono">${escapeHtml(tool.name || '')}</div>
            </div>
            <button
              type="button"
              data-tool-toggle-scope="shared"
              data-server-id="${escapeHtml(server.id)}"
              data-tool-name="${escapeHtml(tool.name || '')}"
              aria-pressed="${toolVisible ? 'true' : 'false'}"
              aria-label="${escapeHtml(toolVisible ? 'Hide for me' : 'Show for me')}"
              title="${escapeHtml(toolVisible ? 'Hide for me' : 'Show for me')}"
              class="relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${toolVisible ? 'bg-black' : 'bg-gray-200'} ${canToggleVisibility ? '' : 'opacity-40 cursor-not-allowed'}"
              ${canToggleVisibility ? '' : 'disabled aria-disabled="true"'}
            >
              <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toolVisible ? 'translate-x-4' : 'translate-x-0'}"></span>
            </button>
          </div>
          ${description ? `<div class="text-[11px] text-gray-600 mt-1">${escapeHtml(preview)}</div>` : ''}
        </div>
      `;
    }
    return `
      <div class="rounded-xl border border-gray-100 px-3 py-2 ${serverEnabled ? '' : 'bg-gray-50/70'}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-medium text-gray-900">${escapeHtml(tool.title || tool.name || 'Tool')}</div>
            <div class="text-[10px] text-gray-600 font-mono">${escapeHtml(tool.name || '')}</div>
          </div>
          <button
            data-server-id="${escapeHtml(server.id)}"
            data-tool-name="${escapeHtml(tool.name || '')}"
            class="tool-toggle relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${toolEnabled ? 'bg-black' : 'bg-gray-200'} ${serverEnabled && canManageToolServers ? '' : 'opacity-40 cursor-not-allowed'}"
            ${serverEnabled && canManageToolServers ? '' : 'disabled aria-disabled="true"'}
            aria-pressed="${toolEnabled ? 'true' : 'false'}"
            aria-disabled="${serverEnabled && canManageToolServers ? 'false' : 'true'}"
            title="${serverEnabled && canManageToolServers ? (toolEnabled ? 'Disable tool' : 'Enable tool') : 'Enable the server to edit tools'}"
          >
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toolEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
        </div>
        ${description ? `
          <div class="text-[11px] text-gray-500 mt-1">${escapeHtml(preview)}</div>
          ${hasMore ? `<button data-server-id="${escapeHtml(server.id)}" data-tool-name="${escapeHtml(tool.name || '')}" class="tool-desc-toggle text-[10px] text-gray-600 hover:text-gray-700 mt-1">${isExpanded ? 'Less' : 'More'}</button>` : ''}
        ` : ''}
      </div>
    `;
  });
  return `
    <div data-tool-server-row="${escapeHtml(server.id)}" data-id="${escapeHtml(server.id)}" class="border-b border-gray-50 last:border-0 ${serverEnabled ? '' : 'opacity-70'} ${isShared && hiddenForUser ? 'opacity-70' : ''}">
      <div class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2">
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-xs font-medium text-gray-900">${escapeHtml(server.name || server.id || 'Integration')}</div>
            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isShared ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}">${isShared ? 'Shared' : 'Personal'}</span>
            <span data-server-disabled-badge class="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${serverEnabled ? 'hidden' : ''} border-gray-200 bg-gray-100 text-gray-500">Disabled</span>
          </div>
          <div class="text-[10px] text-gray-600 font-mono">${escapeHtml(server.url || '')}</div>
          <div class="text-[10px] text-gray-600 mt-1">
            Tools: <span class="text-gray-900">${serverEnabled ? enabledCount : 0}</span> / <span class="text-gray-900">${totalCount}</span> ${serverEnabled ? 'enabled' : 'available'}
            ${server.toolsError ? '<span class="text-red-500 ml-2">Last verify failed</span>' : ''}
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 self-end sm:self-auto flex-wrap">
          ${!isShared ? `
            <button
              type="button"
              data-list-action="edit"
              data-account-integration-edit="${escapeHtml(server.id)}"
              class="${actionButtonClass}"
              ${canManageToolServers ? '' : 'disabled aria-disabled="true"'}
            >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          ` : ''}
          <button data-id="${escapeHtml(server.id)}" data-toggle-scope="${scope}" class="server-toggle ${isShared ? `${sharedToggleClass} ${toggleOn ? 'bg-black' : 'bg-gray-200'}` : toggleClass}" ${isShared || canManageToolServers ? '' : 'disabled aria-disabled="true"'} aria-pressed="${toggleOn ? 'true' : 'false'}" aria-label="${escapeHtml(toggleLabel)}">
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toggleOn ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
          ${tools.length ? `
            <button data-id="${escapeHtml(server.id)}" class="tools-toggle p-1 text-gray-600 hover:text-gray-700 transition-colors ml-1" title="Toggle tools">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4 ${server.toolsExpanded ? 'rotate-180' : ''}">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      ${tools.length ? `
        <div class="px-2 pb-3 ${server.toolsExpanded ? '' : 'hidden'}">
          ${server.toolsError ? `<div class="text-[11px] text-red-500 mb-2">${escapeHtml(server.toolsError)}</div>` : ''}
          <div class="space-y-2">
            ${toolRows.join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderAccountIntegrationsSection(container, state = {}, { onRefresh, footerHost, routeCache } = {}) {
  const capabilities = normalizeWorkspaceCapabilities(state.capabilities, { route: 'account' });
  const canManageToolServers = capabilities.canManageToolServers !== false;
  const sectionState = {
    loading: false,
    saving: false,
    error: '',
    servers: Array.isArray(state.settings?.integrations?.servers)
      ? state.settings.integrations.servers.map(normalizeServer).filter(Boolean)
      : [],
    sharedServers: Array.isArray(state.settings?.integrations?.accessible_servers)
      ? state.settings.integrations.accessible_servers.map(normalizeServer).filter(Boolean)
      : [],
  };
  const stagedPreferencesSave = createStagedSaveQueue({
    getSnapshot: () => clonePreferences(state.settings?.preferences || {}),
    saveSnapshot: async (preferences) => {
      const res = await apiFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({ preferences }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to update shared integration visibility');
      }
      return res.json().catch(() => ({}));
    },
    onCommit: (snapshot, _version, payload = {}) => {
      state.settings = {
        ...(state.settings || {}),
        preferences: payload?.user?.preferences || snapshot,
      };
      sectionState.error = '';
      broadcastToolServersInvalidation();
      syncListShell();
      syncFeedback();
      syncActionFooter();
    },
    onError: (error) => {
      sectionState.error = error?.message || 'Failed to update shared integration visibility';
      syncFeedback();
      syncActionFooter();
    },
  });

  let activeModal = null;
  const ensureMounted = () => container.dataset.integrationsMounted === '1' && Boolean(container.querySelector('#tool-servers-list'));
  const hasChanges = () => stagedPreferencesSave.pending;

  const syncFeedback = () => {
    const feedback = container.querySelector('#integrations-feedback');
    if (!feedback) return;
    feedback.classList.toggle('hidden', !sectionState.error);
    feedback.textContent = sectionState.error || '';
    if (sectionState.error) {
      feedback.className = 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
    }
  };

  const syncHeaderButtons = () => {
    const addBtn = container.querySelector('#add-tool-server');
    if (addBtn) {
      addBtn.classList.toggle('text-gray-300', !canManageToolServers);
      addBtn.classList.toggle('opacity-50', !canManageToolServers);
      addBtn.classList.toggle('cursor-not-allowed', !canManageToolServers);
      addBtn.disabled = !canManageToolServers;
      addBtn.setAttribute('aria-disabled', canManageToolServers ? 'false' : 'true');
    }
  };

  const syncListState = (serverId) => {
    const row = container.querySelector(`[data-tool-server-row="${escapeSelector(serverId)}"]`);
    const server = sectionState.servers.find((entry) => entry.id === serverId)
      || sectionState.sharedServers.find((entry) => entry.id === serverId);
    if (!row || !server) return;
    const serverEnabled = server.enabled !== false;
    const isShared = row.querySelector('[data-toggle-scope="shared"]') !== null;
    row.classList.toggle('opacity-70', !serverEnabled || (isShared && isResourceHidden(state.settings?.preferences || {}, 'tool_servers', serverId)));
    const badge = row.querySelector('[data-server-disabled-badge]');
    if (badge) badge.classList.toggle('hidden', serverEnabled);
    const accessBtn = row.querySelector('.tool-access-btn');
    if (accessBtn) accessBtn.classList.toggle('hidden', !serverEnabled || !canManageAcls || isShared);
    const serverToggle = row.querySelector('.server-toggle');
    if (serverToggle) {
      const toggleOn = isShared
        ? !isResourceHidden(state.settings?.preferences || {}, 'tool_servers', serverId)
        : serverEnabled;
      serverToggle.classList.toggle('bg-black', toggleOn);
      serverToggle.classList.toggle('bg-gray-200', !toggleOn);
      serverToggle.setAttribute('aria-pressed', toggleOn ? 'true' : 'false');
      const knob = serverToggle.querySelector('span');
      if (knob) {
        knob.classList.toggle('translate-x-4', toggleOn);
        knob.classList.toggle('translate-x-0', !toggleOn);
      }
    }
    row.querySelectorAll('.tool-toggle').forEach((toggle) => {
      const toolName = toggle.dataset.toolName;
      const tool = Array.isArray(server.tools) ? server.tools.find((entry) => entry.name === toolName) : null;
      const toolEnabled = tool ? tool.enabled !== false : false;
      updateToolToggle(toggle, toolEnabled, serverEnabled);
    });
    const toolsToggle = row.querySelector('.tools-toggle svg');
    if (toolsToggle) {
      toolsToggle.classList.toggle('rotate-180', Boolean(server.toolsExpanded));
    }
  };

  const syncListShell = () => {
    const list = container.querySelector('#tool-servers-list');
    if (!list) return;
    const normalizedOverrides = normalizeUserResourceOverrides(state.settings?.preferences);
    const hiddenSharedIds = new Set(normalizedOverrides.tool_servers.hidden_ids || []);
    const hiddenSharedToolIdsByServer = normalizedOverrides.tool_servers.tools || {};
    const personalMarkup = sectionState.loading
      ? renderLoadingSkeleton()
      : sectionState.servers.length
        ? sectionState.servers.map((server) => buildListCard(server, canManageToolServers)).join('')
        : '<div class="py-10 text-center text-sm text-gray-400">No tool servers configured. Click + to add one.</div>';
    const sharedMarkup = sectionState.sharedServers.length
      ? sectionState.sharedServers.map((server) => {
        const serverId = String(server.id || '').trim();
        const hiddenToolIds = new Set(hiddenSharedToolIdsByServer?.[serverId]?.hidden_ids || []);
        return buildListCard({
          ...server,
          tools: (Array.isArray(server.tools) ? server.tools : []).map((tool) => ({
            ...tool,
            visible_for_user: !hiddenToolIds.has(String(tool?.name || '').trim()),
            hidden_for_user: hiddenToolIds.has(String(tool?.name || '').trim()),
          })),
        }, canManageToolServers, {
          scope: 'shared',
          hiddenForUser: hiddenSharedIds.has(server.id),
        });
      }).join('')
      : '';
    list.innerHTML = `${personalMarkup}${sharedMarkup ? `<div class="mt-3 space-y-2">${sharedMarkup}</div>` : ''}`;
  };

  const syncActionFooter = () => {
    if (!footerHost) return;
    footerHost.innerHTML = renderSettingsActionFooter({
      footerId: 'integrations-footer-actions',
      dirtyId: 'integrations-dirty',
      saveId: 'save-integrations',
      dirtyLabel: 'Unsaved changes',
      buttonLabel: 'Save',
      dirty: hasChanges(),
      saving: stagedPreferencesSave.saving,
      canSave: canManageToolServers && hasChanges(),
    });
    footerHost.querySelector('#save-integrations')?.addEventListener('click', async () => {
      if (!canManageToolServers || stagedPreferencesSave.saving || !hasChanges()) return;
      try {
        await stagedPreferencesSave.flush();
      } catch {
        // Errors are surfaced by the queue callbacks.
      }
    });
  };

  const bindDelegatedEvents = () => {
    if (container.dataset.integrationsEventsBound === '1') return;
    container.dataset.integrationsEventsBound = '1';

    const list = container.querySelector('#tool-servers-list');
    list?.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const toolToggle = target.closest('.tool-toggle, [data-tool-toggle-scope]');
      if (toolToggle) {
        const id = toolToggle.dataset.serverId || toolToggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
        const toolName = toolToggle.dataset.toolName;
        const scope = toolToggle.dataset.toolToggleScope || 'personal';
        if (scope === 'shared') {
          const currentHidden = isToolHidden(state.settings?.preferences || {}, id, toolName);
          const nextVisible = currentHidden;
          const nextPreferences = setToolVisibility(state.settings?.preferences || {}, id, toolName, nextVisible);
          state.settings = {
            ...(state.settings || {}),
            preferences: nextPreferences,
          };
          sectionState.error = '';
          syncListShell();
          syncActionFooter();
          stagedPreferencesSave.stage();
          syncActionFooter();
          return;
        }
        const server = sectionState.servers.find((entry) => entry.id === id);
        if (server && server.enabled !== false && Array.isArray(server.tools)) {
          const tool = server.tools.find((entry) => entry.name === toolName);
          if (tool) {
            tool.enabled = tool.enabled === false;
            syncListState(id);
            syncActionFooter();
          }
        }
        return;
      }

      const toggle = target.closest('.server-toggle');
      if (toggle) {
        const id = toggle.dataset.id || toggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
        const scope = toggle.dataset.toggleScope || 'personal';
        if (scope === 'shared') {
          const currentHidden = isResourceHidden(state.settings?.preferences || {}, 'tool_servers', id);
          const nextVisible = currentHidden;
          const nextPreferences = setResourceVisibility(state.settings?.preferences || {}, 'tool_servers', id, nextVisible);
          state.settings = {
            ...(state.settings || {}),
            preferences: nextPreferences,
          };
          sectionState.error = '';
          syncListShell();
          syncActionFooter();
          stagedPreferencesSave.stage();
          syncActionFooter();
          return;
        }
        if (!canManageToolServers) return;
        const server = sectionState.servers.find((entry) => entry.id === id);
        if (!server) return;
        const previousEnabled = server.enabled !== false;
        const nextEnabled = !previousEnabled;
        server.enabled = nextEnabled;
        syncListState(id);
        syncActionFooter();
        void (async () => {
          try {
            await updateUserMcpServer(server.id, { enabled: nextEnabled });
            broadcastToolServersInvalidation();
          } catch (err) {
            server.enabled = previousEnabled;
            sectionState.error = err?.message || 'Failed to update integration';
          } finally {
            syncListState(id);
            syncFeedback();
            syncActionFooter();
          }
        })();
        return;
      }

      const toolsToggle = target.closest('.tools-toggle');
      if (toolsToggle) {
        const id = toolsToggle.dataset.id || toolsToggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
        const server = sectionState.servers.find((entry) => entry.id === id)
          || sectionState.sharedServers.find((entry) => entry.id === id);
        if (server) {
          server.toolsExpanded = !server.toolsExpanded;
          syncListShell();
        }
        return;
      }

      const descToggle = target.closest('.tool-desc-toggle');
      if (descToggle) {
        const serverId = descToggle.dataset.serverId || descToggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
        const toolName = descToggle.dataset.toolName;
        const server = sectionState.servers.find((entry) => entry.id === serverId);
        if (server && Array.isArray(server.tools)) {
          const tool = server.tools.find((entry) => entry.name === toolName);
          if (tool) {
            tool._expanded = !tool._expanded;
            syncListShell();
          }
        }
        return;
      }

      const editBtn = target.closest('[data-account-integration-edit], .edit-server-btn');
      if (editBtn) {
        const id = editBtn.dataset.accountIntegrationEdit || editBtn.dataset.id || editBtn.closest('[data-tool-server-row]')?.dataset.id;
        const server = sectionState.servers.find((entry) => entry.id === id);
        openModal(server || null);
        return;
      }

      const accessBtn = target.closest('.tool-access-btn');
      if (accessBtn) {
        if (!canManageAcls) return;
        const id = accessBtn.dataset.id;
        const server = sectionState.servers.find((entry) => entry.id === id);
        if (server) {
          void openToolServerAccessModal(server, {
            onApply: async (rules) => {
              aclDraftRegistry.stage(server.id, rules);
              syncActionFooter();
            },
          });
        }
      }
    });

    container.querySelector('#add-tool-server')?.addEventListener('click', () => {
      if (!canManageToolServers) return;
      openModal(null);
    });
  };

  const loadServers = async () => {
    sectionState.loading = true;
    sectionState.error = '';
    render();
    try {
      const payload = await fetchUserMcpServers({ cache: 'no-store' });
      sectionState.servers = Array.isArray(payload?.servers)
        ? payload.servers.map(normalizeServer).filter(Boolean)
        : [];
      sectionState.sharedServers = Array.isArray(payload?.accessible_servers)
        ? payload.accessible_servers.map(normalizeServer).filter(Boolean)
        : [];
    } catch (err) {
      sectionState.error = err?.message || 'Failed to load integrations';
    } finally {
      sectionState.loading = false;
      render();
    }
  };

  const render = () => {
    if (!ensureMounted()) {
      container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        ${sectionState.error ? renderErrorBanner({ message: sectionState.error }) : '<div id="integrations-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>'}
        <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
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

              <div id="tool-servers-list" class="space-y-2 overflow-y-auto overflow-x-hidden pr-1" style="max-height: calc(100dvh - 20rem); scrollbar-gutter: stable;">
                ${sectionState.loading ? renderLoadingSkeleton() : ''}
              </div>
            </section>

            <div id="integrations-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
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
  };

  const refreshServers = async () => {
    try {
      const payload = await fetchUserMcpServers({ cache: 'no-store' });
      sectionState.servers = Array.isArray(payload?.servers)
        ? payload.servers.map(normalizeServer).filter(Boolean)
        : [];
      sectionState.sharedServers = Array.isArray(payload?.accessible_servers)
        ? payload.accessible_servers.map(normalizeServer).filter(Boolean)
        : [];
    } catch (err) {
      if (typeof onRefresh === 'function') {
        const nextState = await onRefresh();
        if (nextState?.settings?.integrations?.servers) {
          sectionState.servers = nextState.settings.integrations.servers.map(normalizeServer).filter(Boolean);
          sectionState.sharedServers = Array.isArray(nextState.settings?.integrations?.accessible_servers)
            ? nextState.settings.integrations.accessible_servers.map(normalizeServer).filter(Boolean)
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

  routeCache?.registerToolServersRefresh?.(async () => {
    await refreshServers();
  });

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
      id: savedServer?.id || existingServer?.id || '',
      name: savedServer?.name || payload.name || existingServer?.name || '',
      url: savedServer?.url || payload.url || existingServer?.url || '',
      headers: savedServer?.headers || existingServer?.headers || payload.headers || '',
      enabled: typeof savedServer?.enabled === 'boolean'
        ? savedServer.enabled
        : (payload.enabled ?? existingServer?.enabled),
      auth_type: savedServer?.auth_type || payload.auth_type || existingServer?.auth_type || 'none',
      auth_bearer_token: savedServer?.auth_bearer_token || payload.auth_bearer_token || existingServer?.auth_bearer_token || '',
      auth_basic_username: savedServer?.auth_basic_username || payload.auth_basic_username || existingServer?.auth_basic_username || '',
      auth_basic_password: savedServer?.auth_basic_password || payload.auth_basic_password || existingServer?.auth_basic_password || '',
      oauth_client_name: savedServer?.oauth_client_name || payload.oauth_client_name || existingServer?.oauth_client_name || '',
      oauth_scope: savedServer?.oauth_scope || payload.oauth_scope || existingServer?.oauth_scope || '',
      oauth_client_id: savedServer?.oauth_client_id || payload.oauth_client_id || existingServer?.oauth_client_id || '',
      oauth_client_secret: savedServer?.oauth_client_secret || payload.oauth_client_secret || existingServer?.oauth_client_secret || '',
      oauth_token_auth_method: savedServer?.oauth_token_auth_method || payload.oauth_token_auth_method || existingServer?.oauth_token_auth_method || '',
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

  const closeModal = () => {
    activeModal?.remove();
    activeModal = null;
  };

  const setSaving = (saving, saveBtn, deleteBtn) => {
    sectionState.saving = saving;
    if (saveBtn) {
      saveBtn.disabled = saving;
      saveBtn.textContent = saving ? 'Saving...' : 'Save';
      saveBtn.classList.toggle('opacity-60', saving);
      saveBtn.classList.toggle('cursor-not-allowed', saving);
    }
    if (deleteBtn) {
      deleteBtn.disabled = saving;
      deleteBtn.classList.toggle('opacity-60', saving);
      deleteBtn.classList.toggle('cursor-not-allowed', saving);
    }
  };

  const openModal = (server = null) => {
    if (!canManageToolServers) return;
    closeModal();
    const isEdit = Boolean(server?.id);
    const modalMarkup = buildFormMarkup(server, isEdit ? 'update' : 'create', canManageToolServers);
    const modalWrapper = document.createElement('div');
    modalWrapper.innerHTML = modalMarkup.trim();
    const modal = modalWrapper.firstElementChild;
    container.appendChild(modal);

    activeModal = modal;
    const bodyEl = modal;
    const overlay = modal.querySelector('.absolute.inset-0');
    const authTypeSelect = bodyEl?.querySelector('#server-auth-type');
    const saveBtn = modal.querySelector('#save-modal');
    const deleteBtn = modal.querySelector('#delete-server');
    const closeBtn = modal.querySelector('#close-modal');
    const testBtn = modal.querySelector('#test-server');
    const nameInput = bodyEl?.querySelector('#server-name');
    const urlInput = bodyEl?.querySelector('#server-url');
    const headersInput = bodyEl?.querySelector('#server-headers');
    const bearerInput = bodyEl?.querySelector('#server-auth-bearer');
    const basicUserInput = bodyEl?.querySelector('#server-auth-basic-username');
    const basicPassInput = bodyEl?.querySelector('#server-auth-basic-password');
    const oauthClientNameInput = bodyEl?.querySelector('#server-auth-oauth-client-name');
    const oauthScopeInput = bodyEl?.querySelector('#server-auth-oauth-scope');
    const oauthClientIdInput = bodyEl?.querySelector('#server-auth-oauth-client-id');
    const oauthClientSecretInput = bodyEl?.querySelector('#server-auth-oauth-client-secret');
    const oauthTokenMethodSelect = bodyEl?.querySelector('#server-auth-oauth-token-method');
    const oauthStatus = bodyEl?.querySelector('#oauth-status');
    const oauthConnectBtn = bodyEl?.querySelector('#connect-oauth');
    const bearerToggleBtn = bodyEl?.querySelector('#toggle-bearer-visibility');
    const basicToggleBtn = bodyEl?.querySelector('#toggle-basic-visibility');

    const updateToggleLabel = (button, input) => {
      if (!button || !input) return;
      button.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
      const label = button.querySelector('[data-password-toggle-label]');
      if (label) label.textContent = input.type === 'password' ? 'Show' : 'Hide';
    };

    const setTestStatus = (status, message = '') => {
      const messageEl = bodyEl?.querySelector('#server-test-message');
      if (!messageEl) return;
      messageEl.textContent = message || '';
      messageEl.className = 'text-[11px] hidden';
      if (!message) {
        return;
      }
      messageEl.classList.remove('hidden');
      messageEl.classList.add(
        status === 'success'
          ? 'text-gray-900'
          : status === 'testing'
            ? 'text-gray-400'
            : 'text-red-500'
      );
    };

    const updateAuthFields = (authType = authTypeSelect?.value || 'none') => {
      const bearer = bodyEl?.querySelector('#auth-bearer-fields');
      const basic = bodyEl?.querySelector('#auth-basic-fields');
      const oauth = bodyEl?.querySelector('#auth-oauth-fields');
      if (bearer) bearer.classList.toggle('hidden', !shouldShowAuthField(authType, 'bearer'));
      if (basic) basic.classList.toggle('hidden', !shouldShowAuthField(authType, 'basic'));
      if (oauth) oauth.classList.toggle('hidden', !shouldShowAuthField(authType, 'oauth'));
    };

    const buildPayload = () => {
      const payload = {
        name: String(nameInput?.value || '').trim(),
        url: String(urlInput?.value || '').trim(),
        headers: String(headersInput?.value || '').trim(),
        enabled: true,
        auth_type: String(authTypeSelect?.value || 'none').trim().toLowerCase(),
        auth_bearer_token: String(bearerInput?.value || '').trim(),
        auth_basic_username: String(basicUserInput?.value || '').trim(),
        auth_basic_password: String(basicPassInput?.value || ''),
        oauth_client_name: String(oauthClientNameInput?.value || '').trim(),
        oauth_scope: String(oauthScopeInput?.value || '').trim(),
        oauth_client_id: String(oauthClientIdInput?.value || '').trim(),
        oauth_client_secret: String(oauthClientSecretInput?.value || ''),
        oauth_token_auth_method: String(oauthTokenMethodSelect?.value || '').trim(),
      };
      if (!payload.headers) delete payload.headers;
      if (!payload.auth_bearer_token) delete payload.auth_bearer_token;
      if (!payload.auth_basic_username) delete payload.auth_basic_username;
      if (!payload.auth_basic_password) delete payload.auth_basic_password;
      if (!payload.oauth_client_name) delete payload.oauth_client_name;
      if (!payload.oauth_scope) delete payload.oauth_scope;
      if (!payload.oauth_client_id) delete payload.oauth_client_id;
      if (!payload.oauth_client_secret) delete payload.oauth_client_secret;
      if (!payload.oauth_token_auth_method) delete payload.oauth_token_auth_method;
      return payload;
    };

    const saveServer = async () => {
      const payload = buildPayload();
      if (!payload.name) throw new Error('Name is required');
      if (!payload.url) throw new Error('URL is required');
      if (!/^https?:\/\//i.test(payload.url)) {
        throw new Error('URL must start with http:// or https://');
      }
      const verifiedTools = normalizeToolList((await testUserMcpServer(payload))?.tools);
      payload.tools = verifiedTools.length
        ? verifiedTools
        : normalizeToolList(server?.tools);
      if (isEdit) {
        return {
          payload,
          result: await updateUserMcpServer(server.id, payload),
        };
      }
      return {
        payload,
        result: await createUserMcpServer(payload),
      };
    };

    const testServer = async () => {
      const payload = buildPayload();
      if (!payload.url) throw new Error('URL is required');
      const result = await testUserMcpServer(payload);
      const discoveredTools = normalizeToolList(result?.tools);
      const message = Array.isArray(result?.tools)
        ? `Connection successful: ${discoveredTools.length} tools`
        : 'Connection successful';
      setTestStatus('success', message);
    };

    const finishAndRender = () => {
      closeModal();
      render();
    };

    saveBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      setTestStatus('idle', '');
      setSaving(true, saveBtn, deleteBtn);
      try {
        const { payload, result } = await saveServer();
        const savedServer = result?.server || result?.saved_server || result?.data?.server || null;
        if (savedServer || isEdit) {
          upsertServer(mergeSavedServer(payload, savedServer, isEdit ? server : null));
        }
        broadcastToolServersInvalidation();
        finishAndRender();
      } catch (err) {
        setTestStatus('error', err?.message || 'Failed to save integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    testBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      setTestStatus('idle', '');
      setSaving(true, saveBtn, deleteBtn);
      try {
        await testServer();
      } catch (err) {
        setTestStatus('error', err?.message || 'Failed to test integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (sectionState.saving || !isEdit) return;
      if (!window.confirm(`Delete integration ${server.name || server.id}? This cannot be undone.`)) return;
      setTestStatus('idle', '');
      setSaving(true, saveBtn, deleteBtn);
      try {
        await deleteUserMcpServer(server.id);
        removeServer(server.id);
        broadcastToolServersInvalidation();
        finishAndRender();
      } catch (err) {
        setTestStatus('error', err?.message || 'Failed to delete integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);
    authTypeSelect?.addEventListener('change', (e) => {
      updateAuthFields(e.target.value);
    });
    bearerToggleBtn?.addEventListener('click', () => {
      if (!bearerInput) return;
      bearerInput.type = bearerInput.type === 'password' ? 'text' : 'password';
      updateToggleLabel(bearerToggleBtn, bearerInput);
    });
    basicToggleBtn?.addEventListener('click', () => {
      if (!basicPassInput) return;
      basicPassInput.type = basicPassInput.type === 'password' ? 'text' : 'password';
      updateToggleLabel(basicToggleBtn, basicPassInput);
    });
    updateToggleLabel(bearerToggleBtn, bearerInput);
    updateToggleLabel(basicToggleBtn, basicPassInput);
    oauthConnectBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      if (authTypeSelect?.value !== 'oauth') return;
      const serverId = server?.id || '';
      if (!serverId) {
        setTestStatus('error', 'Save the server before connecting OAuth');
        return;
      }
      try {
        const res = await apiFetch('/api/users/me/resources/mcp-servers/oauth/start', {
          method: 'POST',
          body: JSON.stringify({
            id: serverId,
            name: String(nameInput?.value || '').trim(),
            url: String(urlInput?.value || '').trim(),
            headers: String(headersInput?.value || '').trim(),
            enabled: true,
            auth_type: 'oauth',
            auth_bearer_token: String(bearerInput?.value || '').trim(),
            auth_basic_username: String(basicUserInput?.value || '').trim(),
            auth_basic_password: String(basicPassInput?.value || ''),
            oauth_client_name: String(oauthClientNameInput?.value || '').trim(),
            oauth_scope: String(oauthScopeInput?.value || '').trim(),
            oauth_client_id: String(oauthClientIdInput?.value || '').trim(),
            oauth_client_secret: String(oauthClientSecretInput?.value || '').trim(),
            oauth_token_auth_method: String(oauthTokenMethodSelect?.value || '').trim(),
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || payload.message || 'OAuth start failed');
        }
        if (payload.authorization_url) {
          window.open(payload.authorization_url, '_blank', 'noopener,noreferrer');
          if (oauthStatus) oauthStatus.textContent = 'Awaiting authorization...';
          setTestStatus('success', 'OAuth authorization started');
        }
      } catch (err) {
        setTestStatus('error', err?.message || 'OAuth start failed');
      }
    });
    updateAuthFields();
    return modal;
  };

  render();
  loadServers();
}

