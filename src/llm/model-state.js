function normalizeModelLabel(model = {}) {
  return String(model?.name || model?.id || model?.connection_name || model?.connection_id || '').trim().toLowerCase();
}

function isModelEnabled(model = {}) {
  return model?.enabled !== false;
}

export function countEnabledModels(models = []) {
  return (Array.isArray(models) ? models : []).reduce((count, model) => count + (isModelEnabled(model) ? 1 : 0), 0);
}

export function sortModelsByActiveThenName(models = []) {
  return (Array.isArray(models) ? models : []).slice().sort((a, b) => {
    const aEnabled = isModelEnabled(a);
    const bEnabled = isModelEnabled(b);
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;

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
