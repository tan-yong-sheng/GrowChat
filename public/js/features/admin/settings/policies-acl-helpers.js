/**
 * ACL domain helpers for the policies settings view.
 *
 * Pure functions for access-state computation, resource labelling,
 * visibility filtering, and deep-link construction.
 */

const BULK_PREVIEW_LIMIT = 6;

const VISIBILITY_SORT_ORDER = {
  allowed: 0,
  inaccessible: 1,
  denied: 2,
  disabled: 3,
};

/**
 * Clone an array of ACL rules, applying an optional normalizer.
 * Returns a new array; null/undefined results from the normalizer are dropped.
 */
export function cloneAclRules(rules = [], normalizer = (rule) => rule) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => normalizer({ ...rule }))
    .filter((rule) => rule !== null && rule !== undefined);
}

/**
 * Normalize a single ACL rule to the canonical shape expected by the
 * admin ACL API. Returns null for non-group / invalid principals.
 */
export function normalizeAclRule(rule) {
  const principalType = String(rule?.principal_type || '')
    .trim()
    .toLowerCase();
  const principalId = String(rule?.principal_id || '').trim();

  if (principalType !== 'group' || !principalId) return null;

  return {
    principal_type: 'group',
    principal_id: principalId,
    effect:
      String(rule?.effect || 'allow')
        .trim()
        .toLowerCase() === 'deny'
        ? 'deny'
        : 'allow',
    action:
      String(rule?.action || 'use')
        .trim()
        .toLowerCase() || 'use',
  };
}

/**
 * Derive the access state for a resource given a group.
 * Returns 'allowed', 'denied', or 'inaccessible'.
 */
export function getResourceAccessState(resource, groupId = '') {
  const rules = Array.isArray(resource?.rules) ? resource.rules : [];
  const normalizedGroup = String(groupId || '').trim();

  const deny = hasMatchingRule(rules, 'deny', normalizedGroup);
  const allow = hasMatchingRule(rules, 'allow', normalizedGroup);

  if (deny) return 'denied';
  if (allow) return 'allowed';
  return 'inaccessible';
}

/**
 * Check whether any rule in a list matches a given effect for a specific group.
 */
function hasMatchingRule(rules, effect, groupId) {
  const normalized = String(groupId || '').trim();
  return normalized
    ? rules.some(
        (rule) =>
          String(rule.effect || '').toLowerCase() === effect &&
          String(rule.principal_type || '').toLowerCase() === 'group' &&
          String(rule.principal_id || '') === normalized
      )
    : rules.some((rule) => String(rule.effect || '').toLowerCase() === effect);
}

/**
 * Get a { label, kind } badge descriptor for a resource's visibility state.
 */
export function getResourceVisibilityBadge(resource, groupId = '') {
  if (resource?.enabled === false) {
    return { label: 'Disabled', kind: 'danger' };
  }
  const state = getResourceAccessState(resource, groupId);
  if (state === 'allowed') return { label: 'Allowed', kind: 'success' };
  if (state === 'denied') return { label: 'Denied', kind: 'danger' };
  return { label: 'No access', kind: 'neutral' };
}

/**
 * Badge descriptor for a visibility-filter toggle.
 */
export function getVisibilityFilterBadge(label, enabled) {
  if (!enabled) return { label, kind: 'neutral' };
  if (label === 'Allowed') return { label, kind: 'success' };
  if (label === 'No access') return { label, kind: 'neutral' };
  if (label === 'Denied') return { label, kind: 'danger' };
  if (label === 'Disabled') return { label, kind: 'danger' };
  return { label, kind: 'neutral' };
}

/**
 * Short description line for a resource, varying by family.
 */
export function getResourceNote(resource, family) {
  if (family === 'models') {
    return `${resource.provider || 'model'} • ${resource.id}`;
  }
  if (family === 'connections') {
    return `${resource.providerType || resource.provider_type || 'connection'} • ${resource.base_url || resource.url || resource.id}`;
  }
  if (family === 'mcp-servers') {
    return `${resource.auth_type || 'mcp'} • ${resource.url || resource.id}`;
  }
  return String(resource.id || '');
}

/**
 * Singular label for a family key (e.g. 'connections' → 'Connection').
 */
export function getFamilyActionLabel(familyKey) {
  if (familyKey === 'connections') return 'Connection';
  if (familyKey === 'mcp-servers') return 'MCP Server';
  return 'Model';
}

/**
 * Human-readable name for a resource, falling back to id.
 */
export function getResourceLabel(resource) {
  return resource?.name || resource?.title || resource?.id || 'Resource';
}

/**
 * One-line summary of selected resources for bulk display.
 */
export function summarizeSelectedResources(resources = []) {
  const items = Array.isArray(resources) ? resources : [];
  if (!items.length) return 'No resources selected';
  if (items.length === 1) return getResourceLabel(items[0]);

  const preview = items.slice(0, BULK_PREVIEW_LIMIT).map((resource) => getResourceLabel(resource));
  const remaining = items.length - preview.length;
  return remaining > 0 ? `${preview.join(', ')} + ${remaining} more` : preview.join(', ');
}

/**
 * Pluralised family label for a count (e.g. 'Models' or 'Connections').
 */
export function getFamilyBulkSummary(familyKey, count) {
  const label = getFamilyActionLabel(familyKey);
  return count === 1 ? label : `${label}s`;
}

/**
 * Sort resources by visibility category, then alphabetically.
 */
