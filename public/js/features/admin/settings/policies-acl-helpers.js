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

const UNKNOWN_SORT_ORDER = 99;

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

// -- normalizeAclRule sub-helpers --

function normalizeAclEffect(rule) {
  return String(rule?.effect || 'allow')
    .trim()
    .toLowerCase() === 'deny'
    ? 'deny'
    : 'allow';
}

function normalizeAclAction(rule) {
  return (
    String(rule?.action || 'use')
      .trim()
      .toLowerCase() || 'use'
  );
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
    effect: normalizeAclEffect(rule),
    action: normalizeAclAction(rule),
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
  return { label, kind: getFilterBadgeKind(label, enabled) };
}

function getFilterBadgeKind(label, enabled) {
  if (!enabled) return 'neutral';
  if (label === 'Allowed') return 'success';
  if (label === 'No access') return 'neutral';
  if (label === 'Denied') return 'danger';
  if (label === 'Disabled') return 'danger';
  return 'neutral';
}

// -- getResourceNote formatter lookup --

const RESOURCE_NOTE_FORMATTERS = {
  models: (r) => `${r.provider || 'model'} • ${r.id}`,
  connections: (r) =>
    `${r.providerType || r.provider_type || 'connection'} • ${r.base_url || r.url || r.id}`,
  'mcp-servers': (r) => `${r.auth_type || 'mcp'} • ${r.url || r.id}`,
};

/**
 * Short description line for a resource, varying by family.
 */
export function getResourceNote(resource, family) {
  const formatter = RESOURCE_NOTE_FORMATTERS[family];
  return formatter ? formatter(resource) : String(resource.id || '');
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
    const orderA = VISIBILITY_SORT_ORDER[categoryA] ?? UNKNOWN_SORT_ORDER;
    const orderB = VISIBILITY_SORT_ORDER[categoryB] ?? UNKNOWN_SORT_ORDER;
    if (orderA !== orderB) return orderA - orderB;
    return String(getResourceLabel(a)).localeCompare(String(getResourceLabel(b)));
  });
}

// -- buildPoliciesDeepLink sub-helpers --

function setUrlParamIf(url, key, value) {
  if (value) url.searchParams.set(key, String(value).trim());
}

/**
 * Build a deep-link URL into the policies view.
 */
export function buildPoliciesDeepLink({ groupId, familyKey, resourceId, open } = {}) {
  const url = new URL('/admin/users/policies', window.location.origin);
  url.searchParams.set('group', String(groupId || 'all').trim());
  setUrlParamIf(url, 'family', familyKey);
  setUrlParamIf(url, 'resource', resourceId);
  setUrlParamIf(url, 'open', open !== undefined ? open : 'access');
  return url.toString();
}

// -- getModelConnectionWarning sub-helpers --

function getConnectionRulesForId(connectionRulesById, connectionId) {
  return connectionRulesById instanceof Map ? connectionRulesById.get(connectionId) || [] : [];
}

function buildConnectionWarningLabel(state) {
  return state === 'denied' ? 'Connection denied' : 'Connection missing access';
}

function buildConnectionWarningTitle(state, connectionLabel) {
  return state === 'denied'
    ? `This selected resource has denied ACL access to the connection "${connectionLabel}".`
    : `This selected resource does not have ACL access to the connection "${connectionLabel}".`;
}

// -- getModelConnectionWarning sub-helpers (cont.) --

function isConnectionBlockedByUserSource(resource) {
  return !resource || String(resource?.connection_source || '').toLowerCase() === 'user';
}

function getResourceConnectionId(resource) {
  return String(resource?.connection_id || '').trim();
}

function getWarningConnectionLabel(resource) {
  return resource.connection_name || resource.connection_id || 'connection';
}

/**
 * Return a warning object if a model's parent connection is blocked,
 * or null if no warning applies.
 */
