import { apiFetch, fetchModels } from '../../shared/api.js';
import { buildProviderOptions } from '../../shared/utils/model-filters.js';
import { normalizeModelSearchQuery } from '../../shared/utils/model-search.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../../shared/utils/model-state.js';
import { getModelAccessPresentation } from '../../shared/utils/model-access-presentation.js';
import { broadcastModelsInvalidation } from '../../shared/utils/model-sync.js';
import {
  renderModelsHeaderHtml,
  renderModelsPaginationHtml,
  renderModelsTableShellHtml,
  syncModelsHeaderState,
  syncModelsPaginationState,
  syncModelsTableState,
} from '../../shared/components/models-section.js';
import { normalizeUserResourceOverrides } from '../../shared/utils/user-resource-overrides.js';
import { ATTACHMENT_CAP_TYPES } from '../admin/settings/models-helpers.js';

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
  const source =
    raw.model_settings &&
    typeof raw.model_settings === 'object' &&
    !Array.isArray(raw.model_settings)
      ? raw.model_settings
      : raw;
  const resourceOverrides = normalizeUserResourceOverrides(
    raw.resource_overrides ? raw : { model_settings: source }
  );
  const disabledModelIds = Array.from(
    new Set(
      [
        ...(Array.isArray(source.disabled_model_ids) ? source.disabled_model_ids : []),
        ...(resourceOverrides.models.hidden_ids || []),
      ]
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );
  const attachmentCaps =
    source.attachment_caps &&
    typeof source.attachment_caps === 'object' &&
    !Array.isArray(source.attachment_caps)
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
  return Array.from({ length: 5 })
    .map(
      () => `
    <tr class="bg-white text-xs animate-pulse">
      <td class="px-4 py-4"><div class="h-4 w-32 rounded bg-gray-100"></div></td>
      <td class="px-4 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
      <td class="px-4 py-4">
        <div class="h-6 w-20 rounded-full bg-gray-100"></div>
      </td>
      <td class="px-4 py-4 text-right">
        <div class="ml-auto h-5 w-9 rounded-full bg-gray-100"></div>
      </td>
    </tr>
  `
    )
    .join('');
}

function renderModelRow(model) {
  const enabled = model.enabled !== false;
  const access = getModelAccessPresentation(model, {
    sharedLabel: 'Admin',
    sharedClassName: 'border-sky-100 bg-sky-50 text-sky-700',
  });
  const toggleClass = `relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-black' : 'bg-gray-200'}`;
  return `
    <tr data-model-row="${escapeHtml(model.id)}" class="bg-white text-xs hover:bg-gray-50/50 transition-colors ${enabled ? '' : 'bg-gray-50/80 opacity-70'}">
      <td class="px-4 py-4 font-medium text-gray-900 truncate" title="${escapeHtml(model.name || model.id)}">${escapeHtml(model.name || model.id)}</td>
      <td class="px-4 py-4 text-gray-500 font-mono truncate ${enabled ? '' : 'text-gray-400'}" title="${escapeHtml(model.id)}">${escapeHtml(model.id)}</td>
      <td class="px-4 py-4">
        <div class="flex items-center gap-2">
          <span
            data-model-access="${escapeHtml(model.id)}"
            class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${access.className}"
          >
            ${escapeHtml(access.label)}
          </span>
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
          >
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
        </div>
      </td>
    </tr>
  `;
}

