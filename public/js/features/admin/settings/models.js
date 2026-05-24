import { apiFetch } from '../../../shared/api.js';
import { getAdminAclAccessPath } from '../../../shared/admin-acl.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { normalizeModelSearchQuery } from '../../../shared/utils/model-search.js';
import {
  buildProviderOptions,
  filterModelsBySearchAndProvider,
} from '../../../shared/utils/model-filters.js';
import { sortModelsByActiveThenName } from '../../../shared/utils/model-state.js';
import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import {
  renderModelsHeaderHtml,
  renderModelsPaginationHtml,
  renderModelsTableShellHtml,
  syncModelsHeaderState,
  syncModelsPaginationState,
  syncModelsTableState,
} from '../../../shared/components/models-section.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { renderModelAccessBadgeForModel } from '../../../shared/components/model-access-badge.js';
import {
  extractAttachmentCapsFromModels,
  getAttachmentCapTooltip,
  getAttachmentCapValue,
} from './models-helpers.js';

function cloneAclRules(rules = [], normalizer = (rule) => rule) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => normalizer({ ...rule }))
    .filter((rule) => rule !== null && rule !== undefined);
}

function getAclRulesSignature(rules = [], normalizer) {
  return cloneAclRules(rules, normalizer)
    .map((rule) => ({
      principal_type: String(rule?.principal_type || '')
        .trim()
        .toLowerCase(),
      principal_id: String(rule?.principal_id || '').trim(),
      effect: String(rule?.effect || '')
        .trim()
        .toLowerCase(),
      action: String(rule?.action || '')
        .trim()
        .toLowerCase(),
    }))
    .sort(
      (a, b) =>
        a.principal_type.localeCompare(b.principal_type) ||
        a.principal_id.localeCompare(b.principal_id) ||
        a.action.localeCompare(b.action) ||
        a.effect.localeCompare(b.effect)
    )
    .map((rule) => `${rule.principal_type}:${rule.principal_id}:${rule.action}:${rule.effect}`)
    .join('|');
}

