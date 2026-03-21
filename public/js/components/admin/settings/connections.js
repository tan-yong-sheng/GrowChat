import { apiFetch } from '../../../api.js';
import { filterModelsBySearch } from '../../../utils/model-search.js';
import { sortModelsByActiveThenName } from '../../../utils/model-state.js';
import { broadcastModelsInvalidation } from '../../../utils/model-sync.js';
import {
  applyModalDraft,
  applyModalModelPreview,
  cloneModelSelection,
  buildModalConnectionDraft,
  connectionApiTypeDetails,
  formatConnectionModelId,
  getConnectionProviderId,
  getModalDraftKey,
  inflateManualConnectionModels,
  isCompatibleProviderType,
  normalizeProviderFamily,
  normalizeConnectionManualModels,
  normalizeConnectionRecord,
  normalizeModelRecord,
  providerDisplayLabel,
  providerUrlPlaceholder,
  resolveKeyLabel,
  resolveModalUrl,
  resolveUrlLabel,
  persistModalDraft,
  updateApiTypeDisplay,
} from './connections-helpers.js';

export function renderConnectionsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'connections';
  const connectionsState = data.connectionsSettings || (data.connectionsSettings = {
    loading: false,
    error: null,
    openai: {
      enabled: true,
      connections: [],
    },
    loaded: false,
    saving: false,
    showModal: false,
    selectedConnection: null,
    originalSnapshot: null,
    modalModels: [],
    modalModelsLoading: false,
    modalModelsError: null,
    modalModelsSelection: new Set(),
    modalModelsOriginal: new Set(),
    modalModelsConnectionId: null,
    modalSaving: false,
    modelOverrides: new Map(),
    modalModelsQuery: '',
    modalDrafts: new Map(),
    newConnectionDraftId: null,
  });
  data.settingsDirtyCheckers = data.settingsDirtyCheckers || {};
  data.settingsSaveHandlers = data.settingsSaveHandlers || {};
  data.settingsDiscardHandlers = data.settingsDiscardHandlers || {};

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
      }
    ];
    delete connectionsState.openai.url;
    delete connectionsState.openai.key;
  }

  const buildSnapshot = () => {
    const manualConnections = connectionsState.openai.connections
      .filter((conn) => !conn?.readOnly && conn?.source !== 'env')
      .map((conn) => ({
        id: conn.id || '',
        name: conn.name || '',
        url: conn.url || '',
        key: conn.key || '',
        headers: conn.headers || '',
        providerType: conn.providerType || 'openai',
        apiType: connectionApiTypeDetails(conn.providerType || conn.providerFamily || 'openai').value,
        enabled: conn.enabled !== false,
        manualModels: normalizeConnectionManualModels(conn.manualModels),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const envOverrides = {};
    connectionsState.openai.connections
      .filter((conn) => conn?.source === 'env')
      .forEach((conn) => {
        if (conn?.enabled === false) {
          envOverrides[conn.id] = false;
        }
      });
    const modelOverrides = Array.from(connectionsState.modelOverrides.entries())
      .map(([id, enabled]) => ({ id, enabled }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return JSON.stringify({
      enabled: connectionsState.openai.enabled !== false,
      connections: manualConnections,
      envOverrides,
      modelOverrides,
    });
  };

  const hasChanges = () => {
    if (!connectionsState.originalSnapshot) return false;
    return buildSnapshot() !== connectionsState.originalSnapshot;
  };
  data.settingsDirtyCheckers.connections = hasChanges;

  const getConnectionsListMarkup = () => {
    if (connectionsState.openai.connections.length === 0) {
      return '<div class="py-10 text-center text-sm text-gray-400">No connections configured</div>';
    }
    const deduped = new Map();
    connectionsState.openai.connections.forEach((conn) => {
      const key = `${conn?.source || 'manual'}::${conn?.id || ''}::${conn?.url || ''}`;
      if (!deduped.has(key)) deduped.set(key, conn);
    });
    return Array.from(deduped.values()).map(conn => `
      <div class="py-2.5 flex items-center justify-between pr-2 border-b border-gray-50 last:border-0">
        <div class="flex flex-col">
          <div class="text-xs font-medium text-gray-900">${conn.name || providerDisplayLabel(conn.providerType)}</div>
          <div class="text-[10px] text-gray-400 font-mono">${conn.url}</div>
          <div class="text-[10px] text-gray-400 mt-0.5">${providerDisplayLabel(conn.providerType)}</div>
          ${conn.readOnly ? '<div class="text-[10px] text-gray-400 mt-0.5">From env (read-only)</div>' : ''}
        </div>
        <div class="flex items-center gap-3">
          <button data-id="${conn.id}" class="edit-connection-btn p-1 text-gray-400 hover:text-gray-600 transition-colors ${(conn.readOnly && conn.source !== 'env') ? 'hidden' : ''}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          <button data-id="${conn.id}" class="connection-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${conn.enabled === false ? 'bg-gray-200' : 'bg-black'}">
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${conn.enabled === false ? 'translate-x-0' : 'translate-x-4'}"></span>
          </button>
        </div>
      </div>
    `).join('');
  };

  const renderConnectionsList = () => {
    const list = container.querySelector('#connections-list');
    if (!list) return;
    list.innerHTML = getConnectionsListMarkup();
  };

  const updateButtons = () => {
    const dirty = hasChanges();
    const dirtyBadge = container.querySelector('#connections-dirty');
    const saveBtn = container.querySelector('#save-connections');
    if (dirtyBadge) {
      dirtyBadge.classList.toggle('invisible', !dirty);
    }
    if (saveBtn) {
      const disabled = !dirty || connectionsState.saving;
      saveBtn.disabled = disabled;
      saveBtn.classList.toggle('bg-gray-200', disabled);
      saveBtn.classList.toggle('text-gray-400', disabled);
      saveBtn.classList.toggle('cursor-not-allowed', disabled);
      saveBtn.classList.toggle('bg-black', !disabled);
      saveBtn.classList.toggle('text-white', !disabled);
      saveBtn.classList.toggle('hover:bg-gray-900', !disabled);
      saveBtn.textContent = connectionsState.saving ? 'Saving...' : 'Save';
    }
  };

  const render = () => {
    if (!isActiveTab()) return;
    const isEnvConnection = connectionsState.selectedConnection?.source === 'env';
    const dirty = hasChanges();
    container.innerHTML = `
      <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Connections</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <div class="py-2.5 flex items-center justify-between pr-2">
                <div class="flex flex-col">
                  <div class="text-xs font-medium text-gray-900">LLM Providers</div>
                  <div class="text-[10px] text-gray-400">Manage each provider directly below.</div>
                </div>
              </div>
            </section>

            <section id="manage-connections-section" class="space-y-1 mt-4">
              <div class="flex items-center justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage Providers</div>
                <button id="add-connection" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
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

        <div class="shrink-0 flex items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white sticky bottom-0 z-10">
          <div id="connections-dirty" class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full ${dirty ? '' : 'invisible'}">Unsaved changes</div>
          <button id="save-connections" class="ml-auto px-5 py-1.5 text-sm font-medium transition rounded-full ${(!dirty || connectionsState.saving) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}" ${(!dirty || connectionsState.saving) ? 'disabled' : ''}>
            ${connectionsState.saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <!-- Edit Connection Modal -->
      <div id="edit-connection-modal" class="${connectionsState.showModal ? 'fixed' : 'hidden'} inset-0 z-[100] flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/20 backdrop-blur-sm"></div>
        <div class="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
          <div class="px-6 pt-6 pb-4 flex justify-between items-center border-b border-gray-50">
            <h3 id="modal-title" class="text-lg font-medium text-gray-900">${connectionsState.selectedConnection ? 'Edit Connection' : 'Add Connection'}</h3>
            <button id="close-modal" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Name</label>
              <input id="modal-conn-name" type="text" value="${connectionsState.selectedConnection?.name || ''}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="e.g. OpenAI" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
            </div>

            <div class="space-y-1">
              <label id="modal-conn-url-label" class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${resolveUrlLabel(connectionsState.selectedConnection?.providerType || 'openai')}</label>
              <div class="flex items-center gap-2">
                <input id="modal-conn-url" type="text" value="${connectionsState.selectedConnection?.url || ''}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="https://api.openai.com/v1" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
                <button id="test-connection" class="p-1 text-gray-400 hover:text-gray-600 ${isEnvConnection ? 'hidden' : ''}" title="Test connection">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              </div>
              <div id="connection-test-message" class="text-[11px] text-gray-400 ${isEnvConnection ? 'hidden' : ''}"></div>
              <div id="modal-conn-url-hint" class="text-[11px] text-gray-400">${isCompatibleProviderType(connectionsState.selectedConnection?.providerType || 'openai') ? 'Required for compatible providers.' : 'Uses the built-in default if left blank.'}</div>
            </div>

            <div class="space-y-1">
              <label id="modal-conn-key-label" class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${resolveKeyLabel()}</label>
              <div class="flex items-center gap-3">
                <div class="flex-1 relative">
                  <input id="modal-conn-key" type="password" value="${connectionsState.selectedConnection?.key || ''}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8" placeholder="API Key" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
                  <button id="toggle-key-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c3.41 0 6.446 1.315 8.613 3.447 1.12 1.101 2.04 2.484 2.747 4.033a1.015 1.012 0 0 1 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12.013a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Headers</label>
              <textarea id="modal-conn-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none" placeholder="Enter additional headers in JSON format" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">${connectionsState.selectedConnection?.headers || ''}</textarea>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Provider Type</label>
                <select id="modal-conn-provider" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900">
                  <option value="openai">OpenAI</option>
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="google">Gemini</option>
                  <option value="gemini-compatible">Gemini Compatible</option>
                  <option value="anthropic">Claude</option>
                  <option value="claude-compatible">Claude Compatible</option>
                </select>
                <div id="modal-conn-provider-hint" class="text-[11px] text-gray-400">OpenAI</div>
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">API Type</label>
                <div id="modal-conn-api-type-label" class="text-sm text-gray-900">${connectionApiTypeDetails(connectionsState.selectedConnection?.providerType || 'openai').label}</div>
                <div id="modal-conn-api-type-hint" class="text-[11px] text-gray-400">${connectionApiTypeDetails(connectionsState.selectedConnection?.providerType || 'openai').endpoint}</div>
              </div>
            </div>

            <div class="space-y-2" id="modal-models-section">
              <div class="flex items-center justify-between">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Models</label>
                <div class="flex items-center gap-2 text-[11px] text-gray-400">
                  <button type="button" id="modal-models-select-all" class="px-2 py-1 rounded-md hover:bg-gray-50">All</button>
                  <button type="button" id="modal-models-select-none" class="px-2 py-1 rounded-md hover:bg-gray-50">None</button>
                </div>
              </div>
              <div class="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
                <input id="modal-models-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none" placeholder="Search models" value="${connectionsState.modalModelsQuery || ''}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
              </div>
              <div class="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2 ${isEnvConnection ? 'hidden' : ''}">
                <input id="modal-manual-model-id" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none" placeholder="Add model manually" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
                <button id="modal-manual-model-add" class="shrink-0 rounded-full bg-black px-3 py-1 text-[11px] font-medium text-white hover:bg-gray-900 transition">Add</button>
              </div>
              <div id="modal-models-list" class="rounded-2xl border border-gray-100 bg-white max-h-48 overflow-y-auto scrollbar-hidden text-sm"></div>
              <div id="modal-models-status" class="text-[11px] text-gray-400"></div>
            </div>
          </div>

          <div class="px-6 py-6 flex justify-end gap-3 border-t border-gray-50">
            <button id="delete-connection" class="px-5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition rounded-full ${connectionsState.selectedConnection ? '' : 'hidden'}">Delete</button>
            <button id="save-modal" class="px-5 py-1.5 text-sm font-medium text-white bg-black hover:bg-gray-900 transition rounded-full">Save</button>
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
      const res = await apiFetch('/api/admin/openai/connections');
      if (!res.ok) {
        throw new Error('Failed to load connections');
      }
      const payload = await res.json();
      connectionsState.openai.enabled = payload?.enabled !== false;
      connectionsState.openai.connections = Array.isArray(payload?.connections)
        ? payload.connections.map((conn) => normalizeConnectionRecord(conn))
        : [];
      connectionsState.originalSnapshot = buildSnapshot();
      if (isActiveTab()) render();
    } catch (err) {
      console.warn('Failed to load connections', err);
    }
  };

  const setTestStatus = (status, message = '', scope = container) => {
    const messageEl = scope.querySelector('#connection-test-message');
    if (messageEl) {
      messageEl.textContent = message || '';
      messageEl.classList.toggle('hidden', !message);
      messageEl.classList.toggle('text-red-500', status === 'error');
      messageEl.classList.toggle('text-gray-900', status === 'success');
      messageEl.classList.toggle('text-gray-400', status === 'idle' || status === 'testing');
    }
  };

  const updateConnectionToggle = (btn, enabled) => {
    if (!btn) return;
    btn.classList.toggle('bg-black', enabled);
    btn.classList.toggle('bg-gray-200', !enabled);
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', enabled);
      knob.classList.toggle('translate-x-0', !enabled);
    }
  };

  const fillModalFields = (connection, scope = container) => {
    const nameInput = scope.querySelector('#modal-conn-name');
    const urlInput = scope.querySelector('#modal-conn-url');
    const keyInput = scope.querySelector('#modal-conn-key');
    const headersInput = scope.querySelector('#modal-conn-headers');
    const providerSelect = scope.querySelector('#modal-conn-provider');
    const testButton = scope.querySelector('#test-connection');
    const testMessage = scope.querySelector('#connection-test-message');
    const isEnv = connection?.source === 'env';
    if (nameInput) nameInput.value = connection?.name || '';
    if (urlInput) urlInput.value = connection?.url || '';
    if (keyInput) keyInput.value = connection?.key || connection?.keyMasked || '';
    if (headersInput) headersInput.value = connection?.headers || '';
    if (providerSelect) providerSelect.value = connection?.providerType || 'openai';
    if (urlInput) {
      const providerType = providerSelect?.value || connection?.providerType || 'openai';
      const defaultUrl = providerUrlPlaceholder(providerType);
      urlInput.placeholder = defaultUrl;
      if (!isCompatibleProviderType(providerType) && !String(urlInput.value || '').trim() && !isEnv) {
        urlInput.value = defaultUrl;
      }
    }
    if (nameInput) nameInput.placeholder = `e.g. ${providerDisplayLabel(providerSelect?.value || connection?.providerType || 'openai')}`;
    if (nameInput) nameInput.disabled = isEnv;
    if (urlInput) urlInput.disabled = isEnv;
    if (keyInput) keyInput.disabled = isEnv;
    if (headersInput) headersInput.disabled = isEnv;
    if (providerSelect) providerSelect.disabled = isEnv;
    if (nameInput) nameInput.classList.toggle('text-gray-400', isEnv);
    if (urlInput) urlInput.classList.toggle('text-gray-400', isEnv);
    if (keyInput) keyInput.classList.toggle('text-gray-400', isEnv);
    if (headersInput) headersInput.classList.toggle('text-gray-400', isEnv);
    if (providerSelect) providerSelect.classList.toggle('text-gray-400', isEnv);
    const title = scope.querySelector('#modal-title');
    const isExisting = Boolean(connection?.id);
    if (title) title.textContent = isExisting ? 'Edit Connection' : 'Add Connection';
    const providerHint = scope.querySelector('#modal-conn-provider-hint');
    if (providerHint) providerHint.textContent = providerDisplayLabel(providerSelect?.value || connection?.providerType || 'openai');
    const urlLabel = scope.querySelector('#modal-conn-url-label');
    if (urlLabel) urlLabel.textContent = resolveUrlLabel(providerSelect?.value || connection?.providerType || 'openai');
    const urlHint = scope.querySelector('#modal-conn-url-hint');
    if (urlHint) {
      urlHint.textContent = isCompatibleProviderType(providerSelect?.value || connection?.providerType || 'openai')
        ? 'Required for compatible providers.'
        : 'Uses the built-in default if left blank.';
    }
    const keyLabel = scope.querySelector('#modal-conn-key-label');
    if (keyLabel) keyLabel.textContent = resolveKeyLabel();
    updateApiTypeDisplay(scope, providerSelect?.value || connection?.providerType || 'openai');
    const deleteBtn = scope.querySelector('#delete-connection');
    if (deleteBtn) deleteBtn.classList.toggle('hidden', !isExisting || isEnv);
    if (testButton) testButton.classList.toggle('hidden', isEnv);
    if (testMessage) testMessage.classList.toggle('hidden', isEnv);
    setTestStatus('idle', '', scope);
  };

  const renderModalModels = (scope = container) => {
    const list = scope.querySelector('#modal-models-list');
    const status = scope.querySelector('#modal-models-status');
    if (!list || !status) return;
    if (!connectionsState.selectedConnection && (!Array.isArray(connectionsState.modalModels) || connectionsState.modalModels.length === 0)) {
      list.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Click Verify to load models from this connection.</div>';
      status.textContent = '';
      return;
    }
    if (connectionsState.modalModelsLoading) {
      list.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Loading models...</div>';
      status.textContent = '';
      return;
    }
    if (connectionsState.modalModelsError) {
      list.innerHTML = '<div class="px-4 py-3 text-xs text-red-500">Failed to load models.</div>';
      status.textContent = connectionsState.modalModelsError;
      status.classList.add('text-red-500');
      return;
    }
    const models = sortModelsByActiveThenName(connectionsState.modalModels);
    if (!models.length) {
      list.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">No models discovered for this connection.</div>';
      status.textContent = '';
      return;
    }
    const filtered = filterModelsBySearch(models, connectionsState.modalModelsQuery);
    status.classList.remove('text-red-500');
    const selected = connectionsState.modalModelsSelection || new Set();
    const hasQuery = Boolean(String(connectionsState.modalModelsQuery || '').trim());
    if (!filtered.length) {
      list.innerHTML = hasQuery
        ? '<div class="px-4 py-3 text-xs text-gray-400">No models match the current search.</div>'
        : '<div class="px-4 py-3 text-xs text-gray-400">No models discovered for this connection.</div>';
      status.textContent = `${selected.size} of ${models.length} enabled`;
      return;
    }
    list.innerHTML = filtered.map((model) => {
      const checked = selected.has(model.id);
      const label = model.name || model.id;
      const manualBadge = model.manual ? '<span class="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Manual</span>' : '';
      return `
        <label class="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
          <input type="checkbox" data-model-id="${model.id}" class="h-4 w-4 rounded border-gray-300" ${checked ? 'checked' : ''} />
          <div class="flex flex-col min-w-0">
            <div class="flex items-center min-w-0">
              <span class="text-sm text-gray-900 truncate">${label}</span>
              ${manualBadge}
            </div>
            <span class="text-[11px] text-gray-400 font-mono truncate">${model.id}</span>
          </div>
        </label>
      `; 
    }).join('');
    status.textContent = `${selected.size} of ${models.length} enabled`;
  };

  const addManualModalModel = (scope = container) => {
    const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
    const connection = connectionsState.selectedConnection;
    if (!connection?.id || connection?.source === 'env') return;
    const input = modalRoot.querySelector('#modal-manual-model-id');
    if (!input) return;
    const raw = String(input.value || '').trim();
    const safe = raw.replace(/^models\//i, '');
    if (!safe) {
      setTestStatus('error', 'Model name is required', modalRoot);
      return;
    }
    const providerId = getConnectionProviderId(connection);
    const fullId = formatConnectionModelId(providerId, safe);
    if (!fullId) {
      setTestStatus('error', 'Model name is required', modalRoot);
      return;
    }
    const nextModels = Array.isArray(connectionsState.modalModels)
      ? [...connectionsState.modalModels]
      : [];
    const manualRecord = normalizeModelRecord({
      id: fullId,
      name: safe,
      manual: true,
      manualModelId: safe,
    });
    const existingIndex = nextModels.findIndex((model) => model.id === fullId);
    if (existingIndex === -1) {
      nextModels.push(manualRecord);
    } else {
      nextModels[existingIndex] = {
        ...nextModels[existingIndex],
        ...manualRecord,
        manual: true,
        manualModelId: safe,
      };
    }
    const nextManualModels = normalizeConnectionManualModels(connection.manualModels);
    if (!nextManualModels.some((model) => model.modelId === safe)) {
      nextManualModels.push({ modelId: safe, name: safe });
    }
    connectionsState.modalModelsError = null;
    connectionsState.modalModelsLoading = false;
    connection.manualModels = nextManualModels;
    connectionsState.modalModels = nextModels;
    connectionsState.modalModelsSelection = new Set(connectionsState.modalModelsSelection || []);
    connectionsState.modalModelsSelection.add(fullId);
    connectionsState.modalModelsOriginal = new Set(connectionsState.modalModelsOriginal || []);
    connectionsState.modalModelsOriginal.add(fullId);
    persistModalDraft(connectionsState, connection);
    input.value = '';
    renderModalModels(modalRoot);
  };

  const loadModalModels = async (connection, scope = container) => {
    const connectionId = String(connection?.id || '').trim();
    const hasConnection = Boolean(connectionId);
    const draftKey = hasConnection ? connectionId : getModalDraftKey(connection);
    const hasDraft = connectionsState.modalDrafts?.has(draftKey);
    const isDraftConnection = connection?.source === 'draft';
    if (isDraftConnection) {
      if (hasDraft) {
        applyModalDraft(connectionsState, connection);
      } else {
        connectionsState.modalModels = [];
        connectionsState.modalModelsSelection = new Set();
        connectionsState.modalModelsOriginal = new Set();
        connectionsState.modalModelsQuery = '';
      }
      connectionsState.modalModelsConnectionId = connectionId || null;
      renderModalModels(scope);
      return;
    }
    if (!hasConnection) {
      if (hasDraft) {
        applyModalDraft(connectionsState, connection);
      } else {
        connectionsState.modalModels = [];
        connectionsState.modalModelsSelection = new Set();
        connectionsState.modalModelsOriginal = new Set();
        connectionsState.modalModelsQuery = '';
      }
      connectionsState.modalModelsConnectionId = null;
      renderModalModels(scope);
      return;
    }

    connectionsState.modalModelsLoading = true;
    connectionsState.modalModelsError = null;
    connectionsState.modalModelsConnectionId = connectionId;
    if (hasDraft) {
      applyModalDraft(connectionsState, connection);
    } else {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsQuery = '';
    }
    renderModalModels(scope);
    try {
      const res = await apiFetch('/api/admin/models?limit=0&offset=0&include_disabled=1');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details?.message || err.message || err.error || 'Failed to load models');
      }
      const payload = await res.json();
      const allModels = Array.isArray(payload?.models) ? payload.models : [];
      const filtered = allModels.filter((model) => String(model?.connection_id || '') === connectionId);
      const draft = hasDraft ? connectionsState.modalDrafts.get(draftKey) : null;
      const draftModelIds = draft
        ? new Set((Array.isArray(draft.models) ? draft.models : []).map((model) => String(model?.id || '').trim()).filter(Boolean))
        : new Set();
      const draftSelection = draft ? new Set(draft.selection || []) : null;
      const draftOriginal = draft ? new Set(draft.original || []) : null;
      connectionsState.modalModels = filtered;
      const enabled = new Set(filtered.filter((model) => model.enabled !== false).map((model) => model.id));
      const nextSelection = new Set();
      const nextOriginal = new Set();
      filtered.forEach((model) => {
        const modelId = model.id;
        if (draft) {
          const isKnownDraftModel = draftModelIds.has(modelId);
          if (isKnownDraftModel ? draftSelection?.has(modelId) : model.enabled !== false) {
            nextSelection.add(modelId);
          }
          if (isKnownDraftModel ? draftOriginal?.has(modelId) : model.enabled !== false) {
            nextOriginal.add(modelId);
          }
        } else {
          const override = connectionsState.modelOverrides.get(modelId);
          const isEnabled = override === undefined ? enabled.has(modelId) : override !== false;
          if (isEnabled) nextSelection.add(modelId);
          if (enabled.has(modelId)) nextOriginal.add(modelId);
        }
      });
      connectionsState.modalModelsSelection = nextSelection;
      connectionsState.modalModelsOriginal = nextOriginal.size > 0 || !draft ? nextOriginal : cloneModelSelection(draftOriginal);
      persistModalDraft(connectionsState, connection);
    } catch (err) {
      connectionsState.modalModelsError = err.message || 'Failed to load models';
    } finally {
      connectionsState.modalModelsLoading = false;
      renderModalModels(scope);
    }
  };

  const refreshModalModels = async (scope = container) => {
    const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
    const draft = buildModalConnectionDraft(modalRoot, connectionsState.selectedConnection);
    const resolvedUrl = resolveModalUrl(draft.providerType, draft.url);
    if (!resolvedUrl) {
      setTestStatus('error', 'URL is required for compatible providers', modalRoot);
      return;
    }
    draft.url = resolvedUrl;

    connectionsState.modalModelsLoading = true;
    connectionsState.modalModelsError = null;
    renderModalModels(modalRoot);
    setTestStatus('testing', 'Verifying connection and loading models...', modalRoot);

    try {
      const res = await apiFetch('/api/admin/openai/connections/test', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.details?.message || payload.message || payload.error || 'Connection failed');
      }
      if (Array.isArray(payload.models)) {
        applyModalModelPreview(connectionsState, payload.models, modalRoot, renderModalModels);
        const existingManualModels = connectionsState.selectedConnection
          ? inflateManualConnectionModels(connectionsState.selectedConnection)
          : [];
        if (existingManualModels.length > 0) {
          const merged = new Map((connectionsState.modalModels || []).map((model) => [model.id, model]));
          existingManualModels.forEach((model) => {
            if (!merged.has(model.id)) {
              merged.set(model.id, model);
              connectionsState.modalModelsSelection.add(model.id);
              connectionsState.modalModelsOriginal.add(model.id);
            }
          });
          connectionsState.modalModels = Array.from(merged.values());
          renderModalModels(modalRoot);
        }
        persistModalDraft(connectionsState, connectionsState.selectedConnection);
      } else {
        connectionsState.modalModels = [];
        connectionsState.modalModelsSelection = new Set();
        connectionsState.modalModelsOriginal = new Set();
        persistModalDraft(connectionsState, connectionsState.selectedConnection);
      }
      const count = Array.isArray(payload.models) ? payload.models.length : 0;
      setTestStatus('success', count > 0 ? `Connection successful. ${count} models loaded.` : 'Connection successful.', modalRoot);
      renderModalModels(modalRoot);
    } catch (err) {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsError = err.message || 'Failed to load models';
      persistModalDraft(connectionsState, connectionsState.selectedConnection);
      renderModalModels(modalRoot);
      setTestStatus('error', err.message || 'Connection failed', modalRoot);
    } finally {
      connectionsState.modalModelsLoading = false;
      renderModalModels(modalRoot);
    }
  };

  const updateModalSaveButton = (scope = container) => {
    const btn = scope.querySelector('#save-modal');
    if (!btn) return;
    const saving = connectionsState.modalSaving;
    btn.disabled = saving;
    btn.textContent = saving ? 'Saving...' : 'Save';
    btn.classList.toggle('opacity-60', saving);
    btn.classList.toggle('cursor-not-allowed', saving);
  };

  const openModal = (connection) => {
    if (connection) {
      connectionsState.selectedConnection = { ...connection };
      if (connectionsState.selectedConnection.enabled === undefined) {
        connectionsState.selectedConnection.enabled = true;
      }
    } else {
      if (!connectionsState.newConnectionDraftId) {
        connectionsState.newConnectionDraftId = `draft-${Math.random().toString(36).slice(2, 10)}`;
      }
      connectionsState.selectedConnection = {
        id: connectionsState.newConnectionDraftId,
        name: '',
        url: '',
        key: '',
        headers: '',
        providerType: 'openai',
        providerFamily: 'openai',
        apiType: connectionApiTypeDetails('openai').value,
        enabled: true,
        source: 'draft',
        manualModels: [],
      };
    }
    connectionsState.showModal = true;
    const modal = container.querySelector('#edit-connection-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('fixed');
    }
    if (connectionsState.selectedConnection && applyModalDraft(connectionsState, connectionsState.selectedConnection)) {
      persistModalDraft(connectionsState, connectionsState.selectedConnection);
    } else if (!connectionsState.selectedConnection) {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsQuery = '';
    }
    fillModalFields(connectionsState.selectedConnection, modal || container);
    loadModalModels(connectionsState.selectedConnection, modal || container);
    updateModalSaveButton(modal || container);
  };

  const closeModal = () => {
    connectionsState.showModal = false;
    const modal = container.querySelector('#edit-connection-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('fixed');
    }
  };

  const bindEvents = () => {
    container.querySelector('#add-connection')?.addEventListener('click', () => {
      openModal(null);
    });

    const list = container.querySelector('#connections-list');
    list?.addEventListener('click', (e) => {
      const toggle = e.target.closest('.connection-toggle');
      if (toggle) {
        const id = toggle.dataset.id;
        const connection = connectionsState.openai.connections.find(c => c.id === id);
        if (connection) {
          connection.enabled = connection.enabled === false;
          updateConnectionToggle(toggle, connection.enabled !== false);
          updateButtons();
        }
        return;
      }
      const btn = e.target.closest('.edit-connection-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      const connection = connectionsState.openai.connections.find(c => c.id === id);
      openModal(connection || null);
    });

    container.querySelector('#close-modal')?.addEventListener('click', () => {
      closeModal();
    });

    let testInFlight = false;
    container.querySelector('#test-connection')?.addEventListener('click', async () => {
      if (testInFlight) return;
      testInFlight = true;
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      setTestStatus('testing', 'Testing connection...', modalRoot);
      try {
        await refreshModalModels(modalRoot);
      } catch (err) {
        setTestStatus('error', err.message || 'Connection failed', modalRoot);
      } finally {
        testInFlight = false;
      }
    });

    container.querySelector('#save-modal')?.addEventListener('click', async () => {
      if (connectionsState.modalSaving) return;
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      const name = modalRoot.querySelector('#modal-conn-name').value;
      const url = modalRoot.querySelector('#modal-conn-url').value;
      const key = modalRoot.querySelector('#modal-conn-key').value;
      const headers = modalRoot.querySelector('#modal-conn-headers').value;
      const providerType = modalRoot.querySelector('#modal-conn-provider')?.value || 'openai';
      const providerFamily = normalizeProviderFamily(providerType);
      const apiType = connectionApiTypeDetails(providerType).value;
      const resolvedUrl = resolveModalUrl(providerType, url);
      if (!resolvedUrl) {
        setTestStatus('error', 'URL is required for compatible providers', modalRoot);
        connectionsState.modalSaving = false;
        updateModalSaveButton(modalRoot);
        return;
      }
      const enabled = connectionsState.selectedConnection?.enabled !== false;
      const connection = connectionsState.selectedConnection;
      const models = connectionsState.modalModels || [];
      const selected = connectionsState.modalModelsSelection || new Set();
      const manualModels = normalizeConnectionManualModels(
        models
          .filter((model) => model?.manual)
          .map((model) => ({
            modelId: model.manualModelId || model.id.split(':').slice(1).join(':') || model.id,
            name: model.name || model.manualModelId || model.id,
          }))
      );

      models.forEach((model) => {
        const currentEnabled = selected.has(model.id);
        const originalEnabled = connectionsState.modalModelsOriginal.has(model.id);
        if (currentEnabled === originalEnabled) {
          connectionsState.modelOverrides.delete(model.id);
        } else {
          connectionsState.modelOverrides.set(model.id, currentEnabled);
        }
      });

      if (connection?.id) {
        const index = connectionsState.openai.connections.findIndex(c => c.id === connection.id);
        if (index !== -1) {
          if (connection.source === 'env') {
            connectionsState.openai.connections[index] = {
              ...connectionsState.openai.connections[index],
              enabled
            };
          } else {
            if (connectionsState.selectedConnection) {
              connectionsState.selectedConnection.manualModels = manualModels;
            }
            connectionsState.openai.connections[index] = {
              ...connectionsState.openai.connections[index],
              name, url: resolvedUrl, key, headers, providerType, providerFamily, apiType, enabled, manualModels
            };
          }
        } else {
          const nextId = connection.id || connectionsState.selectedConnection?.id || Math.random().toString(36).substr(2, 9);
          connectionsState.openai.connections.push({
            id: nextId,
            name,
            url: resolvedUrl,
            key,
            headers,
            providerType,
            providerFamily,
            apiType,
            enabled,
            manualModels
          });
          if (connectionsState.selectedConnection) {
            connectionsState.selectedConnection.manualModels = manualModels;
          }
        }
        connectionsState.modalDrafts?.delete(getModalDraftKey(connection));
        if (connection.source === 'draft') {
          connectionsState.newConnectionDraftId = null;
        }
      } else {
        const nextId = connectionsState.selectedConnection?.id || Math.random().toString(36).substr(2, 9);
        connectionsState.openai.connections.push({
          id: nextId,
          name,
          url: resolvedUrl,
          key,
          headers,
          providerType,
          providerFamily,
          apiType,
          enabled,
          manualModels
        });
        connectionsState.modalDrafts?.delete(getModalDraftKey(connectionsState.selectedConnection));
        connectionsState.newConnectionDraftId = null;
      }

      closeModal();
      renderConnectionsList();
      updateButtons();
    });

    container.querySelector('#modal-models-select-all')?.addEventListener('click', () => {
      connectionsState.modalModelsSelection = new Set(
        connectionsState.modalModels.map((model) => model.id)
      );
      persistModalDraft(connectionsState);
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-select-none')?.addEventListener('click', () => {
      connectionsState.modalModelsSelection = new Set();
      persistModalDraft(connectionsState);
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-list')?.addEventListener('change', (e) => {
      const checkbox = e.target.closest('input[type="checkbox"][data-model-id]');
      if (!checkbox) return;
      const id = checkbox.getAttribute('data-model-id');
      if (!id) return;
      const next = new Set(connectionsState.modalModelsSelection || []);
      if (checkbox.checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      connectionsState.modalModelsSelection = next;
      persistModalDraft(connectionsState);
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-search')?.addEventListener('input', (e) => {
      connectionsState.modalModelsQuery = e.target.value;
      persistModalDraft(connectionsState);
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-manual-model-add')?.addEventListener('click', () => {
      addManualModalModel(container);
    });

    container.querySelector('#modal-manual-model-id')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addManualModalModel(container);
      }
    });

    container.querySelector('#modal-conn-provider')?.addEventListener('change', (e) => {
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      const hint = modalRoot.querySelector('#modal-conn-provider-hint');
      const urlLabel = modalRoot.querySelector('#modal-conn-url-label');
      const urlHint = modalRoot.querySelector('#modal-conn-url-hint');
      const urlInput = modalRoot.querySelector('#modal-conn-url');
      const nameInput = modalRoot.querySelector('#modal-conn-name');
      const nextProvider = e.target.value;
      if (hint) hint.textContent = providerDisplayLabel(nextProvider);
      if (urlInput) {
        const nextDefault = providerUrlPlaceholder(nextProvider);
        urlInput.placeholder = nextDefault;
        if (isCompatibleProviderType(nextProvider)) {
          const currentValue = String(urlInput.value || '').trim();
          const knownDefaults = [
            providerUrlPlaceholder('openai'),
            providerUrlPlaceholder('google'),
            providerUrlPlaceholder('anthropic'),
          ];
          if (!currentValue || knownDefaults.includes(currentValue)) {
            urlInput.value = '';
          }
        } else {
          urlInput.value = nextDefault;
        }
      }
      if (urlLabel) urlLabel.textContent = resolveUrlLabel(nextProvider);
      if (urlHint) {
        urlHint.textContent = isCompatibleProviderType(nextProvider)
          ? 'Required for compatible providers.'
          : 'Uses the built-in default if left blank.';
      }
      if (nameInput) nameInput.placeholder = `e.g. ${providerDisplayLabel(nextProvider)}`;
      updateApiTypeDisplay(modalRoot, nextProvider);
    });

    container.querySelector('#delete-connection')?.addEventListener('click', () => {
      if (connectionsState.selectedConnection) {
        connectionsState.modalDrafts?.delete(getModalDraftKey(connectionsState.selectedConnection));
        connectionsState.openai.connections = connectionsState.openai.connections.filter(c => c.id !== connectionsState.selectedConnection.id);
        closeModal();
        renderConnectionsList();
        updateButtons();
      }
    });

    const saveConnections = async () => {
      const feedback = container.querySelector('#connections-feedback');
      connectionsState.saving = true;
      updateButtons();
      try {
        const manualConnections = connectionsState.openai.connections
          .filter(c => !c.readOnly && c.source !== 'env')
          .map((conn) => ({
            ...conn,
            manualModels: normalizeConnectionManualModels(conn.manualModels),
          }));
        const envOverrides = {};
        connectionsState.openai.connections
          .filter((conn) => conn?.source === 'env')
          .forEach((conn) => {
            if (conn?.enabled === false) {
              envOverrides[conn.id] = false;
            }
          });
        const res = await apiFetch('/api/admin/openai/connections', {
          method: 'PUT',
          body: JSON.stringify({
            enabled: connectionsState.openai.enabled,
            connections: manualConnections,
            env_overrides: envOverrides
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to save connections');
        }
        const modelOverrides = Array.from(connectionsState.modelOverrides.entries())
          .map(([id, enabled]) => ({ id, enabled }));
        if (modelOverrides.length > 0) {
          const modelRes = await apiFetch('/api/admin/models', {
            method: 'PUT',
            body: JSON.stringify({ updates: modelOverrides })
          });
          if (!modelRes.ok) {
            const err = await modelRes.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Failed to save model settings');
          }
          connectionsState.modelOverrides.clear();
        }
        connectionsState.originalSnapshot = buildSnapshot();
        broadcastModelsInvalidation();
        if (feedback) {
          feedback.textContent = 'Connections saved. Chat model list will refresh.';
          feedback.className = 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
          feedback.classList.remove('hidden');
          setTimeout(() => feedback.classList.add('hidden'), 3000);
        }
        data.modelsSettingsInvalidate = Date.now();
        if (data.generalSettings) {
          data.generalSettings.models = [];
          data.generalSettings.modelsInvalidateToken = data.modelsSettingsInvalidate;
        }
      } catch (err) {
        if (feedback) {
          feedback.textContent = err.message || 'Failed to save connections';
          feedback.className = 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
          feedback.classList.remove('hidden');
          setTimeout(() => feedback.classList.add('hidden'), 3000);
        }
        throw err;
      } finally {
        connectionsState.saving = false;
        updateButtons();
      }
    };

    data.settingsSaveHandlers.connections = saveConnections;
    data.settingsDiscardHandlers.connections = () => {
      connectionsState.modelOverrides.clear();
      connectionsState.modalDrafts?.clear();
      connectionsState.newConnectionDraftId = null;
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModels = [];
      connectionsState.modalModelsQuery = '';
      connectionsState.selectedConnection = null;
      connectionsState.showModal = false;
      const modal = container.querySelector('#edit-connection-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('fixed');
      }
      connectionsState.loaded = false;
      connectionsState.originalSnapshot = null;
      loadConnections();
    };

    container.querySelector('#save-connections')?.addEventListener('click', async () => {
      await saveConnections();
    });

    container.querySelector('#toggle-key-visibility')?.addEventListener('click', () => {
      const input = container.querySelector('#modal-conn-key');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  };

  render();
  loadConnections();
}