export function renderAccountModelsSection(container, state = {}, { onRefresh, routeCache } = {}) {
  const savedModelSettings = normalizePersonalModelSettings(
    state.settings?.preferences?.model_settings
  );
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
  let saveRequestVersion = 0;

  const ensureMounted = () =>
    container.dataset.modelsMounted === '1' &&
    Boolean(container.querySelector('[data-models-scroll]'));

  const persistModelSettings = async ({ rollback = null } = {}) => {
    const requestVersion = ++saveRequestVersion;
    const nextPreferences = {
      ...(state.settings?.preferences || {}),
      model_settings: {
        disabled_model_ids: Array.from(sectionState.disabledModelIds),
        attachment_caps: cloneAttachmentCaps(sectionState.attachmentCaps || {}),
      },
      resource_overrides: {
        ...((state.settings?.preferences || {}).resource_overrides || {}),
        models: {
          hidden_ids: Array.from(sectionState.disabledModelIds),
        },
      },
    };

    try {
      const res = await apiFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({ preferences: nextPreferences }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to save model settings');
      }
      const payload = await res.json().catch(() => ({}));
      if (requestVersion !== saveRequestVersion) return;
      const committedPreferences = payload?.user?.preferences || nextPreferences;
      state.settings = {
        ...(state.settings || {}),
        preferences: committedPreferences,
      };
      sectionState.originalDisabledModelIds = new Set(sectionState.disabledModelIds);
      sectionState.originalAttachmentCaps = cloneAttachmentCaps(sectionState.attachmentCaps);
      sectionState.error = '';
      broadcastModelsInvalidation();
    } catch (err) {
      if (requestVersion !== saveRequestVersion) return;
      if (rollback) {
        sectionState.disabledModelIds = new Set(rollback.disabledModelIds || []);
        sectionState.models = Array.isArray(rollback.models)
          ? rollback.models.map((item) => ({
              ...item,
              attachments: cloneAttachmentCaps(item.attachments),
            }))
          : sectionState.models;
        sectionState.attachmentCaps = cloneAttachmentCaps(rollback.attachmentCaps || {});
        sectionState.providerOptions = Array.isArray(rollback.providerOptions)
          ? rollback.providerOptions.map((option) => ({ ...option }))
          : buildProviderOptions(sectionState.models, { includeAll: true });
        sectionState.activeTotal = Number.isFinite(rollback.activeTotal)
          ? rollback.activeTotal
          : sectionState.activeTotal;
        sectionState.total = Number.isFinite(rollback.total) ? rollback.total : sectionState.total;
      }
      sectionState.error = err?.message || 'Failed to save model settings';
      render();
    }
  };

  const syncUi = () => {
    const visibleModels = Array.isArray(sectionState.models) ? sectionState.models : [];
    syncModelsHeaderState(container, {
      countTitle: 'Available to you',
      countLabel: 'Available to you',
      countValue: sectionState.activeTotal,
      searchId: 'account-model-search-input',
      searchValue: sectionState.query,
      clearId: 'model-clear-search-container',
      clearButtonId: 'model-clear-search-btn',
      clearHidden: !sectionState.query,
      providerId: 'account-model-provider-select',
      providerOptionsMarkup: sectionState.providerOptions.length
        ? sectionState.providerOptions
            .map(
              (option) => `
            <option value="${escapeHtml(option.value)}" ${option.value === sectionState.provider ? 'selected' : ''}>
              ${escapeHtml(option.label)}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
            </option>
          `
            )
            .join('')
        : buildProviderOptions(sectionState.models, { includeAll: true })
            .map(
              (option) => `
            <option value="${escapeHtml(option.value)}" ${option.value === sectionState.provider ? 'selected' : ''}>
              ${escapeHtml(option.label)}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
            </option>
          `
            )
            .join(''),
    });

    syncModelsTableState(container, {
      loading: sectionState.loading,
      rowsHtml: sectionState.loading
        ? renderLoadingRows()
        : `${visibleModels.length ? visibleModels.map((model) => renderModelRow(model)).join('') : ''}`,
      emptyMessage:
        sectionState.total === 0 &&
        !normalizeModelSearchQuery(sectionState.query) &&
        sectionState.provider === 'all'
          ? 'No models are available to you.'
          : `No models found${Boolean(normalizeModelSearchQuery(sectionState.query)) || sectionState.provider !== 'all' ? ` matching "${escapeHtml(sectionState.query)}"` : ''}.`,
      tbodyId: 'account-models-table-body',
    });

    syncModelsPaginationState(container, {
      pageSizeId: 'page-size-select',
      limit: sectionState.limit,
      pageStart: sectionState.total === 0 ? 0 : sectionState.offset + 1,
      pageEnd: Math.min(
        sectionState.offset + sectionState.limit,
        sectionState.total || sectionState.models.length
      ),
      pageTotal: Number.isFinite(sectionState.total)
        ? sectionState.total
        : sectionState.models.length,
      currentPage: Math.max(
        1,
        Math.floor(sectionState.offset / Math.max(1, sectionState.limit)) + 1
      ),
      totalPages: Math.max(
        1,
        Math.ceil(
          (Number.isFinite(sectionState.total) ? sectionState.total : sectionState.models.length) /
            Math.max(1, sectionState.limit)
        )
      ),
      loading: sectionState.loading,
      usingFilter:
        Boolean(normalizeModelSearchQuery(sectionState.query)) || sectionState.provider !== 'all',
    });

    const errorSlot = container.querySelector('#account-models-error-container');
    if (errorSlot) {
      errorSlot.textContent = sectionState.error ? sectionState.error : '';
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
        const modelId = toggleBtn.getAttribute('data-model-id');
        const visibleIndex = sectionState.models.findIndex((item) => item.id === modelId);
        if (visibleIndex < 0) return;
        const model = sectionState.models[visibleIndex];
        const previousActiveTotal = sectionState.activeTotal;
        const previousTotal = sectionState.total;
        const previousModels = sectionState.models.map((item) => ({
          ...item,
          attachments: cloneAttachmentCaps(item.attachments),
        }));
        const previousDisabledModelIds = Array.from(sectionState.disabledModelIds);
        const previousAttachmentCaps = cloneAttachmentCaps(sectionState.attachmentCaps);
        const previousProviderOptions = Array.isArray(sectionState.providerOptions)
          ? sectionState.providerOptions.map((option) => ({ ...option }))
          : [];
        const shouldEnable = model.enabled === false;
        sectionState.models = sectionState.models.map((item, index) =>
          index === visibleIndex
            ? {
                ...item,
                enabled: shouldEnable,
                hidden_for_user: !shouldEnable,
                visible_for_user: shouldEnable,
              }
            : item
        );
        sectionState.activeTotal = Math.max(0, sectionState.activeTotal + (shouldEnable ? 1 : -1));
        sectionState.total = Math.max(0, sectionState.total);
        if (shouldEnable) sectionState.disabledModelIds.delete(modelId);
        else sectionState.disabledModelIds.add(modelId);
        sectionState.providerOptions = buildProviderOptions(sectionState.models, {
          includeAll: true,
        });
        const rollback = {
          modelId,
          models: previousModels,
          disabledModelIds: previousDisabledModelIds,
          attachmentCaps: previousAttachmentCaps,
          providerOptions: previousProviderOptions,
          activeTotal: previousActiveTotal,
          total: previousTotal,
        };
        syncUi();
        sectionState.error = '';
        void persistModelSettings({ rollback });
        return;
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

  const render = () => {
    const providerOptions = sectionState.providerOptions.length
      ? sectionState.providerOptions
      : buildProviderOptions(sectionState.models, { includeAll: true });
    const activeTotal = Number.isFinite(sectionState.activeTotal) ? sectionState.activeTotal : 0;
    const pageTotal = Number.isFinite(sectionState.total)
      ? sectionState.total
      : sectionState.models.length;
    const totalPages = Math.max(1, Math.ceil((pageTotal || 0) / Math.max(1, sectionState.limit)));
    const currentPage = Math.max(
      1,
      Math.floor(sectionState.offset / Math.max(1, sectionState.limit)) + 1
    );
    const pageStart = pageTotal === 0 ? 0 : sectionState.offset + 1;
    const pageEnd = Math.min(sectionState.offset + sectionState.limit, pageTotal);
    const usingFilter =
      Boolean(normalizeModelSearchQuery(sectionState.query)) || sectionState.provider !== 'all';
    const visibleModels = Array.isArray(sectionState.models) ? sectionState.models : [];
    const rowsHtml = sectionState.loading
      ? renderLoadingRows()
      : `${visibleModels.length ? visibleModels.map((model) => renderModelRow(model)).join('') : ''}`;

    if (!ensureMounted()) {
      const fragment = document.createRange().createContextualFragment(`
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div id="account-models-error-container"></div>
        ${renderModelsHeaderHtml({
          countTitle: 'Available to you',
          countLabel: 'Available to you',
          countValue: activeTotal,
          searchId: 'account-model-search-input',
          searchValue: sectionState.query,
          clearId: 'model-clear-search-container',
          clearButtonId: 'model-clear-search-btn',
          clearHidden: !sectionState.query,
          providerId: 'account-model-provider-select',
          providerOptionsMarkup: providerOptions
            .map(
              (option) => `
            <option value="${escapeHtml(option.value)}" ${option.value === sectionState.provider ? 'selected' : ''}>
              ${escapeHtml(option.label)}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
            </option>
          `
            )
            .join(''),
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
    `);
      container.replaceChildren(fragment);
      container.dataset.modelsMounted = '1';
      bindDelegatedEvents();
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
        scope: 'effective',
      });
      const responseVisibleModels = Array.isArray(payload?.models)
        ? payload.models.map(normalizeModelRecord).filter(Boolean)
        : [];
      const responseHiddenModels = Array.isArray(payload?.hidden_models)
        ? payload.hidden_models.map(normalizeModelRecord).filter(Boolean)
        : [];
      const disabledModelIds = new Set(
        Array.isArray(payload?.visibility?.disabled_model_ids)
          ? payload.visibility.disabled_model_ids
              .map((id) => String(id || '').trim())
              .filter(Boolean)
          : []
      );
      const fallbackHiddenModels = responseVisibleModels.filter(
        (model) => model.hidden_for_user === true
      );
      const visibleModels = responseVisibleModels.filter(
        (model) => model.hidden_for_user !== true && !disabledModelIds.has(model.id)
      );
      const hiddenModels = [...responseHiddenModels, ...fallbackHiddenModels].filter(
        (model) => model.hidden_for_user === true && !disabledModelIds.has(model.id)
      );
      const savedSettings = normalizePersonalModelSettings(
        state.settings?.preferences?.model_settings
      );
      const mergedCaps = cloneAttachmentCaps(sectionState.attachmentCaps);
      [...visibleModels, ...hiddenModels].forEach((model) => {
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
      const combinedModels = [
        ...visibleModels.map((model) => ({
          ...model,
          enabled: model.enabled !== false,
          hidden_for_user: false,
          visible_for_user: true,
          attachments: mergedCaps[model.id] || normalizeAttachmentCaps(model.attachments),
        })),
        ...hiddenModels.map((model) => ({
          ...model,
          enabled: false,
          hidden_for_user: true,
          visible_for_user: false,
          attachments: mergedCaps[model.id] || normalizeAttachmentCaps(model.attachments),
        })),
      ];
      sectionState.models = sortModelsByActiveThenName(combinedModels);
      sectionState.total = Number.isFinite(payload?.total)
        ? payload.total
        : sectionState.models.length;
      sectionState.activeTotal = Number.isFinite(payload?.active_total)
        ? payload.active_total
        : countEnabledModels(sectionState.models);
      sectionState.limit = Number.isFinite(payload?.limit) ? payload.limit : sectionState.limit;
      sectionState.offset = Number.isFinite(payload?.offset) ? payload.offset : sectionState.offset;
      sectionState.providerOptions =
        Array.isArray(payload?.providers) && payload.providers.length > 0
          ? payload.providers
          : buildProviderOptions(sectionState.models, { includeAll: true });
      sectionState.disabledModelIds = new Set(disabledSet);
      sectionState.originalDisabledModelIds = new Set(disabledSet);
      sectionState.attachmentCaps = cloneAttachmentCaps(mergedCaps);
      sectionState.originalAttachmentCaps = cloneAttachmentCaps(mergedCaps);
      sectionState.needsReload = false;
    } catch (err) {
      sectionState.error = err?.message || 'Failed to load models';
    } finally {
      sectionState.loading = false;
      render();
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
