function isModelEnabled(model = {}) {
  return model?.enabled !== false;
}

function normalizeModelLabel(model = {}) {
  const raw = model?.name || model?.id || model?.connection_name || model?.connection_id || '';
  return String(raw).trim().toLowerCase();
}

export function countEnabledModels(models = []) {
  return (Array.isArray(models) ? models : []).reduce(
    (count, model) => count + (isModelEnabled(model) ? 1 : 0),
    0
  );
}

function compareEnabled(a, b) {
  const aEnabled = isModelEnabled(a);
  const bEnabled = isModelEnabled(b);
  if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
  return 0;
}

function compareLabel(a, b) {
  return normalizeModelLabel(a).localeCompare(normalizeModelLabel(b));
}

function compareId(a, b) {
  return String(a?.id || '')
    .toLowerCase()
    .localeCompare(String(b?.id || '').toLowerCase());
}

function compareConnection(a, b) {
  return String(a?.connection_name || '')
    .toLowerCase()
    .localeCompare(String(b?.connection_name || '').toLowerCase());
}

export function sortModelsByActiveThenName(models = []) {
  return (Array.isArray(models) ? models : []).slice().sort((a, b) => {
    let cmp = compareEnabled(a, b);
    if (cmp !== 0) return cmp;
    cmp = compareLabel(a, b);
    if (cmp !== 0) return cmp;
    cmp = compareId(a, b);
    if (cmp !== 0) return cmp;
    return compareConnection(a, b);
  });
}
