function getProp(obj, key, fallback) {
  if (obj && obj[key] != null) return obj[key];
  return fallback;
}

function normalizeModelLabel(model = {}) {
  return String(
    getProp(model, 'name') ||
      getProp(model, 'id') ||
      getProp(model, 'connection_name') ||
      getProp(model, 'connection_id', '')
  )
    .trim()
    .toLowerCase();
}

function isModelEnabled(model = {}) {
  return getProp(model, 'enabled') !== false;
}

function getModelIds(models) {
  return models.map((model) => String(getProp(model, 'id', '')).trim()).filter(Boolean);
}

function findPreferredMatch(modelIds, preferredIds) {
  const idSet = new Set(modelIds);
  for (const preferredId of preferredIds) {
    const candidateId = String(preferredId || '').trim();
    if (candidateId && idSet.has(candidateId)) {
      return candidateId;
    }
  }
  return null;
}

function compareModels(a, b) {
  const labelCompare = normalizeModelLabel(a).localeCompare(normalizeModelLabel(b));
  if (labelCompare !== 0) return labelCompare;

  const aId = String(getProp(a, 'id', '')).toLowerCase();
  const bId = String(getProp(b, 'id', '')).toLowerCase();
  const idCompare = aId.localeCompare(bId);
  if (idCompare !== 0) return idCompare;

  const aConnection = String(getProp(a, 'connection_name', '')).toLowerCase();
  const bConnection = String(getProp(b, 'connection_name', '')).toLowerCase();
  return aConnection.localeCompare(bConnection);
}

export function countEnabledModels(models = []) {
  return (Array.isArray(models) ? models : []).reduce(
    (count, model) => count + (isModelEnabled(model) ? 1 : 0),
    0
  );
}

export function filterEnabledModels(models = []) {
  return (Array.isArray(models) ? models : []).filter((model) => isModelEnabled(model));
}

export function getPreferredModelId(models = [], preferredIds = []) {
  const sortedModels = sortModelsByActiveThenName(filterEnabledModels(models));
  if (!sortedModels.length) return null;

  const modelIds = getModelIds(sortedModels);
  const normalizedPreferredIds = Array.isArray(preferredIds) ? preferredIds : [];
  const match = findPreferredMatch(modelIds, normalizedPreferredIds);
  if (match) return match;

  return getProp(sortedModels[0], 'id', null);
}

export function sortModelsByActiveThenName(models = []) {
  return (Array.isArray(models) ? models : []).slice().sort(compareModels);
}
