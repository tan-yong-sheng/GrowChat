// fallow-ignore-file code-duplication
import { filterModelsBySearch, normalizeModelSearchQuery } from './model-search.js';

function getRawProviderName(model = {}) {
  return (
    model?.connection_name ||
    model?.connectionName ||
    model?.provider_id ||
    model?.providerId ||
    model?.provider_family ||
    model?.providerFamily ||
    model?.provider_type ||
    model?.providerType ||
    model?.provider ||
    ''
  );
}

export function getModelProviderKey(model = {}) {
  const normalized = String(getRawProviderName(model) || '')
    .trim()
    .toLowerCase();
  return normalized || 'unknown';
}

export function getModelProviderLabel(model = {}) {
  const trimmed = String(getRawProviderName(model) || '').trim();
  return trimmed || 'unknown';
}

export function buildProviderOptions(
  models = [],
  { includeAll = true, allLabel = 'All Providers' } = {}
) {
  const totals = new Map();
  const actives = new Map();
  const labels = new Map();
  (Array.isArray(models) ? models : []).forEach((model) => {
    const key = getModelProviderKey(model);
    if (!key || key === 'unknown') return;
    totals.set(key, (totals.get(key) || 0) + 1);
    if (model?.enabled !== false) {
      actives.set(key, (actives.get(key) || 0) + 1);
    }
    if (!labels.has(key)) {
      labels.set(key, getModelProviderLabel(model));
    }
  });

  const options = Array.from(totals.entries())
    .map(([value, total]) => ({
      value,
      label: labels.get(value) || value,
      total,
      active: actives.get(value) || 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (includeAll) {
    const total = Array.isArray(models) ? models.length : 0;
    const active = (Array.isArray(models) ? models : []).filter(
      (model) => model?.enabled !== false
    ).length;
    options.unshift({
      value: 'all',
      label: allLabel,
      total,
      active,
    });
  }

  return options;
}

// fallow-ignore-next-line complexity
export function filterModelsByProvider(models = [], provider = '') {
  const normalized = String(provider || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === 'all') return Array.isArray(models) ? models : [];
  return (Array.isArray(models) ? models : []).filter(
    (model) => getModelProviderKey(model) === normalized
  );
}

export function filterModelsBySearchAndProvider(models = [], { query = '', provider = '' } = {}) {
  const normalizedQuery = normalizeModelSearchQuery(query);
  const filtered = filterModelsBySearch(models, normalizedQuery);
  return filterModelsByProvider(filtered, provider);
}
