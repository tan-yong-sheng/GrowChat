function normalizeLabel(resource = {}) {
  return String(resource?.name || resource?.title || resource?.label || resource?.id || '')
    .trim()
    .toLowerCase();
}

export function sortResourcesByEnabledThenLabel(resources = []) {
  return (Array.isArray(resources) ? resources : []).slice().sort((a, b) => {
    const aEnabled = a?.enabled !== false;
    const bEnabled = b?.enabled !== false;
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;

    const aLabel = normalizeLabel(a);
    const bLabel = normalizeLabel(b);
    const labelCompare = aLabel.localeCompare(bLabel);
    if (labelCompare !== 0) return labelCompare;

    return String(a?.id || '').toLowerCase().localeCompare(String(b?.id || '').toLowerCase());
  });
}
