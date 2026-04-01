import { apiFetch, fetchModels } from '../../shared/api.js';
import { buildProviderOptions } from '../../shared/utils/model-filters.js';
import { normalizeModelSearchQuery } from '../../shared/utils/model-search.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../../shared/utils/model-state.js';
import { renderErrorBanner } from '../../shared/components/section-header.js';
import { broadcastModelsInvalidation } from '../../shared/utils/model-sync.js';
import { createStagedSaveQueue } from '../../shared/utils/staged-save.js';
import { renderSettingsActionFooter } from '../../shared/components/settings-action-footer.js';
import {
  renderModelsHeaderHtml,
  renderModelsPaginationHtml,
  renderModelsTableShellHtml,
  syncModelsHeaderState,
  syncModelsPaginationState,
  syncModelsTableState,
} from '../../shared/components/models-section.js';
import { normalizeWorkspaceCapabilities } from '../../shared/utils/workspace-capabilities.js';
import { normalizeUserResourceOverrides } from '../../shared/utils/user-resource-overrides.js';
import { ATTACHMENT_CAP_TYPES, getAttachmentCapTooltip, getAttachmentCapValue } from '../admin/settings/models-helpers.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeAttachmentCaps(attachments = {}) {
  const next = {};
  ATTACHMENT_CAP_TYPES.forEach(({ key }) => {
    next[key] = Boolean(attachments?.[key]);
  });
  return next;
}

function cloneAttachmentCaps(caps = {}) {
  const next = {};
  Object.entries(caps || {}).forEach(([modelId, values]) => {
    if (!values || typeof values !== 'object') return;
    next[modelId] = { ...values };
  });
  return next;
}

function normalizePersonalModelSettings(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const source = raw.model_settings && typeof raw.model_settings === 'object' && !Array.isArray(raw.model_settings)
    ? raw.model_settings
    : raw;
  const resourceOverrides = normalizeUserResourceOverrides(raw.resource_overrides ? raw : { model_settings: source });
  const disabledModelIds = Array.from(new Set([
    ...(Array.isArray(source.disabled_model_ids) ? source.disabled_model_ids : []),
    ...(resourceOverrides.models.hidden_ids || []),
  ].map((id) => String(id || '').trim()).filter(Boolean)));
  const attachmentCaps = source.attachment_caps && typeof source.attachment_caps === 'object' && !Array.isArray(source.attachment_caps)
    ? source.attachment_caps
    : {};
  return {
    disabled_model_ids: disabledModelIds,
    attachment_caps: cloneAttachmentCaps(attachmentCaps),
  };
}

function normalizeModelRecord(model = {}) {
  const id = String(model?.id || model?.modelId || model?.name || '').trim();
  if (!id) return null;
  return {
    ...model,
    id,
    name: String(model?.name || model?.displayName || model?.id || id).trim() || id,
    enabled: model?.enabled !== false,
    attachments: normalizeAttachmentCaps(model?.attachments),
  };
}

function renderLoadingRows() {
  return Array.from({ length: 5 }).map(() => `
    <tr class="bg-white text-xs animate-pulse">
      <td class="px-4 py-4"><div class="h-4 w-32 rounded bg-gray-100"></div></td>
      <td class="px-4 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
      <td class="px-4 py-4">
        <div class="flex flex-wrap items-center gap-1.5">
          <div class="h-6 w-10 rounded-full bg-gray-100"></div>
          <div class="h-6 w-10 rounded-full bg-gray-100"></div>
        </div>
      </td>
      <td class="px-4 py-4 text-right">
        <div class="ml-auto h-5 w-9 rounded-full bg-gray-100"></div>
      </td>
    </tr>
  `).join('');
}

