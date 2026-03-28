import { apiFetch } from '../../../shared/api.js';
import { getAdminAclAccessPath } from '../../../shared/admin-acl.js';
import { cloneAclRules, createAclDraftRegistry, getAclRulesSignature } from '../acl-draft.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { normalizeModelSearchQuery } from '../../../shared/utils/model-search.js';
import { buildProviderOptions, filterModelsBySearchAndProvider } from '../../../shared/utils/model-filters.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../../../shared/utils/model-state.js';
import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import {
  ATTACHMENT_CAP_TYPES,
  cloneAttachmentCaps,
  extractAttachmentCapsFromModels,
  getAttachmentCapTooltip,
  getAttachmentCapValue,
} from './models-helpers.js';

const getCapTooltip = getAttachmentCapTooltip;
const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function renderModelsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'models';
  const modelsState = data.modelsSettings || (data.modelsSettings = {
    loading: false,
    error: null,
    models: [],
    total: 0,
    activeTotal: 0,
    limit: 20,
    offset: 0,
    disabledModels: new Set(),
    originalDisabledModels: new Set(),
    attachmentCaps: {},
    originalAttachmentCaps: {},
    capsLoading: false,
    capsError: null,
    saving: false,
    query: '',
    provider: 'all',
    providerOptions: [],
    invalidateToken: null,
    needsReload: false,
  });
  const aclDraftRegistry = createAclDraftRegistry(modelsState);
  data.settingsDirtyCheckers = data.settingsDirtyCheckers || {};
  data.settingsSaveHandlers = data.settingsSaveHandlers || {};
  data.settingsDiscardHandlers = data.settingsDiscardHandlers || {};

  if (data.modelsSettingsInvalidate && modelsState.invalidateToken !== data.modelsSettingsInvalidate) {
    modelsState.invalidateToken = data.modelsSettingsInvalidate;
    modelsState.models = [];
    modelsState.total = 0;
    modelsState.offset = 0;
    modelsState.error = null;
    modelsState.query = '';
    modelsState.provider = 'all';
    modelsState.providerOptions = [];
    modelsState.needsReload = true;
  }

  const setCapValue = (modelId, kind, value) => {
    const current = modelsState.attachmentCaps?.[modelId] || {};
    const next = { ...current };
    next[kind] = Boolean(value);
    modelsState.attachmentCaps = {
      ...(modelsState.attachmentCaps || {}),
      [modelId]: next,
    };
  };

  const hasCapsChanges = () => {
    for (const model of modelsState.models) {
      const modelId = model.id;
      for (const { key } of ATTACHMENT_CAP_TYPES) {
        const currentValue = getAttachmentCapValue(modelsState.attachmentCaps, modelId, key);
        const originalValue = getAttachmentCapValue(modelsState.originalAttachmentCaps, modelId, key);
        if (currentValue !== originalValue) return true;
      }
    }
    return false;
  };

  const hasChanges = () => {
    if (modelsState.disabledModels.size !== modelsState.originalDisabledModels.size) return true;
    for (const id of modelsState.disabledModels) {
      if (!modelsState.originalDisabledModels.has(id)) return true;
    }
    if (hasCapsChanges()) return true;
    if (aclDraftRegistry.isDirty()) return true;
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
    data.requestSettingsFooterSync?.();
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

  const updateCapButton = (btn, enabled) => {
    if (!btn) return;
    const label = btn.getAttribute('data-cap-label') || 'Attachment';
    const kind = btn.getAttribute('data-cap-kind') || '';
    const state = enabled ? 'allowed' : 'unset';
    btn.dataset.capState = state;
    btn.title = getCapTooltip(label, kind, state);
    btn.classList.toggle('bg-emerald-500', enabled);
    btn.classList.toggle('text-white', enabled);
    btn.classList.toggle('border-emerald-500', enabled);
    btn.classList.toggle('bg-gray-50', !enabled);
    btn.classList.toggle('text-gray-500', !enabled);
    btn.classList.toggle('border-gray-200', !enabled);
  };

  const openModelAccessModal = async (model, { onApply } = {}) => {
    if (!model?.id) return;
    const { modal, close } = createAdminAclModalShell({
      idsPrefix: 'model-acl',
      title: 'Model Access',
      subtitle: model.name || model.id,
      closeAttr: 'data-close-model-access',
    });

    const listEl = modal.querySelector('#model-acl-list');
    const errorEl = modal.querySelector('#model-acl-error');
    const saveErrorEl = modal.querySelector('#model-acl-save-error');
    const summaryEl = modal.querySelector('#model-acl-summary');
    const countEl = modal.querySelector('#model-acl-count');
    const reasonEl = modal.querySelector('#model-acl-reason');
    const saveBtn = modal.querySelector('#model-acl-save-btn');
    let baseRules = [];
    const stagedRules = aclDraftRegistry.get(model.id);

    const state = {
      loading: true,
      saving: false,
      error: null,
      groups: [],
      rulesByGroup: new Map(),
    };

    const renderSummary = () => {
      let reasonText = 'No explicit rules. Admin users can access by default.';
      if (summaryEl) {
        const allowCount = Array.from(state.rulesByGroup.values()).filter((value) => value === 'allow').length;
        const denyCount = Array.from(state.rulesByGroup.values()).filter((value) => value === 'deny').length;
        if (!allowCount && !denyCount) {
          summaryEl.textContent = 'No access rules';
          reasonText = 'No explicit rules. Admin users can access by default.';
        } else {
          const parts = [];
          if (allowCount) parts.push(`${allowCount} allow`);
          if (denyCount) parts.push(`${denyCount} deny`);
          summaryEl.textContent = parts.join(', ');
          if (allowCount && denyCount) {
            reasonText = 'Explicit allow rules share this model with selected groups. Deny rules override allow rules.';
          } else if (denyCount) {
            reasonText = 'This model is explicitly blocked for selected groups.';
          } else {
            reasonText = 'This model is shared with selected groups.';
          }
        }
      }
      if (countEl) {
        countEl.textContent = state.groups.length ? `${state.groups.length} groups` : '';
      }
      if (reasonEl) {
        reasonEl.textContent = reasonText;
      }
    };

    const updateSaveButton = () => {
      if (!saveBtn) return;
      setModalSaveButtonState(saveBtn, {
        enabled: true,
        saving: state.saving,
        label: 'Save',
        enabledClass: 'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800',
        disabledClass: 'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
      });
    };

    const renderList = () => {
      if (!listEl) return;
      if (state.loading) {
        listEl.innerHTML = `
          <div class="space-y-2">
            ${Array.from({ length: 5 }).map(() => `
              <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 animate-pulse">
                <div class="flex flex-col min-w-0 flex-1 space-y-2">
                  <div class="h-3.5 w-40 bg-gray-200 rounded-full"></div>
                  <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
                </div>
                <div class="h-4 w-4 bg-gray-100 rounded border border-gray-200"></div>
              </div>
            `).join('')}
          </div>
        `;
        return;
      }
      if (errorEl) {
        errorEl.textContent = state.error || '';
        errorEl.classList.toggle('hidden', !state.error);
      }
      if (!state.groups.length) {
        listEl.innerHTML = '<div class="text-sm text-gray-500 py-6 text-center">No resource teams available.</div>';
        return;
      }
      listEl.innerHTML = state.groups.map((group) => {
        const groupId = group.id;
        const effect = state.rulesByGroup.get(groupId) || 'none';
        const badge = group.is_system ? '<span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">System</span>' : '';
        return `
          <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 hover:border-gray-300">
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2">
                <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(group.name || group.id)}</div>
                ${badge}
              </div>
              <div class="text-[11px] text-gray-500 truncate">${escapeHtml(group.description || group.id)}</div>
            </div>
            <select class="model-acl-effect rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-gray-400" data-group-id="${escapeHtml(groupId)}">
              <option value="none" ${effect === 'none' ? 'selected' : ''}>No access</option>
              <option value="allow" ${effect === 'allow' ? 'selected' : ''}>Allow</option>
              <option value="deny" ${effect === 'deny' ? 'selected' : ''}>Deny</option>
            </select>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.model-acl-effect').forEach((select) => {
        select.addEventListener('change', () => {
          const groupId = select.getAttribute('data-group-id');
          if (!groupId) return;
          const effect = String(select.value || 'none');
          if (effect === 'none') {
            state.rulesByGroup.delete(groupId);
          } else {
            state.rulesByGroup.set(groupId, effect === 'deny' ? 'deny' : 'allow');
          }
          renderSummary();
        });
      });
    };

    const loadAccess = async () => {
      state.loading = true;
      state.error = null;
      renderList();
      try {
        const res = await apiFetch(getAdminAclAccessPath('models', { resourceId: model.id }));
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to load model access');
        }
        const payload = await res.json();
        state.groups = Array.isArray(payload.groups) ? payload.groups : [];
        const sourceRules = aclDraftRegistry.has(model.id) ? stagedRules : payload.rules;
        baseRules = cloneAclRules(payload.rules || []);
        state.rulesByGroup = new Map(
          (Array.isArray(sourceRules) ? sourceRules : [])
            .filter((rule) => String(rule?.principal_type || '').toLowerCase() === 'group')
            .map((rule) => [String(rule.principal_id || '').trim(), String(rule.effect || 'allow').trim().toLowerCase() === 'deny' ? 'deny' : 'allow'])
            .filter(([groupId]) => Boolean(groupId))
        );
      } catch (err) {
        state.error = err.message || 'Failed to load model access';
      } finally {
        state.loading = false;
        renderSummary();
        renderList();
      }
    };

    saveBtn?.addEventListener('click', async () => {
      if (state.saving) return;
      if (saveErrorEl) saveErrorEl.textContent = '';
      state.saving = true;
      updateSaveButton();
      try {
        const rules = Array.from(state.rulesByGroup.entries()).map(([groupId, effect]) => ({
          principal_type: 'group',
          principal_id: groupId,
          effect,
          action: 'use',
        }));
        const sameAsBase = getAclRulesSignature(rules) === getAclRulesSignature(baseRules);
        if (typeof onApply === 'function') {
          await onApply(sameAsBase ? null : cloneAclRules(rules), model);
        }
        close();
      } catch (err) {
        if (saveErrorEl) saveErrorEl.textContent = err.message || 'Failed to save model access';
      } finally {
        state.saving = false;
        updateSaveButton();
      }
    });

    updateSaveButton();
    renderSummary();
    renderList();
    loadAccess();
    document.body.appendChild(modal);
  };

  const render = () => {
    if (!isActiveTab()) return;
    const activeElement = document.activeElement;
    const wasSearchFocused = activeElement && activeElement.id === 'model-search-input';
    const selectionStart = wasSearchFocused && typeof activeElement.selectionStart === 'number'
      ? activeElement.selectionStart
      : null;
    const selectionEnd = wasSearchFocused && typeof activeElement.selectionEnd === 'number'
      ? activeElement.selectionEnd
      : null;
    const previousScrollTop = container.querySelector('[data-models-scroll]')?.scrollTop ?? 0;
    const dirty = hasChanges();
    const query = normalizeModelSearchQuery(modelsState.query);
    const usingFilter = Boolean(query);
    const providerOptions = modelsState.providerOptions.length
      ? modelsState.providerOptions
      : buildProviderOptions(modelsState.models, { includeAll: false });
    const enabledProviders = providerOptions.filter((option) => Number(option.active || 0) > 0);
    const allOption = {
      value: 'all',
      label: 'All Providers',
      active: modelsState.activeTotal ?? countEnabledModels(modelsState.models),
      total: modelsState.total ?? modelsState.models.length,
    };
    const mergedProviders = [
      allOption,
      ...enabledProviders.filter((option) => option.value !== 'all'),
    ];
    const filteredModels = filterModelsBySearchAndProvider(modelsState.models, {
      query,
      provider: modelsState.provider,
    });
    const displayTotal = modelsState.activeTotal || countEnabledModels(modelsState.models);
    const pageTotal = modelsState.total;
    const totalPages = Math.ceil(modelsState.total / modelsState.limit) || 1;
    const currentPage = Math.floor(modelsState.offset / modelsState.limit) + 1;
    const pageStart = pageTotal === 0 ? 0 : modelsState.offset + 1;
    const pageEnd = Math.min(modelsState.offset + modelsState.limit, pageTotal);

    const useSharedActionFooter = Boolean(data.sharedActionFooter);

    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-2.5 flex justify-between items-center sticky top-0 z-10 bg-white">
          <div class="flex items-center text-xl font-medium px-0.5 gap-2">
            <div class="flex-shrink-0 text-gray-900">Models</div>
            <div class="text-gray-500 font-normal ml-0.5" title="Active models">${displayTotal}</div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30 w-64">
              <div class="flex-shrink-0 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                  <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                </svg>
              </div>
              <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search models" id="model-search-input" value="${modelsState.query}">
              <div id="model-clear-search-container" class="${modelsState.query ? '' : 'hidden'} ml-1.5">
                <button type="button" id="model-clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <select id="model-provider-select" class="rounded-xl border border-gray-100/30 bg-gray-50/50 px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
              ${mergedProviders.map((option) => `
                <option value="${option.value}" ${option.value === modelsState.provider ? 'selected' : ''}>
                  ${option.label}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-hidden pb-6">
          <div class="relative flex-1 min-h-0 overflow-hidden w-full rounded-3xl border border-gray-100 bg-white">
            <div class="h-full overflow-auto" data-models-scroll="1">
              <table class="w-full text-sm text-left text-gray-500 table-fixed">
                <thead class="text-[11px] text-gray-900 font-bold uppercase bg-gray-50/50 sticky top-0 z-10">
                  <tr class="border-b border-gray-100">
                    <th scope="col" class="px-4 py-3 w-1/4">Name</th>
                    <th scope="col" class="px-4 py-3 w-1/3">Model ID</th>
                    <th scope="col" class="px-4 py-3 w-1/3">Input</th>
                    <th scope="col" class="px-4 py-3 w-1/6 text-right">Status</th>
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
                      <td colspan="3" class="py-10 text-center text-sm text-gray-400">No models found${usingFilter ? ' matching "' + modelsState.query + '"' : ''}.</td>
                    </tr>
                  ` : filteredModels.map(model => {
      const capButtons = ATTACHMENT_CAP_TYPES.map(({ key, label, short }) => {
        const value = getAttachmentCapValue(modelsState.attachmentCaps, model.id, key);
        const state = value ? 'allowed' : 'unset';
        const className = value
          ? 'bg-emerald-500 text-white border-emerald-500'
          : 'bg-gray-50 text-gray-500 border-gray-200';
        const tooltip = getCapTooltip(label, key, state);
        return `
                        <button
                          type="button"
                          data-cap-model="${model.id}"
                          data-cap-kind="${key}"
                          data-cap-label="${label}"
                          data-cap-state="${state}"
                          title="${tooltip}"
                          class="inline-flex items-center justify-center h-6 min-w-[36px] px-2 rounded-full text-[10px] font-semibold border transition hover:shadow-sm ${className}"
                        >
                          ${short}
                        </button>
                      `;
      }).join('');
      const isDisabled = modelsState.disabledModels.has(model.id);
      return `
                    <tr data-model-row="${model.id}" class="bg-white text-xs hover:bg-gray-50/50 transition-colors ${isDisabled ? 'bg-gray-50/80 opacity-70' : ''}">
                      <td class="px-4 py-4 font-medium text-gray-900 truncate" title="${model.name || model.id}">${model.name || model.id}</td>
                      <td class="px-4 py-4 text-gray-400 font-mono truncate ${isDisabled ? 'text-gray-300' : ''}" title="${model.id}">${model.id}</td>
                      <td class="px-4 py-4">
                        <div class="flex flex-wrap items-center gap-1.5">
                          ${capButtons}
                        </div>
                      </td>
                      <td class="px-4 py-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            class="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 transition ${isDisabled ? 'hidden' : ''}"
                            data-model-acl="${model.id}"
                            title="Edit access rules"
                            aria-label="Edit access rules"
                            ${isDisabled ? 'tabindex="-1" aria-hidden="true"' : ''}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-4">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
                            </svg>
                          </button>
                          <button data-model-id="${model.id}" class="model-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${!modelsState.disabledModels.has(model.id) ? 'bg-black' : 'bg-gray-200'}">
                            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${!modelsState.disabledModels.has(model.id) ? 'translate-x-4' : 'translate-x-0'}"></span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
    }).join('')}
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
              <div class="text-xs text-gray-400">${pageStart}-${pageEnd} of ${pageTotal}</div>
              <div class="flex items-center gap-2">
                <button id="prev-page" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" ${usingFilter || modelsState.offset === 0 ? 'disabled' : ''}>Prev</button>
                <div class="text-sm text-gray-600">Page ${currentPage} / ${totalPages}</div>
                <button id="next-page" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" ${usingFilter || modelsState.offset + modelsState.limit >= modelsState.total ? 'disabled' : ''}>Next</button>
              </div>
            </div>
          </div>
          <div id="models-feedback" class="hidden mt-2 rounded-xl border px-4 py-3 text-sm"></div>
        </div>

        ${useSharedActionFooter ? '' : `
        <div class="shrink-0 flex items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white sticky bottom-0 z-10">
          <div id="models-dirty" class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full ${dirty ? '' : 'invisible'}">Unsaved changes</div>
          <button id="save-models-top" class="ml-auto px-5 py-1.5 text-sm font-medium transition rounded-full ${(!dirty || modelsState.saving) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}" ${(!dirty || modelsState.saving) ? 'disabled' : ''}>
            ${modelsState.saving ? 'Saving...' : 'Save'}
          </button>
        </div>`}
      </div>
    `;

    const nextScrollContainer = container.querySelector('[data-models-scroll]');
    if (nextScrollContainer) {
      nextScrollContainer.scrollTop = previousScrollTop;
    }
    bindEvents();
    if (wasSearchFocused) {
      const searchInput = container.querySelector('#model-search-input');
      if (searchInput) {
        const len = searchInput.value.length;
        const start = selectionStart === null ? len : Math.min(selectionStart, len);
        const end = selectionEnd === null ? len : Math.min(selectionEnd, len);
        searchInput.focus();
        try {
          searchInput.setSelectionRange(start, end);
        } catch {
          // Ignore selection restore errors (e.g. unsupported input types)
        }
      }
    }
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

    const attachmentUpdates = [];
    modelsState.models.forEach((model) => {
      const modelId = model.id;
      const patch = {};
      ATTACHMENT_CAP_TYPES.forEach(({ key }) => {
        const currentValue = getAttachmentCapValue(modelsState.attachmentCaps, modelId, key);
        const originalValue = getAttachmentCapValue(modelsState.originalAttachmentCaps, modelId, key);
        if (currentValue !== originalValue) {
          patch[key] = currentValue;
        }
      });
      if (Object.keys(patch).length > 0) {
        attachmentUpdates.push({ model_id: modelId, attachments: patch });
      }
    });
    const aclUpdates = Array.from(aclDraftRegistry.entries())
      .map(([modelId, rules]) => ({
        modelId,
        rules: cloneAclRules(rules),
      }))
      .filter((entry) => entry.modelId);

    if (updates.length === 0 && attachmentUpdates.length === 0 && aclUpdates.length === 0) {
      return;
    }

    modelsState.saving = true;
    updateButtons();
    try {
      const res = await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          updates,
          attachment_updates: attachmentUpdates,
          access_updates: aclUpdates,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to save model settings');
      }
      modelsState.originalDisabledModels = new Set(modelsState.disabledModels);
      modelsState.originalAttachmentCaps = cloneAttachmentCaps(modelsState.attachmentCaps);
      aclUpdates.forEach((entry) => {
        aclDraftRegistry.clear(entry.modelId);
      });
      broadcastModelsInvalidation();
      const feedback = container.querySelector('#models-feedback');
      if (feedback) {
        feedback.textContent = 'Model settings saved. Chat model list will refresh.';
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
    modelsState.attachmentCaps = cloneAttachmentCaps(modelsState.originalAttachmentCaps);
    aclDraftRegistry.clear();
    if (isActiveTab()) render();
  };

  const bindEvents = () => {
    const searchInput = container.querySelector('#model-search-input');
    const clearSearchBtn = container.querySelector('#model-clear-search-btn');
    const clearSearchContainer = container.querySelector('#model-clear-search-container');
    let searchDebounce = null;
    if (searchInput) {
      searchInput.oninput = (e) => {
        const nextValue = e.target.value;
        clearSearchContainer?.classList.toggle('hidden', !nextValue);
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          modelsState.query = nextValue;
          modelsState.offset = 0;
          loadModels(true);
          const input = container.querySelector('#model-search-input');
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }, 120);
      };
    }
    clearSearchBtn?.addEventListener('click', () => {
      if (searchDebounce) clearTimeout(searchDebounce);
      modelsState.query = '';
      modelsState.offset = 0;
      if (searchInput) {
        searchInput.value = '';
      }
      if (clearSearchContainer) {
        clearSearchContainer.classList.add('hidden');
      }
      loadModels(true);
      searchInput?.focus();
    });
    const providerSelect = container.querySelector('#model-provider-select');
    if (providerSelect) {
      providerSelect.onchange = (e) => {
        modelsState.provider = e.target.value || 'all';
        modelsState.offset = 0;
        loadModels(true);
      };
    }

    container.querySelectorAll('.model-toggle').forEach(btn => {
      btn.onclick = () => {
        const modelId = btn.dataset.modelId;
        const row = btn.closest('[data-model-row]');
        if (modelsState.disabledModels.has(modelId)) {
          modelsState.disabledModels.delete(modelId);
        } else {
          modelsState.disabledModels.add(modelId);
        }
        const enabled = !modelsState.disabledModels.has(modelId);
        updateModelToggle(btn, enabled);
        if (row) {
          row.classList.toggle('bg-gray-50/80', !enabled);
          row.classList.toggle('opacity-70', !enabled);
          const aclBtn = row.querySelector('[data-model-acl]');
          if (aclBtn) {
            aclBtn.classList.toggle('hidden', !enabled);
            if (enabled) {
              aclBtn.removeAttribute('tabindex');
              aclBtn.removeAttribute('aria-hidden');
            } else {
              aclBtn.setAttribute('tabindex', '-1');
              aclBtn.setAttribute('aria-hidden', 'true');
            }
          }
        }
        updateButtons();
      };
    });

    container.querySelectorAll('[data-cap-model]').forEach((btn) => {
      btn.onclick = () => {
        const modelId = btn.getAttribute('data-cap-model');
        const kind = btn.getAttribute('data-cap-kind');
        if (!modelId || !kind) return;
        const currentValue = getAttachmentCapValue(modelsState.attachmentCaps, modelId, kind);
        const nextValue = !currentValue;
        setCapValue(modelId, kind, nextValue);
        updateCapButton(btn, nextValue);
        updateButtons();
      };
    });

    container.querySelectorAll('[data-model-acl]').forEach((btn) => {
      btn.onclick = () => {
        const modelId = btn.getAttribute('data-model-acl');
        if (!modelId) return;
        const model = (modelsState.models || []).find((item) => item.id === modelId);
        openModelAccessModal({ id: modelId, name: model?.name || modelId }, {
          onApply: async (rules) => {
            aclDraftRegistry.stage(modelId, rules);
            updateButtons();
          },
        });
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
      if (modelsState.provider && modelsState.provider !== 'all') {
        params.set('provider', modelsState.provider);
      }
      if (modelsState.query && modelsState.query.trim()) {
        params.set('q', modelsState.query.trim());
      }

      const res = await apiFetch(`/api/admin/models?${params.toString()}`);
      if (res.ok) {
        const payload = await res.json();
        modelsState.models = sortModelsByActiveThenName(payload.models || []);
        modelsState.total = payload.total || 0;
        modelsState.activeTotal = payload.active_total ?? countEnabledModels(modelsState.models);
        modelsState.providerOptions = Array.isArray(payload.providers) && payload.providers.length > 0
          ? payload.providers
          : buildProviderOptions(modelsState.models, { includeAll: false });
        modelsState.disabledModels = new Set(
          modelsState.models.filter((model) => model.enabled === false).map((model) => model.id)
        );
        modelsState.originalDisabledModels = new Set(modelsState.disabledModels);
        const capsFromModels = extractAttachmentCapsFromModels(modelsState.models);
        modelsState.attachmentCaps = capsFromModels;
        modelsState.originalAttachmentCaps = cloneAttachmentCaps(capsFromModels);
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
