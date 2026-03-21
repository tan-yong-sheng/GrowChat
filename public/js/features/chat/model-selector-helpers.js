import { filterModelsBySearch, normalizeModelSearchQuery } from '../../shared/utils/model-search.js';
import { sortModelsByActiveThenName } from '../../shared/utils/model-state.js';

export function getModelDisplayLabel(model) {
  return String(model?.name || model?.id || '').trim();
}

export function getPreferredModelId(models = [], preferredIds = []) {
  const sortedModels = sortModelsByActiveThenName(models);
  if (!sortedModels.length) return null;

  const modelIdSet = new Set(sortedModels.map((model) => String(model?.id || '').trim()).filter(Boolean));
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
  return `
    <button class="w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between text-sm group ${isSelected ? 'bg-gray-50 text-gray-900 font-bold' : 'hover:bg-gray-50 text-gray-700'}" data-model-id="${model.id}" role="option" aria-selected="${isSelected}">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
          <img src="/logo.png" alt="" class="w-4 h-4 object-contain opacity-70" />
        </div>
        <span>${getModelDisplayLabel(model)}</span>
      </div>
      ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-800"><path d="M20 6 9 17l-5-5"/></svg>' : ''}
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
  const fallbackMessage = modelId ? 'Default model set for this session' : 'Default model cleared for this session';
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

