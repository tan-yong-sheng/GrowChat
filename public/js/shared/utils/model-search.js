export function normalizeModelSearchQuery(value) {
  return String(value || '').trim().toLowerCase();
}

export function filterModelsBySearch(models = [], query = '') {
  const normalizedQuery = normalizeModelSearchQuery(query);
  if (!normalizedQuery) return Array.isArray(models) ? models : [];

  return (Array.isArray(models) ? models : []).filter((model) => {
    const id = String(model?.id || '').toLowerCase();
    const name = String(model?.name || '').toLowerCase();
    const provider = String(model?.provider_type || model?.providerType || model?.provider_family || model?.providerFamily || '').toLowerCase();
    const connection = String(model?.connection_name || model?.connectionName || '').toLowerCase();
    return [id, name, provider, connection].some((field) => field.includes(normalizedQuery));
  });
}
