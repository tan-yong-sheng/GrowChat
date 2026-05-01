function normalizeModelLabel(model = {}) {
  return String(model?.name || model?.id || model?.connection_name || model?.connection_id || '')
    .trim()
    .toLowerCase();
}

function isModelEnabled(model = {}) {
  return model?.enabled !== false;
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

export function sortModelsByActiveThenName(models = []) {
  return (Array.isArray(models) ? models : []).slice().sort((a, b) => {
    const aLabel = normalizeModelLabel(a);
    const bLabel = normalizeModelLabel(b);
    const labelCompare = aLabel.localeCompare(bLabel);
    if (labelCompare !== 0) return labelCompare;

    const aId = String(a?.id || '').toLowerCase();
    const bId = String(b?.id || '').toLowerCase();
    const idCompare = aId.localeCompare(bId);
    if (idCompare !== 0) return idCompare;

    const aConnection = String(a?.connection_name || '').toLowerCase();
    const bConnection = String(b?.connection_name || '').toLowerCase();
    return aConnection.localeCompare(bConnection);
  });
}