function renderAttachmentCaps(model, canManageModels = true) {
  return ATTACHMENT_CAP_TYPES.map(({ key, short, label }) => {
    const value = getAttachmentCapValue({ [model.id]: model.attachments }, model.id, key);
    const state = value ? 'allowed' : 'unset';
    const className = value
      ? 'bg-emerald-500 text-white border-emerald-500'
      : 'bg-gray-50 text-gray-500 border-gray-200';
    const tooltip = getAttachmentCapTooltip(label, key, state);
    return `
      <button
        type="button"
        ${canManageModels ? '' : 'disabled aria-disabled="true"'}
        data-cap-model="${escapeHtml(model.id)}"
        data-cap-kind="${escapeHtml(key)}"
        data-cap-label="${escapeHtml(label)}"
        data-cap-state="${escapeHtml(state)}"
        title="${escapeHtml(tooltip)}"
        class="inline-flex items-center justify-center h-6 min-w-[36px] px-2 rounded-full text-[10px] font-semibold border transition ${className} ${canManageModels ? 'hover:shadow-sm' : 'cursor-not-allowed opacity-60'}"
      >
        ${escapeHtml(short)}
      </button>
    `;
  }).join('');
}

function renderModelRow(model, canManageModels = true) {
  const enabled = model.enabled !== false;
  const toggleClass = canManageModels
    ? `relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-black' : 'bg-gray-200'}`
    : 'relative inline-flex h-5 w-9 items-center shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-200 opacity-50';
  return `
    <tr data-model-row="${escapeHtml(model.id)}" class="bg-white text-xs hover:bg-gray-50/50 transition-colors ${enabled ? '' : 'bg-gray-50/80 opacity-70'}">
      <td class="px-4 py-4 font-medium text-gray-900 truncate" title="${escapeHtml(model.name || model.id)}">${escapeHtml(model.name || model.id)}</td>
      <td class="px-4 py-4 text-gray-400 font-mono truncate ${enabled ? '' : 'text-gray-300'}" title="${escapeHtml(model.id)}">${escapeHtml(model.id)}</td>
      <td class="px-4 py-4">
        <div class="flex flex-wrap items-center gap-1.5">
          ${renderAttachmentCaps(model, canManageModels)}
        </div>
      </td>
      <td class="px-4 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="model-toggle ${toggleClass}"
            data-model-id="${escapeHtml(model.id)}"
            title="${enabled ? 'Model enabled' : 'Model disabled'}"
            aria-pressed="${enabled ? 'true' : 'false'}"
            ${canManageModels ? '' : 'disabled aria-disabled="true"'}
          >
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
        </div>
      </td>
    </tr>
  `;
}

