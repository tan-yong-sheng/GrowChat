import { escapeHtml } from '../../shared/utils/dom-escape.js';
import {
  filterModelsBySearch,
  normalizeModelSearchQuery,
} from '../../shared/utils/model-search.js';
import { sortModelsByActiveThenName } from '../../shared/utils/model-state.js';

export function getModelDisplayLabel(model) {
  return String(model?.name || model?.id || '').trim();
}

export function getModelScopeLabel(model) {
  const accessVariant = String(model?.access_variant || '')
    .trim()
    .toLowerCase();
  const accessLabel = String(model?.access_label || '')
    .trim()
    .toLowerCase();
  const source = String(model?.source || '')
    .trim()
    .toLowerCase();
  if (source === 'user' || accessVariant === 'personal' || accessLabel === 'personal') {
    return 'Personal';
  }
  return 'Shared';
}

export function getModelScopeBadgeClass(model) {
  return getModelScopeLabel(model) === 'Personal'
    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : 'border-gray-200 bg-gray-50 text-gray-500';
}

export function getModelSelectorAvailabilitySummary(count = 0, { loading = false } = {}) {
  if (loading) {
    return 'Loading selectable models...';
  }

  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (total <= 0) {
    return 'No selectable models are currently available for this chat.';
  }

  return `${total} selectable model${total === 1 ? '' : 's'}`;
}

export function getModelAvailabilityFallbackNotice({
  previousModelId = null,
  fallbackModel = null,
  currentChatModelId = null,
  disabledModelIds = [],
  hiddenModelIds = [],
} = {}) {
  const previousId = String(previousModelId || '').trim();
  if (!previousId) return null;

  const fallbackLabel = getModelDisplayLabel(fallbackModel) || fallbackModel?.id || 'another model';
  const disabledSet = new Set(
    Array.isArray(disabledModelIds)
      ? disabledModelIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []
  );
  const hiddenSet = new Set(
    Array.isArray(hiddenModelIds)
      ? hiddenModelIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []
  );

  if (hiddenSet.has(previousId)) {
    return {
      reason: 'personal_hide',
      message: `Your previous model is hidden for you. Switched to ${fallbackLabel}.`,
    };
  }

  if (disabledSet.has(previousId)) {
    return {
      reason: 'admin_disabled',
      message: `Your previous model was disabled by an admin. Switched to ${fallbackLabel}.`,
    };
  }

  if (String(currentChatModelId || '').trim() === previousId) {
    return {
      reason: 'chat_context',
      message: `This chat no longer allows your previous model. Switched to ${fallbackLabel}.`,
    };
  }

  return {
    reason: 'admin_disabled',
    message: `Your previous model is no longer available. Switched to ${fallbackLabel}.`,
  };
}

export function getPreferredModelId(models = [], preferredIds = []) {
  const sortedModels = sortModelsByActiveThenName(models);
  if (!sortedModels.length) return null;

  const modelIdSet = new Set(
    sortedModels.map((model) => String(model?.id || '').trim()).filter(Boolean)
  );
  for (const preferredId of Array.isArray(preferredIds) ? preferredIds : []) {
    const candidateId = String(preferredId || '').trim();
    if (candidateId && modelIdSet.has(candidateId)) {
      return candidateId;
    }
  }

  return sortedModels[0]?.id || null;
}

export function getModelSelectorDerivedState({
  sortedModels = [],
  searchQuery = '',
  visibleCount = 10,
  pageSize = 10,
  maxVisibleNoScroll = 40,
}) {
  const query = normalizeModelSearchQuery(searchQuery);
  const allFilteredModels = filterModelsBySearch(sortedModels, query);
  const showAll = allFilteredModels.length <= maxVisibleNoScroll;
  let nextVisibleCount = visibleCount;

  if (showAll) {
    nextVisibleCount = allFilteredModels.length;
  } else if (visibleCount < pageSize || visibleCount > allFilteredModels.length) {
    nextVisibleCount = Math.min(pageSize, allFilteredModels.length);
  }

  return {
    allFilteredModels,
    visibleCount: Math.min(nextVisibleCount, allFilteredModels.length),
    visibleModels: allFilteredModels.slice(0, Math.min(nextVisibleCount, allFilteredModels.length)),
  };
}

export function renderModelSelectorOption(model, currentState) {
  const isSelected = currentState.activeModelId === model.id;
  const isDefault = currentState.defaultModelId === model.id;
  const scopeLabel = getModelScopeLabel(model);
  const scopeBadgeClass = getModelScopeBadgeClass(model);
  return `
    <button class="w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between text-sm group ${isSelected ? 'bg-gray-100 text-gray-900 font-semibold ring-1 ring-gray-200 shadow-sm' : 'hover:bg-gray-50 text-gray-700'}" data-model-id="${escapeHtml(model.id)}" role="option" aria-selected="${isSelected}">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
          <img src="/logo.png" alt="" class="w-4 h-4 object-contain opacity-70" />
        </div>
        <span class="truncate">${escapeHtml(getModelDisplayLabel(model))}</span>
        <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scopeBadgeClass}">${escapeHtml(scopeLabel)}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="set-default-star p-0.5 rounded hover:bg-gray-100 transition-colors ${isDefault ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'}" data-set-default-id="${escapeHtml(model.id)}" title="${isDefault ? 'Remove as default' : 'Set as default'}" type="button" aria-label="${isDefault ? 'Remove as default' : 'Set as default'}" aria-pressed="${isDefault}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${isDefault ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
        ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-800"><path d="M20 6 9 17l-5-5"/></svg>' : ''}
      </div>
    </button>
  `;
}

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export async function persistDefaultModelSelection({
  apiFetch,
  modelId = null,
  currentPreferences = {},
  onSuccess = null,
  onFallback = null,
}) {
  if (typeof apiFetch !== 'function') {
    return { ok: false, reason: 'invalid-input' };
  }

  const nextPreferences = { ...currentPreferences };
  if (modelId) nextPreferences.defaultModelId = modelId;
  else delete nextPreferences.defaultModelId;
  const storage = getStorage();
  const successMessage = modelId ? 'Default model set' : 'Default model cleared';
  const fallbackMessage = modelId
    ? 'Default model set for this session'
    : 'Default model cleared for this session';
  try {
    const res = await apiFetch('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify({ preferences: nextPreferences }),
    });
    if (res.ok) {
      if (modelId) storage?.setItem('defaultModelId', modelId);
      else storage?.removeItem('defaultModelId');
      onSuccess?.(successMessage);
      return { ok: true, persisted: true };
    }
    if (modelId) storage?.setItem('defaultModelId', modelId);
    else storage?.removeItem('defaultModelId');
    onFallback?.(fallbackMessage);
    return { ok: true, persisted: false };
  } catch {
    if (modelId) storage?.setItem('defaultModelId', modelId);
    else storage?.removeItem('defaultModelId');
    onFallback?.(fallbackMessage);
    return { ok: true, persisted: false };
  }
}
