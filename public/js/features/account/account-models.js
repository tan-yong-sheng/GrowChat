import { apiFetch, fetchModels } from '../../shared/api.js';
import { buildProviderOptions } from '../../shared/utils/model-filters.js';
import { normalizeModelSearchQuery } from '../../shared/utils/model-search.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../../shared/utils/model-state.js';
import { broadcastModelsInvalidation } from '../../shared/utils/model-sync.js';
import { renderModelAccessBadgeForModel } from '../../shared/components/model-access-badge.js';
import {
  renderModelsHeaderHtml,
  renderModelsPaginationHtml,
  renderModelsTableShellHtml,
  syncModelsHeaderState,
  syncModelsPaginationState,
  syncModelsTableState,
} from '../../shared/components/models-section.js';
import { normalizeUserResourceOverrides } from '../../shared/utils/user-resource-overrides.js';
import { escapeHtml } from '../../shared/utils/dom-escape.js';
import { cloneAttachmentCaps } from '../../shared/utils/attachment-caps.js';
import {
  normalizeAttachmentCaps,
  normalizePersonalModelSettings,
  normalizeModelRecord,
  renderLoadingRows,
  renderModelRow,
} from './account-models-helpers.js';
import { bindModelsEvents } from './account-models-events.js';
import {
  isUsingFilter,
  renderProviderOptionsHtml,
  buildNextPreferencesPayload,
  mergeSavedAttachmentCaps,
  buildCombinedModelsArray,
  applyRollbackState,
  parseDisabledModelIds,
} from './account-models-payload.js';

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
    const nextPreferences = buildNextPreferencesPayload(sectionState, state.settings);

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
      if (rollback) applyRollbackState(sectionState, rollback);
      sectionState.error = err?.message || 'Failed to save model settings';
      render();
    }
  };

  const syncUi = () => {
    const visibleModels = Array.isArray(sectionState.models) ? sectionState.models : [];
    const usingFilter = isUsingFilter(sectionState.query, sectionState.provider);
    const providerOpts = renderProviderOptionsHtml(
      sectionState.providerOptions,
      sectionState.models,
      sectionState.provider
    );

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
      providerOptionsMarkup: providerOpts,
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
          : `No models found${usingFilter ? ` matching "${escapeHtml(sectionState.query)}"` : ''}.`,
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
      usingFilter: isUsingFilter(sectionState.query, sectionState.provider),
    });

    const errorSlot = container.querySelector('#account-models-error-container');
    if (errorSlot) {
      errorSlot.textContent = sectionState.error ? sectionState.error : '';
    }
  };

  const bindDelegatedEvents = () => {
    bindModelsEvents({ container, sectionState, persistModelSettings, syncUi, loadModels });
  };

  function render() {
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
    const usingFilter = isUsingFilter(sectionState.query, sectionState.provider);
    const visibleModels = Array.isArray(sectionState.models) ? sectionState.models : [];
    const rowsHtml = sectionState.loading
      ? renderLoadingRows()
      : `${visibleModels.length ? visibleModels.map((model) => renderModelRow(model)).join('') : ''}`;
    const providerOpts = renderProviderOptionsHtml(
      sectionState.providerOptions,
      sectionState.models,
      sectionState.provider
    );

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
          providerOptionsMarkup: providerOpts,
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
  }

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
      const partitioned = partitionModelsByVisibility(payload);
      const disabledSet = parseDisabledModelIds(payload);
      const filtered = filterModelsByDisabled(partitioned, disabledSet);
      const savedSettings = normalizePersonalModelSettings(
        state.settings?.preferences?.model_settings
      );
      const mergedCaps = buildMergedAttachmentCaps(
        filtered.visibleModels,
        filtered.hiddenModels,
        savedSettings,
        sectionState.attachmentCaps
      );
      const mergedDisabledSet = mergeSavedAttachmentCaps(savedSettings, mergedCaps, sectionState);
      applyLoadedModelsToState(
        payload,
        filtered.visibleModels,
        filtered.hiddenModels,
        mergedCaps,
        mergedDisabledSet,
        sectionState
      );
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

function partitionModelsByVisibility(payload) {
  const responseVisibleModels = Array.isArray(payload?.models)
    ? payload.models.map(normalizeModelRecord).filter(Boolean)
    : [];
  const responseHiddenModels = Array.isArray(payload?.hidden_models)
    ? payload.hidden_models.map(normalizeModelRecord).filter(Boolean)
    : [];
  const fallbackHiddenModels = responseVisibleModels.filter(
    (model) => model.hidden_for_user === true
  );
  const visibleModels = responseVisibleModels.filter(
    (model) => model.hidden_for_user !== true
  );
  const hiddenModels = [...responseHiddenModels, ...fallbackHiddenModels];
  return { visibleModels, hiddenModels };
}

function filterModelsByDisabled({ visibleModels, hiddenModels }, disabledSet) {
  return {
    visibleModels: visibleModels.filter((model) => !disabledSet.has(model.id)),
    hiddenModels: hiddenModels.filter(
      (model) => model.hidden_for_user === true && !disabledSet.has(model.id)
    ),
  };
}

function buildMergedAttachmentCaps(visibleModels, hiddenModels, savedSettings, attachmentCaps) {
  const mergedCaps = cloneAttachmentCaps(attachmentCaps);
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
  return mergedCaps;
}

function applyLoadedModelsToState(
  payload,
  visibleModels,
  hiddenModels,
  mergedCaps,
  mergedDisabledSet,
  sectionState
) {
  const combinedModels = buildCombinedModelsArray(visibleModels, hiddenModels, mergedCaps);
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
  sectionState.disabledModelIds = new Set(mergedDisabledSet);
  sectionState.originalDisabledModelIds = new Set(mergedDisabledSet);
  sectionState.attachmentCaps = cloneAttachmentCaps(mergedCaps);
  sectionState.originalAttachmentCaps = cloneAttachmentCaps(mergedCaps);
  sectionState.needsReload = false;
}
