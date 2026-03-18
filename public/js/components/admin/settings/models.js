import { apiFetch } from '../../../api.js';
import { setState } from '../../../store.js';

export function renderModelsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'models';
  const modelsState = data.modelsSettings || (data.modelsSettings = {
    loading: false,
    error: null,
    models: [],
    total: 0,
    limit: 20,
    offset: 0,
    disabledModels: new Set(),
    originalDisabledModels: new Set(),
    saving: false,
    query: '',
    invalidateToken: null,
    needsReload: false,
  });
  data.settingsDirtyCheckers = data.settingsDirtyCheckers || {};
  data.settingsSaveHandlers = data.settingsSaveHandlers || {};
  data.settingsDiscardHandlers = data.settingsDiscardHandlers || {};

  if (data.modelsSettingsInvalidate && modelsState.invalidateToken !== data.modelsSettingsInvalidate) {
    modelsState.invalidateToken = data.modelsSettingsInvalidate;
    modelsState.models = [];
    modelsState.total = 0;
    modelsState.offset = 0;
    modelsState.error = null;
    modelsState.needsReload = true;
  }

  const hasChanges = () => {
    if (modelsState.disabledModels.size !== modelsState.originalDisabledModels.size) return true;
    for (const id of modelsState.disabledModels) {
      if (!modelsState.originalDisabledModels.has(id)) return true;
    }
    return false;
  };
  data.settingsDirtyCheckers.models = hasChanges;

  const updateButtons = () => {
    const dirty = hasChanges();
    const dirtyBadge = container.querySelector('#models-dirty');
    const saveBtn = container.querySelector('#save-models-top');
    if (dirtyBadge) {
      dirtyBadge.classList.toggle('invisible', !dirty);
    }
    if (saveBtn) {
      const disabled = !dirty || modelsState.saving;
      saveBtn.disabled = disabled;
      saveBtn.classList.toggle('bg-gray-200', disabled);
      saveBtn.classList.toggle('text-gray-400', disabled);
      saveBtn.classList.toggle('cursor-not-allowed', disabled);
      saveBtn.classList.toggle('bg-black', !disabled);
      saveBtn.classList.toggle('text-white', !disabled);
      saveBtn.classList.toggle('hover:bg-gray-900', !disabled);
      saveBtn.textContent = modelsState.saving ? 'Saving...' : 'Save';
    }
  };

  const updateModelToggle = (btn, enabled) => {
    if (!btn) return;
    btn.classList.toggle('bg-black', enabled);
    btn.classList.toggle('bg-gray-200', !enabled);
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', enabled);
      knob.classList.toggle('translate-x-0', !enabled);
    }
  };

  const render = () => {
    if (!isActiveTab()) return;
    const dirty = hasChanges();
    const query = modelsState.query.trim().toLowerCase();
    const filteredModels = query
      ? modelsState.models.filter((model) => {
        const label = String(model?.name || model?.id || '').toLowerCase();
        return label.includes(query);
      })
      : modelsState.models;
    const usingFilter = Boolean(query);
    const displayTotal = usingFilter ? filteredModels.length : modelsState.total;
    const totalPages = usingFilter ? 1 : (Math.ceil(modelsState.total / modelsState.limit) || 1);
    const currentPage = usingFilter ? 1 : (Math.floor(modelsState.offset / modelsState.limit) + 1);
    const pageStart = displayTotal === 0 ? 0 : (usingFilter ? 1 : modelsState.offset + 1);
    const pageEnd = usingFilter ? displayTotal : Math.min(modelsState.offset + modelsState.limit, modelsState.total);

    container.innerHTML = `
      <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-2.5 flex justify-between items-center sticky top-0 z-10 bg-white">
          <div class="flex items-center text-xl font-medium px-0.5 gap-2">
            <div class="flex-shrink-0 text-gray-900">Models</div>
            <div class="text-gray-500 font-normal ml-0.5">${displayTotal}</div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30 w-64">
              <div class="flex-shrink-0 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
              </div>
              <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search" id="model-search-input" value="${modelsState.query}">
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden pb-6">
          <div class="relative flex-1 min-h-0 overflow-hidden w-full rounded-3xl border border-gray-100 bg-white">
            <div class="h-full overflow-auto">
              <table class="w-full text-sm text-left text-gray-500 table-fixed">
                <thead class="text-[11px] text-gray-900 font-bold uppercase bg-gray-50/50 sticky top-0 z-10">
                  <tr class="border-b border-gray-100">
                    <th scope="col" class="px-4 py-3 w-1/3">Name</th>
                    <th scope="col" class="px-4 py-3 w-1/3">Model ID</th>
                    <th scope="col" class="px-4 py-3 w-1/4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody id="models-table-body" class="divide-y divide-gray-50/50">
                  ${modelsState.loading ? `
                    ${Array.from({ length: 5 }).map(() => `
                      <tr class="bg-white text-xs animate-pulse">
                        <td class="px-4 py-4"><div class="h-4 w-32 rounded bg-gray-100"></div></td>
                        <td class="px-4 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
                        <td class="px-4 py-4 text-right"><div class="ml-auto h-5 w-9 rounded-full bg-gray-100"></div></td>
                      </tr>
                    `).join('')}
                  ` : filteredModels.length === 0 ? `
                    <tr>
                      <td colspan="3" class="py-10 text-center text-sm text-gray-400">No models found${modelsState.query ? ' matching "' + modelsState.query + '"' : ''}.</td>
                    </tr>
                  ` : filteredModels.map(model => `
                    <tr class="bg-white text-xs hover:bg-gray-50/50 transition-colors">
                      <td class="px-4 py-4 font-medium text-gray-900 truncate" title="${model.name || model.id}">${model.name || model.id}</td>
                      <td class="px-4 py-4 text-gray-400 font-mono truncate" title="${model.id}">${model.id}</td>
                      <td class="px-4 py-4 text-right">
                        <button data-model-id="${model.id}" class="model-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${!modelsState.disabledModels.has(model.id) ? 'bg-black' : 'bg-gray-200'}">
                          <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${!modelsState.disabledModels.has(model.id) ? 'translate-x-4' : 'translate-x-0'}"></span>
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="shrink-0 border-t border-gray-100 bg-white">
          <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500">
            <div class="flex items-center gap-3">
              <span>Show</span>
              <select id="page-size-select" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
                <option value="20" ${modelsState.limit === 20 ? 'selected' : ''}>20</option>
                <option value="50" ${modelsState.limit === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${modelsState.limit === 100 ? 'selected' : ''}>100</option>
              </select>
              <span>per page</span>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-xs text-gray-400">${pageStart}-${pageEnd} of ${displayTotal}</div>
              <div class="flex items-center gap-2">
                <button id="prev-page" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" ${usingFilter || modelsState.offset === 0 ? 'disabled' : ''}>Prev</button>
                <div class="text-sm text-gray-600">Page ${currentPage} / ${totalPages}</div>
                <button id="next-page" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" ${usingFilter || modelsState.offset + modelsState.limit >= modelsState.total ? 'disabled' : ''}>Next</button>
              </div>
            </div>
          </div>
          <div id="models-feedback" class="hidden mt-2 rounded-xl border px-4 py-3 text-sm"></div>
        </div>

        <div class="shrink-0 flex items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white sticky bottom-0 z-10">
          <div id="models-dirty" class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full ${dirty ? '' : 'invisible'}">Unsaved changes</div>
          <button id="save-models-top" class="ml-auto px-5 py-1.5 text-sm font-medium transition rounded-full ${(!dirty || modelsState.saving) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}" ${(!dirty || modelsState.saving) ? 'disabled' : ''}>
            ${modelsState.saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    `;

    bindEvents();
  };

  const saveModels = async () => {
    if (modelsState.saving) return;
    const updates = modelsState.models
      .map((model) => {
        const isDisabled = modelsState.disabledModels.has(model.id);
        const wasDisabled = modelsState.originalDisabledModels.has(model.id);
        if (isDisabled === wasDisabled) return null;
        return { id: model.id, enabled: !isDisabled };
      })
      .filter(Boolean);

    if (updates.length === 0) {
      return;
    }

    modelsState.saving = true;
    updateButtons();
    try {
      const res = await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({ updates })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to save model settings');
      }
      modelsState.originalDisabledModels = new Set(modelsState.disabledModels);
      setState({ models: [], modelsLoading: false });
      const feedback = container.querySelector('#models-feedback');
      if (feedback) {
        feedback.textContent = 'Model settings saved successfully';
        feedback.className = 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
        feedback.classList.remove('hidden');
        setTimeout(() => feedback.classList.add('hidden'), 3000);
      }
    } catch (err) {
      const feedback = container.querySelector('#models-feedback');
      if (feedback) {
        feedback.textContent = err.message || 'Failed to save model settings';
        feedback.className = 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
        feedback.classList.remove('hidden');
        setTimeout(() => feedback.classList.add('hidden'), 3000);
      }
      throw err;
    } finally {
      modelsState.saving = false;
      updateButtons();
    }
  };

  data.settingsSaveHandlers.models = saveModels;
  data.settingsDiscardHandlers.models = () => {
    modelsState.disabledModels = new Set(modelsState.originalDisabledModels);
    if (isActiveTab()) render();
  };

  const bindEvents = () => {
    const searchInput = container.querySelector('#model-search-input');
    if (searchInput) {
      let searchDebounce = null;
      searchInput.oninput = (e) => {
        const nextValue = e.target.value;
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          modelsState.query = nextValue;
          render();
          const input = container.querySelector('#model-search-input');
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }, 120);
      };
    }

    container.querySelectorAll('.model-toggle').forEach(btn => {
      btn.onclick = () => {
        const modelId = btn.dataset.modelId;
        if (modelsState.disabledModels.has(modelId)) {
          modelsState.disabledModels.delete(modelId);
          updateModelToggle(btn, true);
        } else {
          modelsState.disabledModels.add(modelId);
          updateModelToggle(btn, false);
        }
        updateButtons();
      };
    });

    container.querySelector('#page-size-select')?.addEventListener('change', (e) => {
      modelsState.limit = parseInt(e.target.value, 10);
      modelsState.offset = 0;
      loadModels(true);
    });

    container.querySelector('#prev-page')?.addEventListener('click', () => {
      modelsState.offset = Math.max(0, modelsState.offset - modelsState.limit);
      loadModels(true);
    });

    container.querySelector('#next-page')?.addEventListener('click', () => {
      modelsState.offset = modelsState.offset + modelsState.limit;
      loadModels(true);
    });

    const saveBtn = container.querySelector('#save-models-top');
    saveBtn?.addEventListener('click', async () => {
      await saveModels();
    });
  };

  const loadModels = async (force = false) => {
    if (!isActiveTab()) return;
    if (modelsState.models.length > 0 && !force) return;
    modelsState.loading = true;
    render();
    try {
      const params = new URLSearchParams();
      params.set('limit', String(modelsState.limit));
      params.set('offset', String(modelsState.offset));
      
      const res = await apiFetch(`/api/admin/models?${params.toString()}`);
      if (res.ok) {
        const payload = await res.json();
        modelsState.models = (payload.models || []).slice().sort((a, b) => {
          const aLabel = String(a?.name || a?.id || '').toLowerCase();
          const bLabel = String(b?.name || b?.id || '').toLowerCase();
          return aLabel.localeCompare(bLabel);
        });
        modelsState.total = payload.total || 0;
        modelsState.disabledModels = new Set(
          modelsState.models.filter((model) => model.enabled === false).map((model) => model.id)
        );
        modelsState.originalDisabledModels = new Set(modelsState.disabledModels);
      }
    } catch (err) {
      console.warn('Failed to load models for settings', err);
      modelsState.error = err.message;
    } finally {
      modelsState.loading = false;
      if (isActiveTab()) render();
    }
  };

  render();
  loadModels(modelsState.needsReload);
  modelsState.needsReload = false;
}
