function normalizeFamilyKey(familyKey) {
  const key = String(familyKey || '')
    .trim()
    .toLowerCase();
  if (key === 'mcp-servers' || key === 'tool-servers') return 'tool-servers';
  if (key === 'connections') return 'connections';
  return 'models';
}

export function getAdminAclFamilyBasePath(familyKey) {
  const normalized = normalizeFamilyKey(familyKey);
  if (normalized === 'connections') return '/api/admin/openai/connections';
  if (normalized === 'tool-servers') return '/api/admin/tool-servers';
  return '/api/admin/models';
}

export function getAdminAclAccessPath(
  familyKey,
  { resourceId = '', bulk = false, query = '' } = {}
) {
  const base = getAdminAclFamilyBasePath(familyKey);
  const path = bulk
    ? `${base}/access`
    : `${base}/${encodeURIComponent(String(resourceId || '').trim())}/access`;
  return query ? `${path}${query}` : path;
}

export function getAdminUserAccessPath(userId) {
  return `/api/admin/users/${encodeURIComponent(String(userId || '').trim())}/access`;
}