export function renderAccountModelsSection(container, state = {}, { onRefresh, footerHost, routeCache } = {}) {
  const capabilities = normalizeWorkspaceCapabilities(state.capabilities, { route: 'account' });
  const canManageModels = capabilities.canManageModels !== false;
  const canManageAcls = capabilities.canManageAcls === true;
  const savedModelSettings = normalizePersonalModelSettings(state.settings?.preferences?.model_settings);
  const sectionState = {
    loading: true,
    error: '',
    models: [],
    providerOptions: [],
    query: '',
    provider: 'all',
    saving: false,
    total: 0,
    activeTotal: 0,
    limit: 20,
    offset: 0,
    disabledModelIds: new Set(savedModelSettings.disabled_model_ids),
    originalDisabledModelIds: new Set(savedModelSettings.disabled_model_ids),
    attachmentCaps: cloneAttachmentCaps(savedModelSettings.attachment_caps),
    originalAttachmentCaps: cloneAttachmentCaps(savedModelSettings.attachment_caps),
    invalidateToken: null,
    needsReload: false,
  };
  const stagedSave = createStagedSaveQueue({
    getSnapshot: () => ({
      disabledModelIds: Array.from(sectionState.disabledModelIds),
      attachmentCaps: cloneAttachmentCaps(sectionState.attachmentCaps),
    }),
    saveSnapshot: async (snapshot) => {
      const nextSettings = {
        ...(state.settings?.preferences || {}),
        model_settings: {
          disabled_model_ids: Array.from(snapshot.disabledModelIds || []),
          attachment_caps: cloneAttachmentCaps(snapshot.attachmentCaps || {}),
        },
        resource_overrides: {
          ...((state.settings?.preferences || {}).resource_overrides || {}),
          models: {
            hidden_ids: Array.from(snapshot.disabledModelIds || []),
          },
        },
      };
      const res = await apiFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          preferences: nextSettings,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to save model settings');
      }
      return res.json().catch(() => ({}));
    },
    onCommit: (snapshot, _version, payload = {}) => {
      sectionState.error = '';
      const savedModelSettings = normalizePersonalModelSettings({
        disabled_model_ids: Array.from(snapshot.disabledModelIds || []),
        attachment_caps: cloneAttachmentCaps(snapshot.attachmentCaps || {}),
      });
      state.settings = {
        ...(state.settings || {}),
        preferences: {
          ...(payload?.user?.preferences || state.settings?.preferences || {}),
          model_settings: {
            disabled_model_ids: Array.from(savedModelSettings.disabled_model_ids),
            attachment_caps: cloneAttachmentCaps(savedModelSettings.attachment_caps),
          },
        },
      };
      sectionState.disabledModelIds = new Set(savedModelSettings.disabled_model_ids);
      sectionState.originalDisabledModelIds = new Set(savedModelSettings.disabled_model_ids);
      sectionState.attachmentCaps = cloneAttachmentCaps(savedModelSettings.attachment_caps);
      sectionState.originalAttachmentCaps = cloneAttachmentCaps(savedModelSettings.attachment_caps);
      broadcastModelsInvalidation();
      updateButtons();
      render();
    },
    onError: (error) => {
      sectionState.error = error?.message || 'Failed to save model settings';
      updateButtons();
      render();
    },
  });

  const ensureMounted = () => container.dataset.modelsMounted === '1' && Boolean(container.querySelector('[data-models-scroll]'));

  const syncUi = () => {
    syncModelsHeaderState(container, {
      countTitle: 'Active models',
      countValue: sectionState.activeTotal || countEnabledModels(sectionState.models),
      searchId: 'account-model-search-input',
      searchValue: sectionState.query,
      clearId: 'model-clear-search-container',
      clearButtonId: 'model-clear-search-btn',
      clearHidden: !sectionState.query,
      providerId: 'account-model-provider-select',
      providerOptionsMarkup: sectionState.providerOptions.length
        ? sectionState.providerOptions.map((option) => `
            <option value="${escapeHtml(option.value)}" ${option.value === sectionState.provider ? 'selected' : ''}>
              ${escapeHtml(option.label)}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
            </option>
          `).join('')
        : buildProviderOptions(sectionState.models, { includeAll: true }).map((option) => `
            <option value="${escapeHtml(option.value)}" ${option.value === sectionState.provider ? 'selected' : ''}>
              ${escapeHtml(option.label)}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
            </option>
          `).join(''),
    });

    syncModelsTableState(container, {
      loading: sectionState.loading,
      rowsHtml: sectionState.loading
        ? renderLoadingRows()
        : sectionState.models.length
          ? sectionState.models.map((model) => renderModelRow(model, canManageModels)).join('')
          : '',
      emptyMessage: `No models found${Boolean(normalizeModelSearchQuery(sectionState.query)) || sectionState.provider !== 'all' ? ` matching "${escapeHtml(sectionState.query)}"` : ''}.`,
      tbodyId: 'account-models-table-body',
    });

    syncModelsPaginationState(container, {
      pageSizeId: 'page-size-select',
      limit: sectionState.limit,
      pageStart: sectionState.total === 0 ? 0 : sectionState.offset + 1,
      pageEnd: Math.min(sectionState.offset + sectionState.limit, sectionState.total || sectionState.models.length),
      pageTotal: Number.isFinite(sectionState.total) ? sectionState.total : sectionState.models.length,
      currentPage: Math.max(1, Math.floor(sectionState.offset / Math.max(1, sectionState.limit)) + 1),
      totalPages: Math.max(1, Math.ceil((Number.isFinite(sectionState.total) ? sectionState.total : sectionState.models.length) / Math.max(1, sectionState.limit))),
      loading: sectionState.loading,
      usingFilter: Boolean(normalizeModelSearchQuery(sectionState.query)) || sectionState.provider !== 'all',
    });

    const errorSlot = container.querySelector('#account-models-error-container');
    if (errorSlot) {
      errorSlot.innerHTML = sectionState.error ? renderErrorBanner({ message: sectionState.error }) : '';
    }
  };

  const bindDelegatedEvents = () => {
    if (container.dataset.modelsEventsBound === '1') return;
    container.dataset.modelsEventsBound = '1';

    let searchDebounce = null;

    container.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.id !== 'account-model-search-input') return;
      const nextValue = target.value;
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        sectionState.query = nextValue;
        sectionState.offset = 0;
        loadModels(true);
      }, 120);
    });

    container.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const clearBtn = target.closest('#model-clear-search-btn');
      if (clearBtn) {
        sectionState.query = '';
        sectionState.offset = 0;
        loadModels(true);
        return;
      }

      const prevBtn = target.closest('#prev-page');
      if (prevBtn) {
        sectionState.offset = Math.max(0, sectionState.offset - sectionState.limit);
        loadModels(true);
        return;
      }

      const nextBtn = target.closest('#next-page');
      if (nextBtn) {
        sectionState.offset = sectionState.offset + sectionState.limit;
        loadModels(true);
        return;
      }

      const toggleBtn = target.closest('.model-toggle');
      if (toggleBtn) {
        if (!canManageModels) return;
        const modelId = toggleBtn.getAttribute('data-model-id');
        const model = sectionState.models.find((item) => item.id === modelId);
        if (!model) return;
        const nextEnabled = model.enabled === false;
        model.enabled = nextEnabled;
        if (nextEnabled) {
          sectionState.disabledModelIds.delete(modelId);
        } else {
          sectionState.disabledModelIds.add(modelId);
        }
        sectionState.activeTotal = Math.max(
          0,
          (Number.isFinite(sectionState.activeTotal) ? sectionState.activeTotal : countEnabledModels(sectionState.models)) + (nextEnabled ? 1 : -1),
        );
        syncUi();
        sectionState.error = '';
        stagedSave.stage();
        syncFooter();
        return;
      }

      const capBtn = target.closest('[data-cap-model]');
      if (capBtn) {
        if (!canManageModels) return;
        const modelId = capBtn.getAttribute('data-cap-model');
        const kind = capBtn.getAttribute('data-cap-kind');
        if (!modelId || !kind) return;
        const currentValue = getAttachmentCapValue(sectionState.attachmentCaps, modelId, kind);
        const nextValue = !currentValue;
        setAttachmentCapValue(modelId, kind, nextValue);
        syncUi();
        sectionState.error = '';
        stagedSave.stage();
        syncFooter();
      }
    });

    container.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === 'account-model-provider-select') {
        sectionState.provider = target.value || 'all';
        sectionState.offset = 0;
        loadModels(true);
        return;
      }
      if (target.id === 'page-size-select') {
        sectionState.limit = parseInt(target.value, 10) || 20;
        sectionState.offset = 0;
        loadModels(true);
      }
    });
  };

  const setAttachmentCapValue = (modelId, kind, value) => {
    const current = sectionState.attachmentCaps?.[modelId] || {};
    const next = { ...current };
    next[kind] = Boolean(value);
    sectionState.attachmentCaps = {
      ...(sectionState.attachmentCaps || {}),
      [modelId]: next,
    };
  };

  const hasCapsChanges = () => {
    const modelIds = new Set([
      ...Object.keys(sectionState.attachmentCaps || {}),
      ...Object.keys(sectionState.originalAttachmentCaps || {}),
    ]);
    for (const modelId of modelIds) {
      for (const { key } of ATTACHMENT_CAP_TYPES) {
        const currentValue = getAttachmentCapValue(sectionState.attachmentCaps, modelId, key);
        const originalValue = getAttachmentCapValue(sectionState.originalAttachmentCaps, modelId, key);
        if (currentValue !== originalValue) return true;
      }
    }
    return false;
  };

  const hasChanges = () => {
    if (sectionState.disabledModelIds.size !== sectionState.originalDisabledModelIds.size) return true;
    for (const id of sectionState.disabledModelIds) {
      if (!sectionState.originalDisabledModelIds.has(id)) return true;
    }
    if (hasCapsChanges()) return true;
    return false;
  };

  const getDirtyBadge = () => footerHost?.querySelector('#models-dirty') || container.querySelector('#models-dirty');

  const updateButtons = () => {
    const dirty = hasChanges();
    const dirtyBadge = getDirtyBadge();
    if (dirtyBadge) {
      dirtyBadge.classList.toggle('invisible', !dirty);
    }
    syncFooter();
  };

  const syncFooter = () => {
    if (!footerHost) return;
    footerHost.innerHTML = renderSettingsActionFooter({
      footerId: 'models-footer-actions',
      dirtyId: 'models-dirty',
      saveId: 'save-models',
      dirtyLabel: 'Unsaved changes',
      buttonLabel: 'Save',
      dirty: hasChanges(),
      saving: stagedSave.saving,
      canSave: canManageModels && hasChanges(),
    });
    footerHost.querySelector('#save-models')?.addEventListener('click', async () => {
      if (!canManageModels || stagedSave.saving || !hasChanges()) return;
      try {
        await stagedSave.flush();
      } catch {
        // Errors are surfaced by the queue callbacks.
      }
    });
  };

  const render = () => {
    const providerOptions = sectionState.providerOptions.length
      ? sectionState.providerOptions
      : buildProviderOptions(sectionState.models, { includeAll: true });
    const activeTotal = sectionState.activeTotal || countEnabledModels(sectionState.models);
    const pageTotal = Number.isFinite(sectionState.total) ? sectionState.total : sectionState.models.length;
    const totalPages = Math.max(1, Math.ceil((pageTotal || 0) / Math.max(1, sectionState.limit)));
    const currentPage = Math.max(1, Math.floor(sectionState.offset / Math.max(1, sectionState.limit)) + 1);
    const pageStart = pageTotal === 0 ? 0 : sectionState.offset + 1;
    const pageEnd = Math.min(sectionState.offset + sectionState.limit, pageTotal);
    const usingFilter = Boolean(normalizeModelSearchQuery(sectionState.query)) || sectionState.provider !== 'all';

    const rowsHtml = sectionState.loading
      ? renderLoadingRows()
      : sectionState.models.length
        ? sectionState.models.map((model) => renderModelRow(model, canManageModels)).join('')
        : '';

    if (!ensureMounted()) {
      container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div id="account-models-error-container">${sectionState.error ? renderErrorBanner({ message: sectionState.error }) : ''}</div>
        ${renderModelsHeaderHtml({
          countTitle: 'Active models',
          countValue: activeTotal,
          searchId: 'account-model-search-input',
          searchValue: sectionState.query,
          clearId: 'model-clear-search-container',
          clearButtonId: 'model-clear-search-btn',
          clearHidden: !sectionState.query,
          providerId: 'account-model-provider-select',
          providerOptionsMarkup: providerOptions.map((option) => `
            <option value="${escapeHtml(option.value)}" ${option.value === sectionState.provider ? 'selected' : ''}>
              ${escapeHtml(option.label)}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
            </option>
          `).join(''),
        })}
        ${renderModelsTableShellHtml({
          loading: sectionState.loading,
          rowsHtml,
          emptyMessage: `No models found${usingFilter ? ` matching "${escapeHtml(sectionState.query)}"` : ''}.`,
          tbodyId: 'account-models-table-body',
        })}
        ${renderModelsPaginationHtml({
          pageSizeId: 'page-size-select',
          limit: sectionState.limit,
          pageStart,
          pageEnd,
          pageTotal,
          currentPage,
          totalPages,
          loading: sectionState.loading,
          usingFilter,
        })} 
      </div>
    `;
      container.dataset.modelsMounted = '1';
      bindDelegatedEvents();
      syncFooter();
    } else {
      syncUi();
    }
  };

  const loadModels = async (force = false) => {
    if (!force && sectionState.models.length > 0) return;
    const shouldShowLoading = sectionState.models.length === 0;
    sectionState.loading = shouldShowLoading;
    sectionState.error = '';
    if (shouldShowLoading) {
      render();
    }
    try {
      const payload = await fetchModels({
        cache: 'no-store',
        limit: sectionState.limit,
        offset: sectionState.offset,
        provider: sectionState.provider !== 'all' ? sectionState.provider : undefined,
        q: normalizeModelSearchQuery(sectionState.query) || undefined,
        includeDisabled: true,
      });
      const models = Array.isArray(payload?.models)
        ? payload.models.map(normalizeModelRecord).filter(Boolean)
        : [];
      const savedSettings = normalizePersonalModelSettings(state.settings?.preferences?.model_settings);
      const mergedCaps = cloneAttachmentCaps(sectionState.attachmentCaps);
      models.forEach((model) => {
        mergedCaps[model.id] = {
          ...normalizeAttachmentCaps(model.attachments),
          ...(mergedCaps[model.id] || {}),
        };
      });
      Object.entries(savedSettings.attachment_caps || {}).forEach(([modelId, values]) => {
        mergedCaps[modelId] = {
          ...(mergedCaps[modelId] || {}),
          ...normalizeAttachmentCaps(values),
        };
      });
      const disabledSet = new Set(sectionState.disabledModelIds);
      savedSettings.disabled_model_ids.forEach((modelId) => disabledSet.add(modelId));
      models.forEach((model) => {
        if (model.enabled === false) disabledSet.add(model.id);
      });
      sectionState.models = sortModelsByActiveThenName(models.map((model) => ({
        ...model,
        enabled: !disabledSet.has(model.id),
        attachments: mergedCaps[model.id] || normalizeAttachmentCaps(model.attachments),
      })));
      sectionState.total = Number.isFinite(payload?.total) ? payload.total : models.length;
      sectionState.activeTotal = Number.isFinite(payload?.active_total) ? payload.active_total : countEnabledModels(sectionState.models);
      sectionState.limit = Number.isFinite(payload?.limit) ? payload.limit : sectionState.limit;
      sectionState.offset = Number.isFinite(payload?.offset) ? payload.offset : sectionState.offset;
      sectionState.providerOptions = Array.isArray(payload?.providers) && payload.providers.length > 0
        ? payload.providers
        : buildProviderOptions(sectionState.models, { includeAll: true });
      sectionState.disabledModelIds = new Set(disabledSet);
      sectionState.originalDisabledModelIds = new Set(disabledSet);
      sectionState.attachmentCaps = cloneAttachmentCaps(mergedCaps);
      sectionState.originalAttachmentCaps = cloneAttachmentCaps(mergedCaps);
    } catch (err) {
      sectionState.error = err?.message || 'Failed to load models';
    } finally {
      sectionState.loading = false;
      render();
      updateButtons();
      syncFooter();
    }
  };

  routeCache?.registerModelsRefresh?.(async () => {
    if (typeof onRefresh === 'function') {
      await onRefresh();
    }
    await loadModels(true);
  });

  render();
  loadModels(true);
}
