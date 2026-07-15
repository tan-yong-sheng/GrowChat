import { apiFetch } from '../../../shared/api.js';
import { buildMcpServerModalMarkup } from '../../../shared/components/server-modal.js';
import { sortResourcesByEnabledThenLabel } from '../../../shared/utils/resource-sort.js';
import { escapeHtml, escapeSelector } from '../../../shared/utils/dom-escape.js';
import { mapSavedToolServers } from './integrations-helpers.js';
import { buildTraceAttrs } from '../../../shared/utils/trace-attrs.js';
import { createIntegrationsModalOps } from './integrations-modal-ops.js';
import { createIntegrationsEventHandlers } from './integrations-event-handlers.js';
import { openToolServerAccessModal } from './integrations-access-modal.js';
import { prepareToolPreview } from '../../../shared/components/tool-preview.js';
import {
  updateServerRowVisibility,
  updateAllToolToggles,
} from '../../../shared/components/integrations-shared.js';

export function renderIntegrationsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'integrations';
  const canManageAcls = data.capabilities?.canManageAcls !== false;
  const integrationsState =
    data.integrationsSettings ||
    (data.integrationsSettings = {
      loading: false,
      error: null,
      toolServers: [],
      loaded: false,
      showModal: false,
      selectedServer: null,
      modalMode: 'create',
    });

  const getToolServersMarkup = () => {
    if (integrationsState.loading) return renderLoadingSkeleton();
    if (integrationsState.toolServers.length === 0) {
      return '<div class="py-10 text-center text-sm text-gray-400">No tool servers configured. Click + to add one.</div>';
    }
    return integrationsState.toolServers
      .map(
        (server) => `
      ${(() => {
        const serverEnabled = server.enabled !== false;
        const tools = Array.isArray(server.tools) ? server.tools : [];
        const enabledCount = tools.filter((tool) => tool.enabled !== false).length;
        const totalCount = tools.length;
        return `
      <div data-tool-server-row="${escapeHtml(server.id)}" class="border-b border-gray-50 last:border-0 ${serverEnabled ? '' : 'opacity-70'}">
        <div class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2">
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2">
              <div class="text-xs font-medium text-gray-900">${escapeHtml(server.name)}</div>
              <span data-server-disabled-badge class="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-label-xs font-semibold uppercase tracking-wide text-gray-500 ${serverEnabled ? 'hidden' : ''}">Disabled</span>
            </div>
            <div class="text-label-sm text-gray-400 font-mono">${escapeHtml(server.url)}</div>
            <div class="text-label-sm text-gray-400 mt-1">
              Tools: <span class="text-gray-900">${enabledCount}</span> / <span class="text-gray-900">${totalCount}</span> enabled
              ${server.toolsError ? `<span class="text-red-500 ml-2">${escapeHtml(server.toolsError)}</span>` : ''}
            </div>
          </div>
          <div class="flex items-center justify-end gap-3 self-end sm:self-auto flex-wrap">
            <button
              data-id="${escapeHtml(server.id)}"
              class="tool-access-btn inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 transition ${serverEnabled && canManageAcls ? '' : 'hidden'}"
              title="Edit access rules"
              aria-label="Edit access rules"
              ${canManageAcls ? '' : 'disabled aria-disabled="true"'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
              </svg>
            </button>
            <button data-id="${escapeHtml(server.id)}" class="edit-server-btn p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition-colors rounded">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
            <button data-id="${escapeHtml(server.id)}" class="server-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${serverEnabled ? 'bg-primary' : 'bg-gray-200'}">
              <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${serverEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
            </button>
            <button data-id="${escapeHtml(server.id)}" class="tools-toggle p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition-colors rounded ml-1" title="Toggle tools">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5 ${server.toolsExpanded ? 'rotate-180' : ''}">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          </div>
        </div>
        <div class="px-2 pb-3 ${server.toolsExpanded ? '' : 'hidden'}">
          ${server.toolsError ? `<div class="text-label-sm text-red-500 mb-2">${server.toolsError}</div>` : ''}
          <div class="space-y-2">
            ${
              tools.length
                ? tools.map((tool) => renderToolMarkup(tool, server.id, serverEnabled)).join('')
                : '<div class="text-xs text-gray-400">No tools loaded. Click verify in Edit MCP Server.</div>'
            }
          </div>
        </div>
      </div>
    `;
      })()}
    `
      )
      .join('');
  };

  const renderToolMarkup = (tool, serverId, serverEnabled) => {
    const { description, preview, hasMore, isExpanded } = prepareToolPreview(tool);
    const toolEnabled = tool.enabled !== false;
    const descriptionMarkup = renderToolDescription(
      tool,
      serverId,
      description,
      preview,
      hasMore,
      isExpanded
    );
    return `
                <div class="rounded-md border border-gray-100 px-3 py-2 ${serverEnabled ? '' : 'bg-gray-50/70'}">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-xs font-medium text-gray-900">${escapeHtml(tool.title || tool.name || 'Tool')}</div>
                      <div class="text-label-sm text-gray-400 font-mono">${escapeHtml(tool.name || '')}</div>
                    </div>
                    ${renderToolToggle(tool, serverId, serverEnabled, toolEnabled)}
                  </div>
                  ${descriptionMarkup}
                </div>
              `;
  };

  function renderToolToggle(tool, serverId, serverEnabled, toolEnabled) {
    const toggleClass = `tool-toggle relative inline-flex h-5 w-9 items-center shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${toolEnabled ? 'bg-primary' : 'bg-gray-200'} ${serverEnabled ? '' : 'opacity-40 cursor-not-allowed'}`;
    const titleAttr = toolToggleTitle(serverEnabled, toolEnabled);
    return `<button
                      data-server-id="${escapeHtml(serverId)}"
                      data-tool-name="${escapeHtml(tool.name || '')}"
                      class="${toggleClass}"
                      ${serverEnabled ? '' : 'disabled'}
                      aria-pressed="${toolEnabled ? 'true' : 'false'}"
                      aria-disabled="${serverEnabled ? 'false' : 'true'}"
                      title="${titleAttr}"
                    >
                      <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toolEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
                    </button>`;
  }

  function toolToggleTitle(serverEnabled, toolEnabled) {
    if (!serverEnabled) return 'Enable the server to edit tools';
    return toolEnabled ? 'Disable tool' : 'Enable tool';
  }

  function renderToolDescription(tool, serverId, description, preview, hasMore, isExpanded) {
    if (!description) return '';
    const moreButton = hasMore
      ? `<button data-server-id="${escapeHtml(serverId)}" data-tool-name="${escapeHtml(tool.name)}" class="tool-desc-toggle text-label-sm text-gray-400 hover:text-gray-600 mt-1">${isExpanded ? 'Less' : 'More'}</button>`
      : '';
    return `<div class="text-label-sm text-gray-500 mt-1">${escapeHtml(preview)}</div>${moreButton}`;
  }

  const updateServerRowState = (serverId) => {
    const row = container.querySelector(`[data-tool-server-row="${escapeSelector(serverId)}"]`);
    const server = integrationsState.toolServers.find((entry) => entry.id === serverId);
    if (!row || !server) return;
    const serverEnabled = server.enabled !== false;
    updateServerRowVisibility(row, serverEnabled, canManageAcls);
    const serverToggle = row.querySelector('.server-toggle');
    if (serverToggle) updateServerToggle(serverToggle, serverEnabled);
    updateAllToolToggles(row, server, serverEnabled);
  };

  const updateToolRowState = (serverId, toolName) => {
    const row = container.querySelector(`[data-tool-server-row="${escapeSelector(serverId)}"]`);
    const server = integrationsState.toolServers.find((entry) => entry.id === serverId);
    if (!row || !server) return;
    const serverEnabled = server.enabled !== false;
    const tool = Array.isArray(server.tools)
      ? server.tools.find((entry) => entry.name === toolName)
      : null;
    if (!tool) return;
    const toggle = row.querySelector(`.tool-toggle[data-tool-name="${escapeSelector(toolName)}"]`);
    if (toggle) updateToolToggle(toggle, tool.enabled !== false, serverEnabled);
  };

  const renderToolServersList = () => {
    const list = container.querySelector('#tool-servers-list');
    if (!list) return;
    list.innerHTML = getToolServersMarkup();
  };

  const render = () => {
    if (!isActiveTab()) return;
    const traceAttrs = buildTraceAttrs({
      route: '/admin/settings/integrations',
      scope: 'admin',
      family: 'mcp-servers',
      owner: 'admin truth',
      read: ['/api/admin/tool-servers', '/api/admin/tool-servers/access'],
      write: ['/api/admin/tool-servers', '/api/admin/tool-servers/access'],
      invalidation: 'tool-server views only',
    });
    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full"${traceAttrs}>
        <div class="pt-0.5 pb-6 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Integrations</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <div class="flex items-center justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage MCP Servers</div>
                <button id="add-tool-server" class="p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition-colors rounded">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              <hr class="border-gray-100/30 my-2" />

              <div id="tool-servers-list" class="space-y-2">
                ${getToolServersMarkup()}
              </div>
            </section>

            <div id="integrations-feedback" class="hidden mt-4 rounded-md border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>

      ${buildMcpServerModalMarkup({
        rootId: 'edit-connection-modal',
        server: integrationsState.selectedServer,
        isVisible: integrationsState.showModal,
        modalMode: integrationsState.modalMode,
      })}

    `;
    bindEvents();
  };

  const loadIntegrations = async () => {
    if (integrationsState.loaded) return;
    integrationsState.loaded = true;
    try {
      const res = await apiFetch('/api/admin/tool-servers?include_disabled=1');
      if (!res.ok) throw new Error('Failed to load tool servers');
      const payload = await res.json();
      integrationsState.toolServers = sortResourcesByEnabledThenLabel(
        mapSavedToolServers(payload?.servers, [])
      );
      if (isActiveTab()) render();
    } catch (err) {
      console.warn('Failed to load tool servers', err);
    } finally {
      if (isActiveTab()) render();
    }
  };

  const modalOps = createIntegrationsModalOps({
    container,
    integrationsState,
    canManageAcls,
    render,
    renderToolServersList,
  });
  const {
    updateServerToggle,
    updateToolToggle,
    sanitizeServers,
    renderLoadingSkeleton,
    showFeedback,
    persistServersImmediate,
    runVerify,
    setTestStatus,
    updateAuthFields,
    fillModalFields,
    openModal,
    closeModal,
  } = modalOps;

  const { bindEvents } = createIntegrationsEventHandlers({
    container,
    integrationsState,
    canManageAcls,
    loadIntegrations,
    render,
    updateServerToggle,
    updateToolToggle,
    updateServerRowState,
    updateToolRowState,
    showFeedback,
    setTestStatus,
    updateAuthFields,
    fillModalFields,
    openModal,
    closeModal,
    openToolServerAccessModal,
    persistServersImmediate,
    runVerify,
    sanitizeServers,
    renderToolServersList,
  });

  render();
  loadIntegrations();
}
