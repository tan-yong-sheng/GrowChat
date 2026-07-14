export function normalizeModelSearchQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function firstPresentValue(obj, keys) {
  for (const key of keys) {
    const value = obj && obj[key];
    if (value) return value;
  }
  return undefined;
}

function getModelSearchFieldValues(model) {
  const id = String((model && model.id) || '').toLowerCase();
  const name = String((model && model.name) || '').toLowerCase();
  const provider = String(
    firstPresentValue(model, [
      'provider_type',
      'providerType',
      'provider_family',
      'providerFamily',
    ]) || ''
  ).toLowerCase();
  const connection = String(
    firstPresentValue(model, ['connection_name', 'connectionName']) || ''
  ).toLowerCase();
  return [id, name, provider, connection];
}

export function filterModelsBySearch(models = [], query = '') {
  const normalizedQuery = normalizeModelSearchQuery(query);
  if (!normalizedQuery) return Array.isArray(models) ? models : [];

  return (Array.isArray(models) ? models : []).filter((model) =>
    getModelSearchFieldValues(model).some((field) => field.includes(normalizedQuery))
  );
}
