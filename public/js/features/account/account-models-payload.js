import { buildProviderOptions } from '../../shared/utils/model-filters.js';
import { normalizeModelSearchQuery } from '../../shared/utils/model-search.js';
import { cloneAttachmentCaps } from '../../shared/utils/attachment-caps.js';
import { normalizeAttachmentCaps } from './account-models-helpers.js';
import { escapeHtml } from '../../shared/utils/dom-escape.js';

/** @returns {boolean} whether the query or provider filter is active */
export function isUsingFilter(query, provider) {
  return Boolean(normalizeModelSearchQuery(query)) || provider !== 'all';
}

/**
 * Render <option> elements for the provider filter select.
 * Falls back to buildProviderOptions if providerOptions is empty.
 */
export function renderProviderOptionsHtml(providerOptions, models, currentProvider) {
  const opts = providerOptions.length
    ? providerOptions
    : buildProviderOptions(models, { includeAll: true });
  return opts
    .map(
      (option) => `
    <option value="${escapeHtml(option.value)}" ${option.value === currentProvider ? 'selected' : ''}>
      ${escapeHtml(option.label)}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
    </option>
  `
    )
    .join('');
}

/** Build the nextPreferences payload for the PUT /api/users/me call */
export function buildNextPreferencesPayload(sectionState, currentSettings) {
  return {
    ...(currentSettings?.preferences || {}),
    model_settings: {
      disabled_model_ids: Array.from(sectionState.disabledModelIds),
      attachment_caps: cloneAttachmentCaps(sectionState.attachmentCaps || {}),
    },
    resource_overrides: {
      ...((currentSettings?.preferences || {}).resource_overrides || {}),
      models: {
        hidden_ids: Array.from(sectionState.disabledModelIds),
      },
    },
  };
}

/** Merge attachment caps from saved settings into the live merged set, also merging disabled model IDs */
export function mergeSavedAttachmentCaps(savedSettings, mergedCaps, sectionState) {
  Object.entries(savedSettings.attachment_caps || {}).forEach(([modelId, values]) => {
    mergedCaps[modelId] = {
      ...(mergedCaps[modelId] || {}),
      ...normalizeAttachmentCaps(values),
    };
  });
  const disabledSet = new Set(sectionState.disabledModelIds);
  savedSettings.disabled_model_ids.forEach((modelId) => disabledSet.add(modelId));
  return disabledSet;
}

/** Build combined visible+hidden model array with enriched metadata */
export function buildCombinedModelsArray(visibleModels, hiddenModels, mergedCaps) {
  return [
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
}

/** Restore sectionState from a rollback snapshot after a failed save */
export function applyRollbackState(sectionState, rollback) {
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

/** Parse and deduplicate disabled model IDs from the fetch payload */
export function parseDisabledModelIds(payload) {
  return new Set(
    Array.isArray(payload?.visibility?.disabled_model_ids)
      ? payload.visibility.disabled_model_ids.map((id) => String(id || '').trim()).filter(Boolean)
      : []
  );
}
