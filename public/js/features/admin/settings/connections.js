import { apiFetch } from '../../../shared/api.js';
import { escapeHtml } from '../../../shared/utils/dom-escape.js';
import { buildConnectionModalBodyMarkup } from '../../../shared/components/connection-modal.js';
import { sortResourcesByEnabledThenLabel } from '../../../shared/utils/resource-sort.js';
import { renderButton } from '../../../shared/components/button.js';
import {
  connectionApiTypeDetails,
  normalizeConnectionRecord,
  providerDisplayLabel,
} from './connections-helpers.js';
import { createConnectionsModalOps } from './connections-modal-ops.js';
import { createConnectionsEventHandlers } from './connections-event-handlers.js';

export function renderConnectionsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'connections';
  const canManageAcls = data.capabilities?.canManageAcls !== false;
  const connectionsState =
    data.connectionsSettings ||
    (data.connectionsSettings = {
      loading: false,
      error: null,
      openai: {
        enabled: true,
        connections: [],
      },
      loaded: false,
      showModal: false,
      selectedConnection: null,
      modalModels: [],
      modalModelsLoading: false,
      modalModelsError: null,
      modalModelsSelection: new Set(),
      modalModelsOriginal: new Set(),
      modalModelsConnectionId: null,
      modalSaving: false,
      modalModelsQuery: '',
      modelOverrides: new Map(),
      modalMode: 'create',
    });

  // Migration for old state format
  if (connectionsState.openai && !connectionsState.openai.connections) {
    const oldUrl = connectionsState.openai.url || 'https://api.openai.com/v1';
    const oldKey = connectionsState.openai.key || '';
    connectionsState.openai.connections = [
      {
        id: 'default',
        name: 'OpenAI',
        url: oldUrl,
        key: oldKey,
        headers: '',
        providerType: 'openai',
        apiType: connectionApiTypeDetails('openai').value,
      },
    ];
    delete connectionsState.openai.url;
    delete connectionsState.openai.key;
  }

  const renderLoadingSkeleton = () => `
    <div class="space-y-2">
      ${Array.from({ length: 5 })
        .map(
          () => `
        <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 animate-pulse">
          <div class="flex flex-col min-w-0 flex-1 space-y-2">
            <div class="h-3.5 w-44 bg-gray-200 rounded-full"></div>
            <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
            <div class="h-2.5 w-32 bg-gray-100 rounded-full"></div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="h-6 w-12 rounded-full bg-gray-100 border border-gray-200"></div>
            <div class="h-6 w-6 rounded-full bg-gray-100 border border-gray-200"></div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;

  const getConnectionsListMarkup = () => {
    if (connectionsState.loading) {
      return renderLoadingSkeleton();
    }
    if (connectionsState.openai.connections.length === 0) {
      return '<div class="py-10 text-center text-sm text-gray-700">No connections configured</div>';
    }
    const deduped = new Map();
    connectionsState.openai.connections.forEach((conn) => {
      const key = `${conn?.source || 'manual'}::${conn?.id || ''}::${conn?.url || ''}`;
      if (!deduped.has(key)) deduped.set(key, conn);
    });
    return Array.from(deduped.values())
      .map((conn) => {
        const safeId = escapeHtml(conn.id);
        const safeName = escapeHtml(conn.name || providerDisplayLabel(conn.providerType));
        const safeUrl = escapeHtml(conn.url || '');
        const safeProvider = escapeHtml(providerDisplayLabel(conn.providerType));
        return `
      <div data-connection-row="${safeId}" class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2 border-b border-gray-50 last:border-0 ${conn.enabled === false ? 'opacity-70' : ''}">
        <div class="flex flex-col min-w-0">
          <div class="text-xs font-medium text-gray-900">${safeName}</div>
          <div class="text-[10px] text-gray-700 font-mono">${safeUrl}</div>
          <div class="text-[10px] text-gray-700 mt-0.5">${safeProvider}</div>
          <div data-connection-disabled-badge class="mt-0.5 inline-flex w-fit items-center rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-700 ${conn.enabled === false ? '' : 'hidden'}">Disabled</div>
          ${conn.readOnly ? '<div class="text-[10px] text-gray-700 mt-0.5">Read-only connection</div>' : ''}
        </div>
        <div class="flex items-center justify-end gap-3 self-end sm:self-auto flex-wrap">
          <button
            data-id="${safeId}"
            class="connection-acl-btn inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 transition ${conn.enabled === false || !canManageAcls ? 'hidden' : ''}"
            title="Edit access rules"
            aria-label="Edit access rules"
            ${canManageAcls ? '' : 'disabled aria-disabled="true"'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
            </svg>
          </button>
          <button data-id="${safeId}" class="edit-connection-btn p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors rounded ${conn.readOnly ? 'hidden' : ''}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          <button data-id="${safeId}" class="connection-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${conn.enabled === false ? 'bg-gray-200' : 'bg-black'}">
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${conn.enabled === false ? 'translate-x-0' : 'translate-x-4'}"></span>
          </button>
        </div>
      </div>
    `;
      })
      .join('');
  };

  const _renderConnectionsList = () => {
    const list = container.querySelector('#connections-list');
    if (!list) return;
    list.innerHTML = getConnectionsListMarkup();
  };

  const openConnectionAccessModal = (connection, opts) =>
    import('./connections-access-modal.js').then((m) =>
      m.openConnectionAccessModal(connection, { ...opts, connectionsState })
    );
  const render = () => {
    if (!isActiveTab()) return;
    const isReadOnlyConnection = Boolean(connectionsState.selectedConnection?.readOnly);
    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 bg-white">
          <div class="max-w-2xl mx-auto w-full flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Connections</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <div class="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pr-2">
                <div class="flex flex-col">
                  <div class="text-xs font-medium text-gray-900">LLM Providers</div>
                  <div class="text-[10px] text-gray-400">Manage each provider directly below.</div>
                </div>
              </div>
            </section>

            <section id="manage-connections-section" class="space-y-1 mt-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage LLM Chat Providers</div>
                <button id="add-connection" class="shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              <hr class="border-gray-100/30 my-2" />

              <div id="connections-list" class="space-y-2">
                ${getConnectionsListMarkup()}
              </div>
            </section>

            <div id="connections-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>

      <!-- Edit Connection Modal -->
      <div id="edit-connection-modal" class="${STANDARD_MODAL_PRESET.outerClass} z-[${STANDARD_MODAL_PRESET.zIndex}] ${connectionsState.showModal ? '' : 'hidden'}">
        <div class="${STANDARD_MODAL_PRESET.overlayClass}"></div>
        <div class="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
          <div class="px-6 pt-6 pb-4 flex justify-between items-center border-b border-gray-50">
            <h3 id="modal-title" class="text-lg font-medium text-gray-900">${connectionsState.selectedConnection ? 'Edit Connection' : 'Add Connection'}</h3>
            <button type="button" id="close-modal" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
            ${buildConnectionModalBodyMarkup({
              providerType: connectionsState.selectedConnection?.providerType || 'openai',
              name: connectionsState.selectedConnection?.name || '',
              url: connectionsState.selectedConnection?.url || '',
              keyValue: '',
              hasKey: Boolean(
                connectionsState.selectedConnection?.key ||
                connectionsState.selectedConnection?.keyMasked
              ),
              headers: connectionsState.selectedConnection?.headers || '',
              apiType: connectionApiTypeDetails(
                connectionsState.selectedConnection?.providerType || 'openai'
              ),
              canManage: true,
              showTestButton: !isReadOnlyConnection,
              testHiddenClass: isReadOnlyConnection ? ' hidden' : '',
              manualModelsHiddenClass: isReadOnlyConnection ? ' hidden' : '',
              disabledAttr: '',
              disabledControlClass: '',
              testButtonAttrs: '',
              testMessageAttrs: '',
              models: connectionsState.modalModels || [],
              query: connectionsState.modalModelsQuery || '',
              selection: connectionsState.modalModelsSelection || new Set(),
              loadingModels: Boolean(connectionsState.modalModelsLoading),
              modelsError: connectionsState.modalModelsError || '',
              showKeyHint: true,
            })}
          </div>

          <div class="px-6 py-6 flex justify-end gap-3 border-t border-gray-50">
            ${renderButton({ label: 'Delete', variant: 'ghost', id: 'delete-connection', className: `px-5 py-1.5 focus:ring-red-500 active:scale-95 ${connectionsState.selectedConnection ? '' : 'hidden'}` })}
            ${renderButton({ label: 'Save', variant: 'primary', id: 'save-modal', className: 'px-5 py-1.5 active:scale-95' })}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  };

  const loadConnections = async () => {
    if (connectionsState.loaded) return;
    connectionsState.loaded = true;
    try {
      const res = await apiFetch('/api/admin/openai/connections?include_disabled=1');
      if (!res.ok) {
        throw new Error('Failed to load connections');
      }
      const payload = await res.json();
      connectionsState.openai.enabled = payload?.enabled !== false;
      connectionsState.openai.connections = sortResourcesByEnabledThenLabel(
        Array.isArray(payload?.connections)
          ? payload.connections.map((conn) => normalizeConnectionRecord(conn))
          : []
      );
      if (isActiveTab()) render();
    } catch (err) {
      console.warn('Failed to load connections', err);
    }
  };

  const modalOps = createConnectionsModalOps({
    container,
    connectionsState,
    canManageAcls,
    render,
    openConnectionAccessModal,
  });
  const {
    setTestStatus,
    updateConnectionToggle,
    showFeedback,
    fillModalFields,
    renderModalModels,
    addManualModalModel,
    removeManualModalModel,
    refreshModalModels,
    updateModalSaveButton,
    openModal,
    closeModal,
    STANDARD_MODAL_PRESET,
  } = modalOps;

  const { bindEvents } = createConnectionsEventHandlers({
    container,
    connectionsState,
    canManageAcls,
    loadConnections,
    openModal,
    closeModal,
    openConnectionAccessModal,
    updateConnectionToggle,
    renderModalModels,
    addManualModalModel,
    removeManualModalModel,
    refreshModalModels,
    fillModalFields,
    showFeedback,
    setTestStatus,
    updateModalSaveButton,
    data,
  });

  render();
  loadConnections();
}