export function getModelConnectionWarning(resource, groupId = '', connectionRulesById) {
  if (isConnectionBlockedByUserSource(resource)) return null;
  if (getResourceAccessState(resource, groupId) !== 'allowed') return null;

  const connectionId = getResourceConnectionId(resource);
  if (!connectionId) return null;

  const connectionRules = getConnectionRulesForId(connectionRulesById, connectionId);
  const state = getResourceAccessState({ rules: connectionRules }, groupId);
  if (state === 'allowed') return null;

  const connectionLabel = getWarningConnectionLabel(resource);
  return {
    label: buildConnectionWarningLabel(state),
    kind: 'warning',
    title: buildConnectionWarningTitle(state, connectionLabel),
    linkHref: buildPoliciesDeepLink({
      groupId,
      familyKey: 'connections',
      resourceId: connectionId,
      open: 'access',
    }),
    linkLabel: 'Open connection ACL',
  };
}

// -- buildModelAccessModalWarning sub-helpers --

function collectModalConnectionWarnings(items, groupId, connectionRulesById) {
  return items
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
}

function buildModalWarningTitle(warnings) {
  return warnings.length === 1
    ? 'Dependency warning'
    : `${warnings.length} selected models depend on blocked connections`;
}

function buildModalWarningMessage(warnings, uniqueConnections) {
  if (warnings.length === 1) return warnings[0].warning.title;

  return `The selected group does not have ACL access to ${
    uniqueConnections.length === 1
      ? `the connection "${uniqueConnections[0]}"`
      : `${uniqueConnections.length} connections`
  } required by these models.`;
}

const MODEL_WARNING_PREVIEW_LIMIT = 3;

function buildModalWarningExtra(warnings) {
  if (warnings.length <= 1) return '';

  const labels = warnings
    .slice(0, MODEL_WARNING_PREVIEW_LIMIT)
    .map((item) => item.resourceLabel)
    .join(', ');
  const suffix =
    warnings.length > MODEL_WARNING_PREVIEW_LIMIT
      ? ` +${warnings.length - MODEL_WARNING_PREVIEW_LIMIT} more`
      : '';
  return `Affected models: ${labels}${suffix}`;
}

function buildModalWarningLinkHref(items, groupId) {
  const firstConnectionId = String(items[0]?.connection_id || '').trim();
  const url = new URL(window.location.href);
  url.searchParams.set('group', String(groupId || 'all').trim() || 'all');
  url.searchParams.set('family', 'connections');
  if (firstConnectionId) url.searchParams.set('resource', firstConnectionId);
  url.searchParams.set('open', 'access');
  return url.toString();
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

  const warnings = collectModalConnectionWarnings(items, groupId, connectionRulesById);
  if (!warnings.length) return null;

  const uniqueConnections = [
    ...new Set(warnings.map((item) => item.connectionLabel).filter(Boolean)),
  ];

  return {
    title: buildModalWarningTitle(warnings),
    message: buildModalWarningMessage(warnings, uniqueConnections),
    extra: buildModalWarningExtra(warnings),
    linkHref: buildModalWarningLinkHref(items, groupId),
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
  const list = Array.isArray(resources) ? resources : [];
  return list.filter((resource) =>
    passesResourceFilters(resource, normalizedQuery, visibilityFilters)
  );
}

function passesResourceFilters(resource, normalizedQuery, visibilityFilters) {
  if (!isResourceVisible(resource, visibilityFilters)) return false;
  if (!matchesSearchQuery(resource, normalizedQuery)) return false;
  const category = getResourceAccessState(resource, visibilityFilters._groupId || '');
  return Boolean(visibilityFilters[category]);
}

function isResourceVisible(resource, visibilityFilters) {
  if (resource?.enabled !== false) return true;
  return Boolean(visibilityFilters.disabled);
}

function matchesSearchQuery(resource, normalizedQuery) {
  if (!normalizedQuery) return true;
  return buildResourceSearchText(resource).includes(normalizedQuery);
}

function buildResourceSearchText(resource) {
  return [
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
}
