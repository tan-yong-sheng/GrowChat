function normalizeLabel(resource = {}) {
  return String(resource?.name || resource?.title || resource?.label || resource?.id || '')
    .trim()
    .toLowerCase();
}

function compareByLabelThenId(a, b) {
  const labelCompare = normalizeLabel(a).localeCompare(normalizeLabel(b));
  if (labelCompare !== 0) return labelCompare;
  return String(a?.id || '')
    .toLowerCase()
    .localeCompare(String(b?.id || '').toLowerCase());
}

export function sortResourcesByEnabledThenLabel(resources = []) {
  return (Array.isArray(resources) ? resources : []).slice().sort(compareByLabelThenId);
}

export function sortResourcesByEnabledThenVisibilityThenLabel(resources = []) {
  return (Array.isArray(resources) ? resources : []).slice().sort((a, b) => {
    const aHidden = a?.hidden_for_user === true;
    const bHidden = b?.hidden_for_user === true;
    if (aHidden !== bHidden) return aHidden ? 1 : -1;
    return compareByLabelThenId(a, b);
  });
}