const getCapTooltip = getAttachmentCapTooltip;
const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function renderModelsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'models';
  const canManageAcls = data.capabilities?.canManageAcls !== false;
  const modelsState =
    data.modelsSettings ||
    (data.modelsSettings = {
      loading: false,
      error: null,
      models: [],
      total: 0,
      activeTotal: 0,
      limit: 20,
      offset: 0,
      disabledModels: new Set(),
      attachmentCaps: {},
      capsLoading: false,
      capsError: null,
      query: '',
      provider: 'all',
      providerOptions: [],
      invalidateToken: null,
      needsReload: false,
    });
  const ensureMounted = () =>
    container.dataset.modelsMounted === '1' &&
    Boolean(container.querySelector('[data-models-scroll]'));
  const getLocalModels = () =>
    modelsState.models.map((model) => ({
      ...model,
      enabled: model.enabled !== false && !modelsState.disabledModels.has(model.id),
    }));
  const getActiveModelCount = () =>
    Number.isFinite(modelsState.activeTotal) ? modelsState.activeTotal : 0;

  if (
    data.modelsSettingsInvalidate &&
    modelsState.invalidateToken !== data.modelsSettingsInvalidate
  ) {
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

  const showError = (message) => {
    const errorSlot = container.querySelector('#models-error-container');
    if (errorSlot) {
      errorSlot.innerHTML = `<div data-error-banner class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3"><span>${message}</span></div>`;
      setTimeout(() => {
        if (errorSlot.querySelector('[data-error-banner]')) {
          errorSlot.innerHTML = '';
        }
      }, 4000);
    }
  };

  const _toggleModelEnabled = async (modelId) => {
    const model = modelsState.models.find((m) => m.id === modelId);
    if (!model) return;

    const wasDisabled = modelsState.disabledModels.has(modelId);
    const nextEnabled = wasDisabled;

    // Optimistic update
    if (wasDisabled) {
      modelsState.disabledModels.delete(modelId);
      modelsState.activeTotal = getActiveModelCount() + 1;
    } else {
      modelsState.disabledModels.add(modelId);
      modelsState.activeTotal = Math.max(0, getActiveModelCount() - 1);
    }
    syncUi();

    try {
      const res = await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          updates: [{ id: modelId, enabled: nextEnabled }],
          attachment_updates: [],
          access_updates: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to update model');
      }
      broadcastModelsInvalidation();
    } catch (err) {
      // Rollback on error
      if (wasDisabled) {
        modelsState.disabledModels.add(modelId);
        modelsState.activeTotal = Math.max(0, getActiveModelCount() - 1);
      } else {
        modelsState.disabledModels.delete(modelId);
        modelsState.activeTotal = getActiveModelCount() + 1;
      }
      syncUi();
      showError(err.message || 'Failed to update model');
    }
  };

  const toggleAttachmentCap = async (modelId, kind) => {
    const currentValue = getAttachmentCapValue(modelsState.attachmentCaps, modelId, kind);
    const nextValue = !currentValue;

    // Optimistic update
    setCapValue(modelId, kind, nextValue);
    syncUi();

    try {
      const res = await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          updates: [],
          attachment_updates: [{ model_id: modelId, attachments: { [kind]: nextValue } }],
          access_updates: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to update attachment capability');
      }
      broadcastModelsInvalidation();
    } catch (err) {
      // Rollback on error
      setCapValue(modelId, kind, currentValue);
      syncUi();
      showError(err.message || 'Failed to update attachment capability');
    }
  };

  const saveAclChanges = async (modelId, rules) => {
    try {
      const res = await apiFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          updates: [],
          attachment_updates: [],
          access_updates: [{ modelId, rules: cloneAclRules(rules) }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to save access rules');
      }
      broadcastModelsInvalidation();
    } catch (err) {
      showError(err.message || 'Failed to save access rules');
    }
  };

  const _updateModelToggle = (btn, enabled) => {
    if (!btn) return;
    btn.classList.toggle('bg-black', enabled);
    btn.classList.toggle('bg-gray-200', !enabled);
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', enabled);
      knob.classList.toggle('translate-x-0', !enabled);
    }
  };

  const _updateCapButton = (btn, enabled) => {
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

  const syncUi = () => {
    const query = normalizeModelSearchQuery(modelsState.query);
    const usingFilter = Boolean(query);
    const visibleModels = getLocalModels();
    const providerOptions = modelsState.providerOptions.length
      ? modelsState.providerOptions
      : buildProviderOptions(visibleModels, { includeAll: false });
    const enabledProviders = providerOptions.filter((option) => Number(option.active || 0) > 0);

    const allOption = {
      value: 'all',
      label: 'All Providers',
      active: getActiveModelCount(),
      total: modelsState.total ?? visibleModels.length,
    };
    const mergedProviders = [
      allOption,
      ...enabledProviders.filter((option) => option.value !== 'all'),
    ];
    const filteredModels = filterModelsBySearchAndProvider(modelsState.models, {
      query,
      provider: modelsState.provider,
    });
    const pageTotal = modelsState.total;
    const totalPages = Math.ceil(modelsState.total / modelsState.limit) || 1;
    const currentPage = Math.floor(modelsState.offset / modelsState.limit) + 1;
    const pageStart = pageTotal === 0 ? 0 : modelsState.offset + 1;
    const pageEnd = Math.min(modelsState.offset + modelsState.limit, pageTotal);

    syncModelsHeaderState(container, {
      countTitle: 'Selected models',
      countLabel: 'Selected models',
      countValue: getActiveModelCount(),
      searchId: 'model-search-input',
      searchValue: modelsState.query,
      clearId: 'model-clear-search-container',
      clearButtonId: 'model-clear-search-btn',
      clearHidden: !modelsState.query,
      providerId: 'model-provider-select',
      providerValue: modelsState.provider,
      providerOptionsMarkup: mergedProviders
        .map(
          (option) => `
        <option value="${option.value}" ${option.value === modelsState.provider ? 'selected' : ''}>
          ${option.label}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
        </option>
      `
        )
        .join(''),
    });

    syncModelsTableState(container, {
      loading: modelsState.loading,
      rowsHtml: modelsState.loading
        ? `
                    ${Array.from({ length: 5 })
                      .map(
                        () => `
                      <tr class="bg-white text-xs animate-pulse">
                        <td class="px-4 py-4"><div class="h-4 w-32 rounded bg-gray-100"></div></td>
                        <td class="px-4 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
                        <td class="px-4 py-4"><div class="h-6 w-20 rounded-full bg-gray-100"></div></td>
                        <td class="px-4 py-4 text-right"><div class="ml-auto h-5 w-9 rounded-full bg-gray-100"></div></td>
                      </tr>
                    `
                      )
                      .join('')}
                  `
        : filteredModels.length === 0
          ? ''
          : filteredModels
              .map((model) => {
                const _isDisabled = modelsState.disabledModels.has(model.id);
                return `
                    <tr data-model-row="${model.id}" class="text-xs hover:bg-gray-50/50 transition-colors ${_isDisabled ? 'bg-gray-50/80 opacity-70' : 'bg-white'}">
                      <td class="px-4 py-4 font-medium text-gray-900 truncate" title="${model.name || model.id}">${model.name || model.id}</td>
                      <td class="px-4 py-4 font-mono truncate ${_isDisabled ? 'text-gray-300' : 'text-gray-400'}" title="${model.id}">${model.id}</td>
                      <td class="px-4 py-4">
                        <div class="flex items-center gap-2">
                          ${renderModelAccessBadgeForModel(model)}
                        </div>
                      </td>
                      <td class="px-4 py-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            class="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${_isDisabled || !canManageAcls ? 'hidden' : ''}"
                            data-model-acl="${model.id}"
                            title="Edit access rules"
                            aria-label="Edit access rules"
                            ${_isDisabled || !canManageAcls ? 'tabindex="-1" aria-hidden="true" disabled aria-disabled="true"' : ''}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
              })
              .join(''),
      emptyMessage:
        pageTotal === 0 && !usingFilter
          ? 'No models are selected upstream.'
          : `No models found${usingFilter ? ` matching "${modelsState.query}"` : ''}.`,
      tbodyId: 'models-table-body',
      emptyColSpan: 4,
    });

    syncModelsPaginationState(container, {
      pageSizeId: 'page-size-select',
      limit: modelsState.limit,
      pageStart,
      pageEnd,
      pageTotal,
      currentPage,
      totalPages,
      loading: modelsState.loading,
      usingFilter,
    });

    const errorSlot = container.querySelector('#models-error-container');
    if (errorSlot) {
      errorSlot.innerHTML = modelsState.error
        ? `<div data-error-banner class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3"><span>${modelsState.error}</span></div>`
        : '';
    }

    // Save button removed - using immediate-save pattern
  };

  const bindDelegatedEvents = () => {
    if (container.dataset.modelsEventsBound === '1') return;
    container.dataset.modelsEventsBound = '1';

    let searchDebounce = null;
    container.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.id !== 'model-search-input') return;
      const nextValue = target.value;
      const clearSearchContainer = container.querySelector('#model-clear-search-container');
      clearSearchContainer?.classList.toggle('hidden', !nextValue);
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        modelsState.query = nextValue;
        modelsState.offset = 0;
        loadModels(true);
      }, 120);
    });

    container.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === 'model-provider-select') {
        modelsState.provider = target.value || 'all';
        modelsState.offset = 0;
        loadModels(true);
        return;
      }
      if (target.id === 'page-size-select') {
        modelsState.limit = parseInt(target.value, 10);
        modelsState.offset = 0;
        loadModels(true);
      }
    });

    container.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target.closest('#model-clear-search-btn')) {
        const searchInput = container.querySelector('#model-search-input');
        if (searchDebounce) clearTimeout(searchDebounce);
        modelsState.query = '';
        modelsState.offset = 0;
        if (searchInput) searchInput.value = '';
        container.querySelector('#model-clear-search-container')?.classList.add('hidden');
        loadModels(true);
        searchInput?.focus();
        return;
      }

      if (target.closest('#prev-page')) {
        modelsState.offset = Math.max(0, modelsState.offset - modelsState.limit);
        loadModels(true);
        return;
      }

      if (target.closest('#next-page')) {
        modelsState.offset = modelsState.offset + modelsState.limit;
        loadModels(true);
        return;
      }

      const capBtn = target.closest('[data-cap-model]');
      if (capBtn) {
        const modelId = capBtn.getAttribute('data-cap-model');
        const kind = capBtn.getAttribute('data-cap-kind');
        if (!modelId || !kind) return;
        void toggleAttachmentCap(modelId, kind);
        return;
      }

      const aclBtn = target.closest('[data-model-acl]');
      if (aclBtn) {
        if (!canManageAcls) return;
        const modelId = aclBtn.getAttribute('data-model-acl');
        if (!modelId) return;
        const model = (modelsState.models || []).find((item) => item.id === modelId);
        openModelAccessModal(
          { id: modelId, name: model?.name || modelId },
          {
            onApply: async (rules) => {
              await saveAclChanges(modelId, rules);
            },
          }
        );
      }
    });
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
        const allowCount = Array.from(state.rulesByGroup.values()).filter(
          (value) => value === 'allow'
        ).length;
        const denyCount = Array.from(state.rulesByGroup.values()).filter(
          (value) => value === 'deny'
        ).length;
        if (!allowCount && !denyCount) {
          summaryEl.textContent = 'No access rules';
          reasonText = 'No explicit rules. Admin users can access by default.';
        } else {
          const parts = [];
          if (allowCount) parts.push(`${allowCount} allow`);
          if (denyCount) parts.push(`${denyCount} deny`);
          summaryEl.textContent = parts.join(', ');
          if (allowCount && denyCount) {
            reasonText =
              'Explicit allow rules share this model with selected groups. Deny rules override allow rules.';
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
        enabledClass:
          'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800',
        disabledClass:
          'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
      });
    };

    const renderList = () => {
      if (!listEl) return;
      if (state.loading) {
        listEl.innerHTML = `
          <div class="space-y-2">
            ${Array.from({ length: 5 })
              .map(
                () => `
              <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 animate-pulse">
                <div class="flex flex-col min-w-0 flex-1 space-y-2">
                  <div class="h-3.5 w-40 bg-gray-200 rounded-full"></div>
                  <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
                </div>
                <div class="h-4 w-4 bg-gray-100 rounded border border-gray-200"></div>
              </div>
            `
              )
              .join('')}
          </div>
        `;
        return;
      }
      if (errorEl) {
        errorEl.textContent = state.error || '';
        errorEl.classList.toggle('hidden', !state.error);
      }
      if (!state.groups.length) {
        listEl.innerHTML =
          '<div class="text-sm text-gray-500 py-6 text-center">No resource teams available.</div>';
        return;
      }
      listEl.innerHTML = state.groups
        .map((group) => {
          const groupId = group.id;
          const effect = state.rulesByGroup.get(groupId) || 'none';
          const badge = group.is_system
            ? '<span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">System</span>'
            : '';
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
        })
        .join('');

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
        baseRules = cloneAclRules(payload.rules || []);
        state.rulesByGroup = new Map(
          (Array.isArray(payload.rules) ? payload.rules : [])
            .filter((rule) => String(rule?.principal_type || '').toLowerCase() === 'group')
            .map((rule) => [
              String(rule.principal_id || '').trim(),
              String(rule.effect || 'allow')
                .trim()
                .toLowerCase() === 'deny'
                ? 'deny'
                : 'allow',
            ])
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
        if (!sameAsBase && typeof onApply === 'function') {
          await onApply(cloneAclRules(rules), model);
        } else if (sameAsBase) {
          broadcastModelsInvalidation();
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

    const query = normalizeModelSearchQuery(modelsState.query);
    const usingFilter = Boolean(query);
    const visibleModels = getLocalModels();
    const providerOptions = buildProviderOptions(visibleModels, { includeAll: false });
    const enabledProviders = providerOptions.filter((option) => Number(option.active || 0) > 0);
    const allOption = {
      value: 'all',
      label: 'All Providers',
      active: getActiveModelCount(),
      total: modelsState.total ?? visibleModels.length,
    };
    const mergedProviders = [
      allOption,
      ...enabledProviders.filter((option) => option.value !== 'all'),
    ];
    const filteredModels = filterModelsBySearchAndProvider(modelsState.models, {
      query,
      provider: modelsState.provider,
    });
    const pageTotal = modelsState.total;
    const totalPages = Math.ceil(modelsState.total / modelsState.limit) || 1;
    const currentPage = Math.floor(modelsState.offset / modelsState.limit) + 1;
    const pageStart = pageTotal === 0 ? 0 : modelsState.offset + 1;
    const pageEnd = Math.min(modelsState.offset + modelsState.limit, pageTotal);

    const rowsHtml = modelsState.loading
      ? `
                    ${Array.from({ length: 5 })
                      .map(
                        () => `
                      <tr class="bg-white text-xs animate-pulse">
                        <td class="px-4 py-4"><div class="h-4 w-32 rounded bg-gray-100"></div></td>
                        <td class="px-4 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
                        <td class="px-4 py-4"><div class="h-6 w-20 rounded-full bg-gray-100"></div></td>
                        <td class="px-4 py-4 text-right"><div class="ml-auto h-5 w-9 rounded-full bg-gray-100"></div></td>
                      </tr>
                    `
                      )
                      .join('')}
                  `
      : filteredModels.length === 0
        ? ''
        : filteredModels
            .map((model) => {
              const isDisabled = modelsState.disabledModels.has(model.id);
              return `
                    <tr data-model-row="${model.id}" class="text-xs hover:bg-gray-50/50 transition-colors ${isDisabled ? 'bg-gray-50/80 opacity-70' : 'bg-white'}">
                      <td class="px-4 py-4 font-medium text-gray-900 truncate" title="${model.name || model.id}">${model.name || model.id}</td>
                      <td class="px-4 py-4 font-mono truncate ${isDisabled ? 'text-gray-300' : 'text-gray-400'}" title="${model.id}">${model.id}</td>
                      <td class="px-4 py-4">
                        <div class="flex items-center gap-2">
                          ${renderModelAccessBadgeForModel(model)}
                        </div>
                      </td>
                      <td class="px-4 py-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            class="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${isDisabled || !canManageAcls ? 'hidden' : ''}"
                            data-model-acl="${model.id}"
                            title="Edit access rules"
                            aria-label="Edit access rules"
                            ${isDisabled || !canManageAcls ? 'tabindex="-1" aria-hidden="true" disabled aria-disabled="true"' : ''}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-5">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
            })
            .join('');

    if (!ensureMounted()) {
      container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
<div id="models-error-container">${modelsState.error ? `<div data-error-banner class="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3"><span>${modelsState.error}</span></div>` : ''}</div>
        ${renderModelsHeaderHtml({
          countTitle: 'Selected models',
          countLabel: 'Selected models',
          countValue: getActiveModelCount(),
          searchId: 'model-search-input',
          searchValue: modelsState.query,
          clearId: 'model-clear-search-container',
          clearButtonId: 'model-clear-search-btn',
          clearHidden: !modelsState.query,
          providerId: 'model-provider-select',
          providerOptionsMarkup: mergedProviders
            .map(
              (option) => `
            <option value="${option.value}" ${option.value === modelsState.provider ? 'selected' : ''}>
              ${option.label}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
            </option>
          `
            )
            .join(''),
        })}
        ${renderModelsTableShellHtml({
          loading: modelsState.loading,
          rowsHtml,
          emptyMessage: `No models found${usingFilter ? ` matching "${modelsState.query}"` : ''}.`,
          tbodyId: 'models-table-body',
          emptyColSpan: 4,
        })}
        ${renderModelsPaginationHtml({
          pageSizeId: 'page-size-select',
          limit: modelsState.limit,
          pageStart,
          pageEnd,
          pageTotal,
          currentPage,
          totalPages,
          loading: modelsState.loading,
          usingFilter,
        })}
      </div>
    `;
      container.dataset.modelsMounted = '1';
      bindDelegatedEvents();
    } else {
      syncUi();
    }
  };

  const loadModels = async (force = false) => {
    if (!isActiveTab()) return;
    if (modelsState.models.length > 0 && !force) return;
    const shouldShowLoading = modelsState.models.length === 0;
    modelsState.loading = shouldShowLoading;
    if (shouldShowLoading) {
      render();
    }
    try {
      const res = await apiFetch('/api/admin/models?limit=0&offset=0');
      if (res.ok) {
        const payload = await res.json();
        const selectedModels = sortModelsByActiveThenName(
          (Array.isArray(payload.models) ? payload.models : []).filter(
            (model) => model?.enabled !== false
          )
        );
        modelsState.models = selectedModels;
        modelsState.total = selectedModels.length;
        modelsState.activeTotal = selectedModels.length;
        modelsState.providerOptions = buildProviderOptions(modelsState.models, {
          includeAll: false,
        });
        modelsState.disabledModels = new Set();
        const capsFromModels = extractAttachmentCapsFromModels(modelsState.models);
        modelsState.attachmentCaps = capsFromModels;
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
