import { apiFetch } from '../../../api.js';

export function renderIntegrationsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'integrations';
  const integrationsState = data.integrationsSettings || (data.integrationsSettings = {
    loading: false,
    error: null,
    toolServers: [],
    loaded: false,
    saving: false,
    showModal: false,
    selectedServer: null,
    originalSnapshot: null,
  });

  const buildSnapshot = () => {
    const normalized = integrationsState.toolServers
      .map((server) => ({
        id: server.id || '',
        name: server.name || '',
        url: server.url || '',
        key: server.key || '',
        headers: server.headers || '',
        enabled: server.enabled !== false,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return JSON.stringify(normalized);
  };

  const hasChanges = () => {
    if (!integrationsState.originalSnapshot) return false;
    return buildSnapshot() !== integrationsState.originalSnapshot;
  };

  const updateButtons = () => {
    const dirty = hasChanges();
    const dirtyBadge = container.querySelector('#integrations-dirty');
    const saveBtn = container.querySelector('#save-integrations');
    if (dirtyBadge) {
      dirtyBadge.classList.toggle('invisible', !dirty);
    }
    if (saveBtn) {
      const disabled = !dirty || integrationsState.saving;
      saveBtn.disabled = disabled;
      saveBtn.classList.toggle('bg-gray-200', disabled);
      saveBtn.classList.toggle('text-gray-400', disabled);
      saveBtn.classList.toggle('cursor-not-allowed', disabled);
      saveBtn.classList.toggle('bg-black', !disabled);
      saveBtn.classList.toggle('text-white', !disabled);
      saveBtn.classList.toggle('hover:bg-gray-900', !disabled);
      saveBtn.textContent = integrationsState.saving ? 'Saving...' : 'Save';
    }
  };

  const updateServerToggle = (btn, enabled) => {
    if (!btn) return;
    btn.classList.toggle('bg-black', enabled);
    btn.classList.toggle('bg-gray-200', !enabled);
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', enabled);
      knob.classList.toggle('translate-x-0', !enabled);
    }
  };

  const setTestStatus = (status, message = '') => {
    const messageEl = container.querySelector('#server-test-message');
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.classList.toggle('hidden', !message);
    messageEl.classList.toggle('text-red-500', status === 'error');
    messageEl.classList.toggle('text-gray-900', status === 'success');
    messageEl.classList.toggle('text-gray-400', status === 'idle' || status === 'testing');
  };

  const getToolServersMarkup = () => {
    if (integrationsState.toolServers.length === 0) {
      return '<div class="py-10 text-center text-sm text-gray-400">No tool servers configured. Click + to add one.</div>';
    }
    return integrationsState.toolServers.map(server => `
      <div class="py-2.5 flex items-center justify-between pr-2 border-b border-gray-50 last:border-0">
        <div class="flex flex-col">
          <div class="text-xs font-medium text-gray-900">${server.name}</div>
          <div class="text-[10px] text-gray-400 font-mono">${server.url}</div>
        </div>
        <div class="flex items-center gap-3">
          <button data-id="${server.id}" class="edit-server-btn p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          <button data-id="${server.id}" class="server-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${server.enabled ? 'bg-black' : 'bg-gray-200'}">
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${server.enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
        </div>
      </div>
    `).join('');
  };

  const renderToolServersList = () => {
    const list = container.querySelector('#tool-servers-list');
    if (!list) return;
    list.innerHTML = getToolServersMarkup();
  };

  const render = () => {
    if (!isActiveTab()) return;
    const dirty = hasChanges();
    container.innerHTML = `
      <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Integrations</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <div class="flex items-center justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage Tool Servers</div>
                <button id="add-tool-server" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
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

            <div id="integrations-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>

        <div class="shrink-0 flex items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white sticky bottom-0 z-10">
          <div id="integrations-dirty" class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full ${dirty ? '' : 'invisible'}">Unsaved changes</div>
          <button id="save-integrations" class="ml-auto px-5 py-1.5 text-sm font-medium transition rounded-full ${(!dirty || integrationsState.saving) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}" ${(!dirty || integrationsState.saving) ? 'disabled' : ''}>
            ${integrationsState.saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <!-- Edit Connection Modal -->
      <div id="edit-connection-modal" class="${integrationsState.showModal ? 'fixed' : 'hidden'} inset-0 z-[100] flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/20 backdrop-blur-sm"></div>
        <div class="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
          <div class="px-6 pt-6 pb-4 flex justify-between items-center">
            <h3 id="server-modal-title" class="text-lg font-medium text-gray-900">${integrationsState.selectedServer ? 'Edit Server' : 'Add Server'}</h3>
            <button id="close-modal" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Server Name</label>
              <input id="server-name" type="text" value="${integrationsState.selectedServer?.name || ''}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="e.g. Default Tool Server">
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">URL</label>
              <div class="flex items-center gap-2">
                <input id="server-url" type="text" value="${integrationsState.selectedServer?.url || ''}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="http://localhost:5000">
                <button id="test-server" class="p-1 text-gray-400 hover:text-gray-600" title="Test server">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              </div>
              <div id="server-test-message" class="text-[11px] text-gray-400 hidden"></div>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Auth</label>
              <div class="flex items-center gap-3">
                <select class="bg-transparent border-none outline-none text-sm text-gray-900 appearance-none">
                  <option>Bearer</option>
                </select>
                <div class="flex-1 relative">
                  <input id="server-key" type="password" value="${integrationsState.selectedServer?.key || ''}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8" placeholder="API Key">
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
              <textarea id="server-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none" placeholder="Enter additional headers in JSON format">${integrationsState.selectedServer?.headers || ''}</textarea>
            </div>
          </div>

          <div class="px-6 py-6 flex justify-end gap-3">
            <button id="delete-server" class="px-5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition rounded-full ${integrationsState.selectedServer ? '' : 'hidden'}">Delete</button>
            <button id="save-modal" class="px-5 py-1.5 text-sm font-medium text-white bg-black hover:bg-gray-900 transition rounded-full">Save</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  };

  const fillModalFields = (server) => {
    const nameInput = container.querySelector('#server-name');
    const urlInput = container.querySelector('#server-url');
    const keyInput = container.querySelector('#server-key');
    const headersInput = container.querySelector('#server-headers');
    if (nameInput) nameInput.value = server?.name || '';
    if (urlInput) urlInput.value = server?.url || '';
    if (keyInput) keyInput.value = server?.key || '';
    if (headersInput) headersInput.value = server?.headers || '';
    const title = container.querySelector('#server-modal-title');
    if (title) title.textContent = server ? 'Edit Server' : 'Add Server';
    const deleteBtn = container.querySelector('#delete-server');
    if (deleteBtn) deleteBtn.classList.toggle('hidden', !server);
    setTestStatus('idle', '');
  };

  const openModal = (server) => {
    integrationsState.selectedServer = server ? { ...server } : null;
    integrationsState.showModal = true;
    const modal = container.querySelector('#edit-connection-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('fixed');
    }
    fillModalFields(integrationsState.selectedServer);
  };

  const closeModal = () => {
    integrationsState.showModal = false;
    const modal = container.querySelector('#edit-connection-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('fixed');
    }
  };

  const bindEvents = () => {
    container.querySelector('#add-tool-server')?.addEventListener('click', () => {
      openModal(null);
    });

    const list = container.querySelector('#tool-servers-list');
    list?.addEventListener('click', (e) => {
      const toggle = e.target.closest('.server-toggle');
      if (toggle) {
        const id = toggle.dataset.id;
        const server = integrationsState.toolServers.find(s => s.id === id);
        if (server) {
          server.enabled = !server.enabled;
          updateServerToggle(toggle, server.enabled);
          updateButtons();
        }
        return;
      }
      const editBtn = e.target.closest('.edit-server-btn');
      if (editBtn) {
        const id = editBtn.dataset.id;
        const server = integrationsState.toolServers.find(s => s.id === id);
        openModal(server || null);
      }
    });

    container.querySelector('#close-modal')?.addEventListener('click', () => {
      closeModal();
    });

    let testInFlight = false;
    container.querySelector('#test-server')?.addEventListener('click', async () => {
      if (testInFlight) return;
      const url = container.querySelector('#server-url')?.value || '';
      const key = container.querySelector('#server-key')?.value || '';
      const headers = container.querySelector('#server-headers')?.value || '';
      if (!url.trim()) {
        setTestStatus('error', 'URL is required');
        return;
      }
      testInFlight = true;
      setTestStatus('testing', 'Testing connection...');
      try {
        const res = await apiFetch('/api/admin/tool-servers/test', {
          method: 'POST',
          body: JSON.stringify({ url, key, headers }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || payload.message || 'Connection failed');
        }
        setTestStatus('success', payload.message || 'Connection successful');
      } catch (err) {
        setTestStatus('error', err.message || 'Connection failed');
      } finally {
        testInFlight = false;
      }
    });

    container.querySelector('#save-modal')?.addEventListener('click', () => {
      const name = container.querySelector('#server-name').value || 'Untitled Server';
      const url = container.querySelector('#server-url').value || '';
      const key = container.querySelector('#server-key').value || '';
      const headers = container.querySelector('#server-headers').value || '';

      if (integrationsState.selectedServer) {
        const index = integrationsState.toolServers.findIndex(s => s.id === integrationsState.selectedServer.id);
        if (index !== -1) {
          integrationsState.toolServers[index] = {
            ...integrationsState.toolServers[index],
            name,
            url,
            key,
            headers
          };
        }
      } else {
        integrationsState.toolServers.push({
          id: Math.random().toString(36).substr(2, 9),
          name,
          url,
          key,
          headers,
          enabled: true
        });
      }

      closeModal();
      renderToolServersList();
      updateButtons();
    });

    container.querySelector('#save-integrations')?.addEventListener('click', async () => {
      if (integrationsState.saving) return;
      const feedback = container.querySelector('#integrations-feedback');
      integrationsState.saving = true;
      updateButtons();
      try {
        const sanitized = integrationsState.toolServers.map((server) => ({
          id: server.id || '',
          name: String(server.name || '').trim(),
          url: String(server.url || '').trim(),
          key: String(server.key || '').trim(),
          headers: String(server.headers || '').trim(),
          enabled: server.enabled !== false,
        })).filter((server) => server.url);

        const res = await apiFetch('/api/admin/tool-servers', {
          method: 'PUT',
          body: JSON.stringify({ servers: sanitized }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to save integrations');
        }
        integrationsState.toolServers = sanitized;
        integrationsState.originalSnapshot = buildSnapshot();
        if (feedback) {
          feedback.textContent = 'Integrations saved successfully';
          feedback.className = 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
          feedback.classList.remove('hidden');
          setTimeout(() => feedback.classList.add('hidden'), 3000);
        }
      } catch (err) {
        if (feedback) {
          feedback.textContent = err.message || 'Failed to save integrations';
          feedback.className = 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
          feedback.classList.remove('hidden');
          setTimeout(() => feedback.classList.add('hidden'), 3000);
        }
      } finally {
        integrationsState.saving = false;
        updateButtons();
      }
    });

    container.querySelector('#delete-server')?.addEventListener('click', () => {
      if (integrationsState.selectedServer) {
        integrationsState.toolServers = integrationsState.toolServers.filter(s => s.id !== integrationsState.selectedServer.id);
        integrationsState.selectedServer = null;
        closeModal();
        renderToolServersList();
        updateButtons();
      }
    });

    container.querySelector('#toggle-key-visibility')?.addEventListener('click', () => {
      const input = container.querySelector('#server-key');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  };

  const loadIntegrations = async () => {
    if (integrationsState.loaded) return;
    integrationsState.loaded = true;
    try {
      const res = await apiFetch('/api/admin/tool-servers');
      if (!res.ok) throw new Error('Failed to load tool servers');
      const payload = await res.json();
      integrationsState.toolServers = Array.isArray(payload?.servers) ? payload.servers : [];
      integrationsState.originalSnapshot = buildSnapshot();
      if (isActiveTab()) render();
    } catch (err) {
      console.warn('Failed to load tool servers', err);
    } finally {
      if (!integrationsState.originalSnapshot) {
        integrationsState.originalSnapshot = buildSnapshot();
      }
      if (isActiveTab()) render();
    }
  };

  render();
  loadIntegrations();
}