export function sortResourcesByVisibility(resources = [], groupId = '') {
  const normalizedGroupId = String(groupId || '').trim();
  return (Array.isArray(resources) ? resources : []).slice().sort((a, b) => {
    const categoryA =
      a?.enabled === false ? 'disabled' : getResourceAccessState(a, normalizedGroupId);
    const categoryB =
      b?.enabled === false ? 'disabled' : getResourceAccessState(b, normalizedGroupId);
    const orderA = VISIBILITY_SORT_ORDER[categoryA] ?? 99;
    const orderB = VISIBILITY_SORT_ORDER[categoryB] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return String(getResourceLabel(a)).localeCompare(String(getResourceLabel(b)));
  });
}

/**
 * Build a deep-link URL into the policies view.
 */
export function buildPoliciesDeepLink({
  groupId = 'all',
  familyKey = '',
  resourceId = '',
  open = 'access',
} = {}) {
  const url = new URL('/admin/users/policies', window.location.origin);
  url.searchParams.set('group', String(groupId || 'all').trim() || 'all');
  if (familyKey) url.searchParams.set('family', String(familyKey).trim());
  if (resourceId) url.searchParams.set('resource', String(resourceId).trim());
  if (open) url.searchParams.set('open', String(open).trim());
  return url.toString();
}

/**
 * Return a warning object if a model's parent connection is blocked,
 * or null if no warning applies.
 */
export function getModelConnectionWarning(resource, groupId = '', connectionRulesById = new Map()) {
  if (!resource || String(resource?.connection_source || '').toLowerCase() === 'user') return null;
  if (getResourceAccessState(resource, groupId) !== 'allowed') return null;

  const connectionId = String(resource?.connection_id || '').trim();
  if (!connectionId) return null;

  const connectionRules =
    connectionRulesById instanceof Map ? connectionRulesById.get(connectionId) || [] : [];
  const state = getResourceAccessState({ rules: connectionRules }, groupId);
  if (state === 'allowed') return null;

  const connectionLabel = resource.connection_name || resource.connection_id || 'connection';
  return {
    label: state === 'denied' ? 'Connection denied' : 'Connection missing access',
    kind: 'warning',
    title:
      state === 'denied'
        ? `This selected resource has denied ACL access to the connection "${connectionLabel}".`
        : `This selected resource does not have ACL access to the connection "${connectionLabel}".`,
    linkHref: buildPoliciesDeepLink({
      groupId,
      familyKey: 'connections',
      resourceId: connectionId,
      open: 'access',
    }),
    linkLabel: 'Open connection ACL',
  };
}

/**
 * Build a warning descriptor for the access modal when models have
 * blocked parent connections. Returns null when no warning is needed.
 */
export function buildModelAccessModalWarning(
  resources = [],
  groupId = '',
  connectionRulesById = new Map()
) {
  const items = Array.isArray(resources) ? resources.filter(Boolean) : [];
  if (!items.length) return null;

  const warnings = items
    .map((resource) => {
      if (getResourceAccessState(resource, groupId) !== 'allowed') return null;
      const warning = getModelConnectionWarning(resource, groupId, connectionRulesById);
      if (!warning) return null;
      return {
        resourceLabel: getResourceLabel(resource),
        connectionLabel: resource?.connection_name || resource?.connection_id || 'connection',
        warning,
      };
    })
    .filter(Boolean);

  if (!warnings.length) return null;

  const uniqueConnections = [
    ...new Set(warnings.map((item) => item.connectionLabel).filter(Boolean)),
  ];

  const title =
    warnings.length === 1
      ? 'Dependency warning'
      : `${warnings.length} selected models depend on blocked connections`;

  const message =
    warnings.length === 1
      ? warnings[0].warning.title
      : `The selected group does not have ACL access to ${uniqueConnections.length === 1 ? `the connection "${uniqueConnections[0]}"` : `${uniqueConnections.length} connections`} required by these models.`;

  const extra =
    warnings.length > 1
      ? `Affected models: ${warnings
          .slice(0, 3)
          .map((item) => item.resourceLabel)
          .join(', ')}${warnings.length > 3 ? ` +${warnings.length - 3} more` : ''}`
      : '';

  const firstConnectionId = String(items[0]?.connection_id || '').trim();
  const url = new URL(window.location.href);
  url.searchParams.set('group', String(groupId || 'all').trim() || 'all');
  url.searchParams.set('family', 'connections');
  if (firstConnectionId) url.searchParams.set('resource', firstConnectionId);
  url.searchParams.set('open', 'access');

  return {
    title,
    message,
    extra,
    linkHref: url.toString(),
    linkLabel: 'Open connection ACL',
  };
}

/**
 * Filter resources by search query and visibility toggles.
 */
export function filterResourcesByQueryAndVisibility(
  resources = [],
  { query = '', visibilityFilters = {} } = {}
) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return (Array.isArray(resources) ? resources : []).filter((resource) => {
    if (resource?.enabled === false && !visibilityFilters.disabled) return false;

    const text = [
      resource.id,
      resource.name,
      resource.title,
      resource.provider,
      resource.providerType,
      resource.base_url,
      resource.url,
    ]
      .join(' ')
      .toLowerCase();

    if (normalizedQuery && !text.includes(normalizedQuery)) return false;

    const category = getResourceAccessState(resource, visibilityFilters._groupId || '');
    return Boolean(visibilityFilters[category]);
  });
}
