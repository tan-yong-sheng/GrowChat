export function normalizeConnectionModelSelectionMode(value = '') {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'all' || raw === 'some' || raw === 'none') {
    return raw;
  }
  return '';
}

export function resolveConnectionModelSelectionMode(
  models = [],
  selection = new Set(),
  fallbackMode = 'all'
) {
  const normalizedModels = Array.isArray(models) ? models : [];
  const normalizedSelection = selection instanceof Set ? selection : new Set();

  if (!normalizedModels.length) {
    return normalizeConnectionModelSelectionMode(fallbackMode) || 'all';
  }

  if (normalizedSelection.size === 0) {
    return 'none';
  }

  if (normalizedSelection.size >= normalizedModels.length) {
    return 'all';
  }

  return 'some';
}
