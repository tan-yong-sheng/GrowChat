import { apiFetch } from '../../../api.js';

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
        apiType: 'chat-completions',
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
        apiType: conn.apiType || 'chat-completions',
        enabled: conn.enabled !== false,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return JSON.stringify({
      enabled: connectionsState.openai.enabled !== false,
      connections: manualConnections,
    });
  };

  const hasChanges = () => {
    if (!connectionsState.originalSnapshot) return false;
    return buildSnapshot() !== connectionsState.originalSnapshot;
  };

  const render = () => {
    if (!isActiveTab()) return;
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
                <div class="text-xs font-medium text-gray-900">OpenAI API</div>
                <button id="openai-toggle" class="relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${connectionsState.openai.enabled ? 'bg-black' : 'bg-gray-200'}">
                  <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${connectionsState.openai.enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
                </button>
              </div>
            </section>

            ${connectionsState.openai.enabled ? `
            <section id="manage-connections-section" class="space-y-1 mt-4">
              <div class="flex items-center justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage API Connections</div>
                <button id="add-connection" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              <hr class="border-gray-100/30 my-2" />
              
              <div id="connections-list" class="space-y-2">
                ${connectionsState.openai.connections.length === 0 ? `
                  <div class="py-10 text-center text-sm text-gray-400">No connections configured</div>
                ` : connectionsState.openai.connections.map(conn => `
                  <div class="py-2.5 flex items-center justify-between pr-2 border-b border-gray-50 last:border-0">
                    <div class="flex flex-col">
                      <div class="text-xs font-medium text-gray-900">${conn.name || 'OpenAI Compatible'}</div>
                      <div class="text-[10px] text-gray-400 font-mono">${conn.url}</div>
                      ${conn.readOnly ? '<div class="text-[10px] text-gray-400 mt-0.5">From env (read-only)</div>' : ''}
                    </div>
                    <div class="flex items-center gap-3">
                      <button data-id="${conn.id}" class="edit-connection-btn p-1 text-gray-400 hover:text-gray-600 transition-colors ${conn.readOnly ? 'hidden' : ''}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247(rest of icons)..." />
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </button>
                      <span class="text-[10px] text-gray-400 ${conn.readOnly ? '' : 'hidden'}">Locked</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </section>
            ` : ''}

            <div id="connections-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>

        <div class="shrink-0 flex items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white">
          ${dirty ? '<div class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">Unsaved changes</div>' : '<div></div>'}
          <button id="save-connections" class="px-5 py-1.5 text-sm font-medium transition rounded-full ${(!dirty || connectionsState.saving) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}" ${(!dirty || connectionsState.saving) ? 'disabled' : ''}>
            ${connectionsState.saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <!-- Edit Connection Modal -->
      <div id="edit-connection-modal" class="${connectionsState.showModal ? 'fixed' : 'hidden'} inset-0 z-[100] flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/20 backdrop-blur-sm"></div>
        <div class="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
          <div class="px-6 pt-6 pb-4 flex justify-between items-center border-b border-gray-50">
            <h3 class="text-lg font-medium text-gray-900">${connectionsState.selectedConnection ? 'Edit Connection' : 'Add Connection'}</h3>
            <button id="close-modal" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Name</label>
              <input id="modal-conn-name" type="text" value="${connectionsState.selectedConnection?.name || ''}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="e.g. OpenAI">
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">URL</label>
              <div class="flex items-center gap-2">
                <input id="modal-conn-url" type="text" value="${connectionsState.selectedConnection?.url || ''}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="https://api.openai.com/v1">
                <button class="p-1 text-gray-400 hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
                <div class="h-4 w-4 rounded-full bg-green-500"></div>
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">API Key</label>
              <div class="flex items-center gap-3">
                <div class="flex-1 relative">
                  <input id="modal-conn-key" type="password" value="${connectionsState.selectedConnection?.key || ''}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8" placeholder="API Key">
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
              <textarea id="modal-conn-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none" placeholder="Enter additional headers in JSON format">${connectionsState.selectedConnection?.headers || ''}</textarea>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Provider Type</label>
                <div class="text-sm text-gray-900">OpenAI</div>
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">API Type</label>
                <div class="text-sm text-gray-900">Chat Completions</div>
                <div class="text-[11px] text-gray-400">Uses /v1/chat/completions</div>
              </div>
            </div>
          </div>

          <div class="px-6 py-6 flex justify-end gap-3 border-t border-gray-50">
            ${connectionsState.selectedConnection ? `
              <button id="delete-connection" class="px-5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition rounded-full">Delete</button>
            ` : ''}
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
      connectionsState.openai.connections = Array.isArray(payload?.connections) ? payload.connections : [];
      connectionsState.originalSnapshot = buildSnapshot();
      if (isActiveTab()) render();
    } catch (err) {
      console.warn('Failed to load connections', err);
    }
  };

  const bindEvents = () => {
    container.querySelector('#openai-toggle')?.addEventListener('click', () => {
      connectionsState.openai.enabled = !connectionsState.openai.enabled;
      render();
    });

    container.querySelector('#add-connection')?.addEventListener('click', () => {
      connectionsState.selectedConnection = null;
      connectionsState.showModal = true;
      render();
    });

    container.querySelectorAll('.edit-connection-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        connectionsState.selectedConnection = { ...connectionsState.openai.connections.find(c => c.id === id) };
        connectionsState.showModal = true;
        render();
      });
    });

    container.querySelector('#close-modal')?.addEventListener('click', () => {
      connectionsState.showModal = false;
      render();
    });

    container.querySelector('#save-modal')?.addEventListener('click', () => {
      const name = container.querySelector('#modal-conn-name').value;
      const url = container.querySelector('#modal-conn-url').value;
      const key = container.querySelector('#modal-conn-key').value;
      const headers = container.querySelector('#modal-conn-headers').value;
      const providerType = 'openai';
      const apiType = 'chat-completions';

      if (connectionsState.selectedConnection) {
        const index = connectionsState.openai.connections.findIndex(c => c.id === connectionsState.selectedConnection.id);
        if (index !== -1) {
          connectionsState.openai.connections[index] = { 
            ...connectionsState.openai.connections[index], 
            name, url, key, headers, providerType, apiType 
          };
        }
      } else {
        connectionsState.openai.connections.push({
          id: Math.random().toString(36).substr(2, 9),
          name,
          url,
          key,
          headers,
          providerType,
          apiType
        });
      }

      connectionsState.showModal = false;
      render();
    });

    container.querySelector('#delete-connection')?.addEventListener('click', () => {
      if (connectionsState.selectedConnection) {
        connectionsState.openai.connections = connectionsState.openai.connections.filter(c => c.id !== connectionsState.selectedConnection.id);
        connectionsState.showModal = false;
        render();
      }
    });

    container.querySelector('#save-connections')?.addEventListener('click', async () => {
      const feedback = container.querySelector('#connections-feedback');
      connectionsState.saving = true;
      render();
      try {
        const manualConnections = connectionsState.openai.connections.filter(c => !c.readOnly && c.source !== 'env');
        const res = await apiFetch('/api/admin/openai/connections', {
          method: 'PUT',
          body: JSON.stringify({
            enabled: connectionsState.openai.enabled,
            connections: manualConnections
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to save connections');
        }
        connectionsState.originalSnapshot = buildSnapshot();
        if (feedback) {
          feedback.textContent = 'Connections saved successfully';
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
      } finally {
        connectionsState.saving = false;
        render();
      }
    });

    container.querySelector('#toggle-key-visibility')?.addEventListener('click', () => {
      const input = container.querySelector('#modal-conn-key');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  };

  render();
  loadConnections();
}
