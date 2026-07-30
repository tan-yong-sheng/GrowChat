function normalizeItemField(item, key) {
  return String(item?.[key] || '')
    .trim()
    .toLowerCase();
}

export function getItemScopeLabel(item) {
  if (normalizeItemField(item, 'source') === 'user') return 'Personal';
  if (
    ['access_variant', 'access_label'].some((key) => normalizeItemField(item, key) === 'personal')
  ) {
    return 'Personal';
  }
  return 'Shared';
}
