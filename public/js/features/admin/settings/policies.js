import { apiFetch, fetchAdminGroups, fetchAdminModels } from '../../../shared/api.js';
import {
  broadcastModelsInvalidation,
  consumeModelsInvalidation,
} from '../../../shared/utils/model-sync.js';
import {
  consumeConnectionsInvalidation,
  broadcastConnectionsInvalidation,
} from '../../../shared/utils/connection-sync.js';
import {
  broadcastToolServersInvalidation,
  consumeToolServersInvalidation,
} from '../../../shared/utils/tool-server-sync.js';
import { getAdminAclAccessPath } from '../../../shared/admin-acl.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { createAdminModalShell } from '../modal-shell.js';
import { captureRenderState, restoreRenderState } from '../../../shared/components/search-bar.js';
import { renderButton } from '../../../shared/components/button.js';

function cloneAclRules(rules = [], normalizer = (rule) => rule) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => normalizer({ ...rule }))
    .filter((rule) => rule !== null && rule !== undefined);
}

const FAMILIES = [
  { key: 'connections', label: 'Connections' },
  { key: 'models', label: 'Models' },
  { key: 'mcp-servers', label: 'Integrations - MCP Servers' },
];

const PAGE_SIZES = [20, 50, 100];
const DEFAULT_SELECTION = () => new Set();
const BULK_PREVIEW_LIMIT = 6;
const DEFAULT_VISIBILITY_FILTERS = {
  allowed: true,
  inaccessible: true,
  denied: true,
  disabled: false,
};
const VISIBILITY_SORT_ORDER = {
  allowed: 0,
  inaccessible: 1,
  denied: 2,
  disabled: 3,
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resourceBadge(label, kind = 'neutral', compact = false) {
  const map = {
    neutral: 'bg-gray-100 text-gray-700 border-gray-200',
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    danger: 'bg-rose-100 text-rose-700 border-rose-200',
    admin: 'bg-amber-100 text-amber-700 border-amber-200',
    shared: 'bg-blue-100 text-blue-700 border-blue-200',
    personal: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    none: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  const sizeClass = compact ? 'px-[5px] py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[9px]';
  return `<span class="inline-flex items-center rounded-full border ${sizeClass} font-semibold uppercase tracking-wide ${map[kind] || map.neutral}">${escapeHtml(label)}</span>`;
}

function createModal({ preset = 'aclEditor', title, subtitle, body, footer }) {
  return createAdminModalShell({
    preset,
    title,
    subtitle,
    modalHash: 'policy-acl-modal',
    body,
    footer,
    closeAttr: 'data-close-modal',
  });
}

function renderSkeleton() {
  return `
    <div class="space-y-4">
      <div class="h-12 w-full rounded-3xl bg-gray-100 animate-pulse"></div>
      <div class="grid gap-3">
        ${Array.from({ length: 4 })
          .map(
            () => `
          <div class="h-20 rounded-3xl bg-gray-50 border border-gray-100 animate-pulse"></div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderFamilySkeleton() {
  return `
    <div class="space-y-4">
      <div class="h-12 w-full rounded-3xl bg-gray-100 animate-pulse"></div>
      <div class="grid gap-2">
        ${Array.from({ length: 4 })
          .map(
            () => `
          <div class="group flex items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-2 py-0.5 shadow-sm">
            <div class="flex items-center gap-1 min-w-0 flex-1">
              <div class="h-3.5 w-3.5 rounded border border-gray-200 bg-gray-100 animate-pulse shrink-0"></div>
              <div class="min-w-0 flex items-center gap-1">
                <div class="h-3 w-36 rounded bg-gray-100 animate-pulse"></div>
                <div class="h-4 w-14 rounded-full bg-gray-100 animate-pulse"></div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <div class="h-4 w-12 rounded-full bg-gray-100 animate-pulse"></div>
              <div class="h-7 w-7 rounded-lg bg-gray-100 animate-pulse"></div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
        <div class="flex items-center justify-between gap-4">
          <div class="h-9 w-28 rounded-lg bg-gray-100 animate-pulse"></div>
          <div class="h-9 w-48 rounded-lg bg-gray-100 animate-pulse"></div>
        </div>
      </div>
    </div>
  `;
}

function isActiveTab(container) {
  const settingsTab =
    container?.dataset?.settingsTab ||
    document.querySelector('#admin-sub-content')?.dataset.settingsTab ||
    document.querySelector('[data-settings-tab]')?.dataset.settingsTab ||
    '';
  const pathname = window.location.pathname || '';
  return (
    settingsTab === 'policies' &&
    (pathname === '/' ||
      pathname.startsWith('/admin/settings/policies') ||
      pathname.startsWith('/admin/users/policies'))
  );
}

function getResourceNote(resource, family) {
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

function getFamilyActionLabel(familyKey) {
  if (familyKey === 'connections') return 'Connection';
  if (familyKey === 'mcp-servers') return 'MCP Server';
  return 'Model';
}

function getResourceLabel(resource) {
  return resource?.name || resource?.title || resource?.id || 'Resource';
}

function summarizeSelectedResources(resources = []) {
  const items = Array.isArray(resources) ? resources : [];
  if (!items.length) return 'No resources selected';
  if (items.length === 1) return getResourceLabel(items[0]);
  const preview = items.slice(0, BULK_PREVIEW_LIMIT).map((resource) => getResourceLabel(resource));
  const remaining = items.length - preview.length;
  return remaining > 0 ? `${preview.join(', ')} + ${remaining} more` : preview.join(', ');
}

function getFamilyBulkSummary(familyKey, count) {
  const label = getFamilyActionLabel(familyKey);
  return count === 1 ? label : `${label}s`;
}

function filterEnabledResources(resources = []) {
  return (Array.isArray(resources) ? resources : []).filter(
    (resource) => resource?.enabled !== false
  );
}

function sortResourcesByVisibility(resources = [], groupId = '') {
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

function getResourceAccessState(resource, groupId = '') {
  const rules = Array.isArray(resource?.rules) ? resource.rules : [];
  const normalizedGroup = String(groupId || '').trim();
  const deny = normalizedGroup
    ? rules.some(
        (rule) =>
          String(rule.effect || '').toLowerCase() === 'deny' &&
          String(rule.principal_type || '').toLowerCase() === 'group' &&
          String(rule.principal_id || '') === normalizedGroup
      )
    : rules.some((rule) => String(rule.effect || '').toLowerCase() === 'deny');
  const allow = normalizedGroup
    ? rules.some(
        (rule) =>
          String(rule.effect || '').toLowerCase() === 'allow' &&
          String(rule.principal_type || '').toLowerCase() === 'group' &&
          String(rule.principal_id || '') === normalizedGroup
      )
    : rules.some((rule) => String(rule.effect || '').toLowerCase() === 'allow');

  if (deny) return 'denied';
  if (allow) return 'allowed';
  return 'inaccessible';
}

function getResourceVisibilityBadge(resource, groupId = '') {
  if (resource?.enabled === false) {
    return { label: 'Disabled', kind: 'danger' };
  }
  const state = getResourceAccessState(resource, groupId);
  if (state === 'allowed') return { label: 'Allowed', kind: 'success' };
  if (state === 'denied') return { label: 'Denied', kind: 'danger' };
  return { label: 'No access', kind: 'neutral' };
}

function getVisibilityFilterBadge(label, enabled) {
  if (!enabled) return { label, kind: 'neutral' };
  if (label === 'Allowed') return { label, kind: 'success' };
  if (label === 'No access') return { label, kind: 'neutral' };
  if (label === 'Denied') return { label, kind: 'danger' };
  if (label === 'Disabled') return { label, kind: 'danger' };
  return { label, kind: 'neutral' };
}

function buildPoliciesDeepLink({
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

function getModelConnectionWarning(resource, groupId = '', connectionRulesById = new Map()) {
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

function buildModelAccessModalWarning(
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

function normalizeAclRule(rule) {
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

function renderResourceList({
  familyKey,
  resources,
  groupId,
  selectedIds = DEFAULT_SELECTION(),
  connectionRulesById = new Map(),
  onToggleSelection = null,
  _onEdit,
}) {
  return `
    <section class="space-y-2">
      <div class="space-y-1">
        ${
          resources.length
            ? resources
                .map((resource) => {
                  const visibilityBadge = getResourceVisibilityBadge(resource, groupId);
                  const ownerBadge =
                    resource.source === 'user'
                      ? resourceBadge('Personal', 'personal', true)
                      : resourceBadge('Platform', 'admin', true);
                  const dependencyWarning =
                    familyKey === 'models'
                      ? getModelConnectionWarning(resource, groupId, connectionRulesById)
                      : null;
                  const isSelected = selectedIds instanceof Set && selectedIds.has(resource.id);
                  const note = getResourceNote(resource, familyKey);
                  const editDisabled = resource.enabled === false;
                  return `
            <div class="group flex items-center justify-between gap-2 rounded-lg border ${isSelected ? 'border-gray-400 bg-gray-50' : 'border-gray-200 bg-white'} px-2 py-0.5">
              <label class="flex items-center gap-1 min-w-0 flex-1 cursor-pointer" title="${escapeHtml(note)}">
                ${
                  onToggleSelection
                    ? `
                  <input
                    type="checkbox"
                    class="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-300 shrink-0"
                    data-select-resource="${escapeHtml(resource.id)}"
                    ${isSelected ? 'checked' : ''}
                    aria-label="Select ${escapeHtml(getResourceLabel(resource))}"
                  >
                `
                    : ''
                }
                <div class="min-w-0 flex items-center gap-1">
                  <div class="text-[12px] font-semibold text-gray-900 truncate">${escapeHtml(getResourceLabel(resource))}</div>
                  <span class="opacity-80 transition group-hover:opacity-100">${ownerBadge}</span>
                  ${resource.enabled === false ? resourceBadge('Disabled', 'none', true) : ''}
                </div>
              </label>
              <div class="flex items-center gap-1 shrink-0">
                ${
                  dependencyWarning
                    ? `
                  <a
                    href="${escapeHtml(dependencyWarning.linkHref || buildPoliciesDeepLink({ groupId, familyKey: 'connections', resourceId: resource.connection_id || '', open: 'access' }))}"
                    class="inline-flex items-center gap-1 rounded-full border px-[5px] py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
                    title="${escapeHtml(dependencyWarning.title)}"
                    aria-label="${escapeHtml(dependencyWarning.linkLabel || dependencyWarning.title)}"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.5 15A1.5 1.5 0 0 0 3.08 21h17.84a1.5 1.5 0 0 0 1.29-2.14l-8.5-15a1.5 1.5 0 0 0-2.58 0Z" />
                    </svg>
                    <span>Blocked</span>
                  </a>
                `
                    : ''
                }
                ${resourceBadge(visibilityBadge.label, visibilityBadge.kind, true)}
                <button
                  type="button"
                  class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition ${editDisabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}"
                  ${editDisabled ? 'disabled' : ''}
                  data-edit-resource="${escapeHtml(resource.id)}"
                  data-family="${escapeHtml(familyKey)}"
                  title="${editDisabled ? 'Disabled resources cannot be edited' : 'Edit access rules'}"
                  aria-label="Edit access rules"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
                  </svg>
                </button>
              </div>
            </div>
          `;
                })
                .join('')
            : `
          <div class="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
            No resources in this family.
          </div>
        `
        }
      </div>
    </section>
  `;
}

function buildAclRows(groups, rules = []) {
  const rulesByGroup = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (String(rule?.principal_type || '').toLowerCase() !== 'group') continue;
    const groupId = String(rule.principal_id || '').trim();
    if (!groupId) continue;
    const effect =
      String(rule.effect || 'allow')
        .trim()
        .toLowerCase() === 'deny'
        ? 'deny'
        : 'allow';
    rulesByGroup.set(groupId, effect);
  }

  return groups
    .map((group) => {
      const effect = rulesByGroup.get(group.id) || 'none';
      return `
      <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(group.name || group.id)}</div>
            ${group.is_system ? '<span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">System</span>' : ''}
          </div>
          <div class="text-[11px] text-gray-500 truncate">${escapeHtml(group.description || group.id)}</div>
        </div>
        <select class="resource-acl-effect rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-gray-400" data-group-id="${escapeHtml(group.id)}">
          <option value="none" ${effect === 'none' ? 'selected' : ''}>No access</option>
          <option value="allow" ${effect === 'allow' ? 'selected' : ''}>Allow</option>
          <option value="deny" ${effect === 'deny' ? 'selected' : ''}>Deny</option>
        </select>
      </div>
    `;
    })
    .join('');
}

async function loadFamilyAccess({ familyKey, resourceIds = [], signal } = {}) {
  const ids = Array.isArray(resourceIds)
    ? resourceIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const query = ids.length ? `?ids=${encodeURIComponent(ids.join(','))}` : '';
  const endpoint = getAdminAclAccessPath(familyKey, { bulk: true, query });
  const res = await apiFetch(endpoint, { signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to load access');
  }
  return res.json();
}

async function saveFamilyAccess({ familyKey, updates }) {
  const endpoint = getAdminAclAccessPath(familyKey, { bulk: true });
  const res = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to save access');
  }
  return res.json();
}

async function openAccessModal({
  familyKey,
  resource,
  resources = null,
  groups,
  _selectedGroupId = '',
  resourceWarning = null,
  onSaved = null,
}) {
  const targetResources =
    Array.isArray(resources) && resources.length ? resources : [resource].filter(Boolean);
  const resourceLabel = getResourceLabel(targetResources[0]);
  const bulkCount = targetResources.length;
  const body = `
    <div class="space-y-4">
      <div class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900">${escapeHtml(resourceLabel)}</div>
        <div class="text-xs text-gray-500">${escapeHtml(getResourceNote(targetResources[0], familyKey))}</div>
        ${
          resourceWarning
            ? `
          <div class="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-800">
            <div class="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="mt-0.5 size-5 shrink-0 text-amber-500">
                <path fill-rule="evenodd" d="M8.485 2.495c.673-1.164 2.357-1.164 3.03 0l6.518 11.27c.673 1.164-.17 2.62-1.515 2.62H3.482c-1.345 0-2.188-1.456-1.515-2.62l6.518-11.27Zm1.515 3.505a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Zm0 8.25a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
              </svg>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-amber-900">${escapeHtml(resourceWarning.title)}</div>
                <div class="mt-1 leading-snug">${escapeHtml(resourceWarning.message)}</div>
                ${
                  resourceWarning.linkHref
                    ? `
                  <a
                    href="${escapeHtml(resourceWarning.linkHref)}"
                    class="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    ${escapeHtml(resourceWarning.linkLabel || 'Open ACL')}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                      <path fill-rule="evenodd" d="M5 10a.75.75 0 0 1 .75-.75h6.69L10.22 7.03a.75.75 0 1 1 1.06-1.06l3.72 3.72a.75.75 0 0 1 0 1.06l-3.72 3.72a.75.75 0 1 1-1.06-1.06l2.22-2.22H5.75A.75.75 0 0 1 5 10Z" clip-rule="evenodd" />
                    </svg>
                  </a>
                `
                    : ''
                }
                ${resourceWarning.extra ? `<div class="mt-1 text-[11px] text-amber-700">${escapeHtml(resourceWarning.extra)}</div>` : ''}
              </div>
            </div>
          </div>
        `
            : ''
        }
        ${
          bulkCount > 1
            ? `
          <div class="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Bulk editing ${escapeHtml(String(bulkCount))} ${escapeHtml(getFamilyBulkSummary(familyKey, bulkCount).toLowerCase())}. Existing rules will be replaced on every selected resource.
          </div>
          <div class="mt-3 text-[11px] text-gray-500">
            ${escapeHtml(summarizeSelectedResources(targetResources))}
          </div>
        `
            : ''
        }
      </div>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold text-gray-900">Group access</div>
          <div class="text-[11px] text-amber-600 font-medium">Deny overrides allow</div>
        </div>
        <div id="policy-acl-list" class="space-y-2"></div>
      </div>
      <div class="text-sm text-red-600 hidden" id="policy-acl-error"></div>
    </div>
  `;
  const modal = createModal({
    preset: 'access',
    title:
      bulkCount > 1
        ? `Bulk ${getFamilyBulkSummary(familyKey, bulkCount)} ACL`
        : `${familyKey === 'models' ? 'Model' : familyKey === 'connections' ? 'Connection' : 'MCP Server'} Access`,
    subtitle: 'Central ACL editor',
    body,
    footer: `
      <button type="button" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded transition" data-close-modal>Cancel</button>
      ${renderButton({ label: 'Save', variant: 'primary', id: 'policy-acl-save', className: 'px-5 py-2' })}
    `,
  });

  const listEl = modal.modal.querySelector('#policy-acl-list');
  const errorEl = modal.modal.querySelector('#policy-acl-error');
  const saveBtn = modal.modal.querySelector('#policy-acl-save');

  let rules = [];
  const initialRules = cloneAclRules(targetResources[0]?.rules || [], normalizeAclRule);
  rules = cloneAclRules(initialRules, normalizeAclRule);

  const rulesByGroup = new Map();
  for (const rule of rules) {
    if (String(rule?.principal_type || '').toLowerCase() !== 'group') continue;
    const groupId = String(rule.principal_id || '').trim();
    if (!groupId) continue;
    rulesByGroup.set(
      groupId,
      String(rule.effect || 'allow')
        .trim()
        .toLowerCase() === 'deny'
        ? 'deny'
        : 'allow'
    );
  }

  const renderList = () => {
    if (!listEl) return;
    if (!groups.length) {
      listEl.innerHTML =
        '<div class="text-sm text-gray-500 py-6 text-center">No groups available.</div>';
      return;
    }
    listEl.innerHTML = buildAclRows(groups, rules);
    listEl.querySelectorAll('.resource-acl-effect').forEach((select) => {
      select.addEventListener('change', () => {
        const groupId = select.getAttribute('data-group-id');
        if (!groupId) return;
        const effect = String(select.value || 'none');
        if (effect === 'none') {
          rulesByGroup.delete(groupId);
        } else {
          rulesByGroup.set(groupId, effect);
        }
      });
    });
  };

  saveBtn?.addEventListener('click', async () => {
    if (!saveBtn) return;
    setModalSaveButtonState(saveBtn, {
      enabled: true,
      saving: true,
      label: 'Save',
      enabledClass:
        'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800',
      disabledClass:
        'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
    });
    try {
      const nextRules = Array.from(rulesByGroup.entries()).map(([groupId, effect]) => ({
        principal_type: 'group',
        principal_id: groupId,
        effect,
        action: 'use',
      }));
      if (typeof onSaved === 'function') {
        await onSaved(nextRules, targetResources);
      }
      modal.close();
    } catch (err) {
      errorEl.textContent = err?.message || 'Failed to save access';
      errorEl.classList.remove('hidden');
    } finally {
      setModalSaveButtonState(saveBtn, {
        enabled: true,
        saving: false,
        label: 'Save',
        enabledClass:
          'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800',
        disabledClass:
          'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
      });
    }
  });

  renderList();
}

export function renderPoliciesSettings(container, _data = {}) {
  const initialParams = new URLSearchParams(window.location.search || '');
  const initialGroupId = String(initialParams.get('group') || 'all').trim() || 'all';
  const initialDeepLinkFamily = String(initialParams.get('family') || '').trim();
  const initialDeepLinkResource = String(initialParams.get('resource') || '').trim();
  const initialDeepLinkOpen = String(initialParams.get('open') || '')
    .trim()
    .toLowerCase();
  const state = {
    loading: true,
    error: null,
    groups: [],
    selectedGroupId: initialGroupId,
    query: '',
    visibilityFilters: { ...DEFAULT_VISIBILITY_FILTERS },
    filtersOpen: false,
    activeFamily: 'models',
    saving: false,
    familyStatus: {
      connections: 'idle',
      models: 'idle',
      'mcp-servers': 'idle',
    },
    familyError: {
      connections: null,
      models: null,
      'mcp-servers': null,
    },
    paginationByFamily: {
      connections: { page: 1, pageSize: 20 },
      models: { page: 1, pageSize: 20 },
      'mcp-servers': { page: 1, pageSize: 20 },
    },
    selectionByFamily: {
      connections: DEFAULT_SELECTION(),
      models: DEFAULT_SELECTION(),
      'mcp-servers': DEFAULT_SELECTION(),
    },
    resources: {
      models: [],
      connections: [],
      'mcp-servers': [],
    },
    modelConnectionRulesById: new Map(),
    pendingDeepLink: null,
    deepLinkOpened: false,
  };
  if (
    FAMILIES.some((family) => family.key === initialDeepLinkFamily) &&
    initialDeepLinkResource &&
    (initialDeepLinkOpen === 'access' || initialDeepLinkOpen === 'acl')
  ) {
    state.pendingDeepLink = {
      familyKey: initialDeepLinkFamily,
      resourceId: initialDeepLinkResource,
    };
    state.activeFamily = initialDeepLinkFamily;
  }
  const familyLoadSeq = {
    connections: 0,
    models: 0,
    'mcp-servers': 0,
  };
  const familyAbortControllers = {
    connections: null,
    models: null,
    'mcp-servers': null,
  };
  let cleanupListeners = null;

  const abortFamilyLoad = (familyKey) => {
    const controller = familyAbortControllers[familyKey];
    if (controller) controller.abort();
    familyAbortControllers[familyKey] = null;
  };

  const abortAllFamilyLoads = () => {
    for (const familyKey of FAMILIES.map((family) => family.key)) {
      abortFamilyLoad(familyKey);
    }
  };

  const invalidateFamilyState = (
    familyKeys = [],
    { renderActive = false, reloadActive = false } = {}
  ) => {
    const normalizedKeys = Array.isArray(familyKeys) ? familyKeys : [];
    let shouldRender = false;
    let shouldReload = false;
    for (const familyKey of normalizedKeys) {
      if (!familyKey || !state.familyStatus[familyKey]) continue;
      abortFamilyLoad(familyKey);
      state.familyStatus[familyKey] = 'idle';
      state.familyError[familyKey] = null;
      if (familyKey === 'models') {
        state.modelConnectionRulesById = new Map();
      }
      shouldRender = shouldRender || state.activeFamily === familyKey;
      shouldReload = shouldReload || state.activeFamily === familyKey;
    }
    if (renderActive && shouldRender && isActiveTab(container)) {
      render();
    }
    if (reloadActive && shouldReload) {
      void loadFamilyResources(state.activeFamily, { force: true });
    }
  };

  const handleModelsInvalidation = () => {
    const token = consumeModelsInvalidation();
    if (!token) return;
    invalidateFamilyState(['models', 'connections'], { renderActive: true, reloadActive: true });
  };

  const handleConnectionsInvalidation = () => {
    const token = consumeConnectionsInvalidation();
    if (!token) return;
    invalidateFamilyState(['models', 'connections'], { renderActive: true, reloadActive: true });
  };

  const handleToolServersInvalidation = () => {
    const token = consumeToolServersInvalidation();
    if (!token) return;
    invalidateFamilyState(['mcp-servers'], { renderActive: true, reloadActive: true });
  };

  const getConnectionRulesByIdForWarnings = () => {
    const currentConnections = Array.isArray(state.resources.connections)
      ? state.resources.connections
      : [];
    if (currentConnections.length) {
      const map = new Map();
      for (const resource of currentConnections) {
        const connectionId = String(resource?.id || '').trim();
        if (!connectionId) continue;
        const rules = Array.isArray(resource?.rules) ? resource.rules : [];
        map.set(connectionId, cloneAclRules(rules, normalizeAclRule));
      }
      return map;
    }
    return state.modelConnectionRulesById instanceof Map
      ? state.modelConnectionRulesById
      : new Map();
  };

  const handleVisibilityOutsideClick = (event) => {
    if (!state.filtersOpen) return;
    const button = container.querySelector('#policy-visibility-toggle');
    const menu = container.querySelector('[data-policy-visibility-menu]');
    const target = event?.target;
    if (button?.contains(target) || menu?.contains(target)) return;
    state.filtersOpen = false;
    render();
  };

  const getSelectedSet = (familyKey) => state.selectionByFamily[familyKey] || DEFAULT_SELECTION();
  const setSelectedSet = (familyKey, values) => {
    state.selectionByFamily[familyKey] = new Set(
      Array.isArray(values) ? values : Array.from(values || [])
    );
  };
  const getPagination = (familyKey) =>
    state.paginationByFamily[familyKey] || { page: 1, pageSize: 20 };
  const setPagination = (familyKey, next) => {
    state.paginationByFamily[familyKey] = {
      page: Math.max(1, Number.parseInt(next?.page || 1, 10) || 1),
      pageSize: PAGE_SIZES.includes(Number.parseInt(next?.pageSize, 10))
        ? Number.parseInt(next.pageSize, 10)
        : 20,
    };
  };

  const applyResourceRulesImmediate = async (familyKey, resourceIds, nextRules) => {
    const ids = new Set(
      (Array.isArray(resourceIds) ? resourceIds : [resourceIds])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    );
    if (!ids.size) return;

    const targetResources = (state.resources[familyKey] || []).filter((resource) =>
      ids.has(String(resource.id || '').trim())
    );
    if (!targetResources.length) return;

    // Store previous state for rollback
    const previousState = targetResources.map((resource) => ({
      id: resource.id,
      rules: cloneAclRules(resource.rules || [], normalizeAclRule),
    }));

    // Optimistic UI update
    state.resources[familyKey] = (state.resources[familyKey] || []).map((resource) => {
      if (!ids.has(String(resource.id || '').trim())) return resource;
      return {
        ...resource,
        rules: cloneAclRules(nextRules, normalizeAclRule),
      };
    });
    render();

    // Make API call
    try {
      const updates = targetResources.map((resource) => ({
        [familyKey === 'models'
          ? 'model_id'
          : familyKey === 'connections'
            ? 'connection_id'
            : 'tool_server_id']: resource.id,
        rules: cloneAclRules(nextRules, normalizeAclRule),
      }));
      await saveFamilyAccess({ familyKey, updates });
      broadcastModelsInvalidation();
      broadcastConnectionsInvalidation();
      broadcastToolServersInvalidation();
    } catch (err) {
      // Rollback on error
      state.resources[familyKey] = (state.resources[familyKey] || []).map((resource) => {
        const prev = previousState.find((p) => p.id === resource.id);
        if (!prev) return resource;
        return {
          ...resource,
          rules: cloneAclRules(prev.rules, normalizeAclRule),
        };
      });
      render();
      // Show error banner
      const errorBanner = container.querySelector('[data-policy-error-banner]');
      if (errorBanner) {
        errorBanner.textContent = err?.message || 'Failed to save policy changes';
        errorBanner.classList.remove('hidden');
        setTimeout(() => {
          errorBanner.classList.add('hidden');
        }, 5000);
      }
      throw err;
    }
  };

  const filterResources = (familyKey, resources = []) => {
    const query = state.query.trim().toLowerCase();
    const filtered = (Array.isArray(resources) ? resources : []).filter((resource) => {
      if (resource?.enabled === false && !state.visibilityFilters.disabled) return false;
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
      if (query && !text.includes(query)) return false;
      const category = getResourceAccessState(
        resource,
        state.selectedGroupId === 'all' ? '' : state.selectedGroupId
      );
      return Boolean(state.visibilityFilters[category]);
    });
    return filtered;
  };

  const getPagedResources = (familyKey) => {
    const list = state.resources[familyKey] || [];
    const filtered = filterResources(familyKey, list);
    const pagination = getPagination(familyKey);
    const pageSize = pagination.pageSize || 20;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(pagination.page || 1, 1), totalPages);
    const start = total === 0 ? 0 : (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return {
      filtered,
      items,
      total,
      totalPages,
      page,
      pageSize,
      start,
      end: Math.min(start + pageSize, total),
    };
  };

  const openDeepLinkedAccessModal = async (familyKey) => {
    if (
      state.deepLinkOpened ||
      !state.pendingDeepLink ||
      state.pendingDeepLink.familyKey !== familyKey
    )
      return;
    const targetResource = (state.resources[familyKey] || []).find(
      (resource) => String(resource.id || '').trim() === state.pendingDeepLink.resourceId
    );
    if (!targetResource) return;
    state.deepLinkOpened = true;
    const connectionRulesById = getConnectionRulesByIdForWarnings();
    const resourceWarning =
      familyKey === 'models'
        ? buildModelAccessModalWarning(
            [targetResource],
            state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
            connectionRulesById
          )
        : null;
    await openAccessModal({
      familyKey,
      resource: targetResource,
      groups: state.groups,
      selectedGroupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
      resourceWarning,
      onSaved: async (nextRules, targetResources) => {
        await applyResourceRulesImmediate(
          familyKey,
          targetResources.map((item) => item.id),
          nextRules
        );
      },
    });
  };

  const loadFamilyResources = async (familyKey, { force = false } = {}) => {
    if (!force && state.familyStatus[familyKey] === 'loaded') {
      return;
    }
    if (state.familyStatus[familyKey] === 'loading' && !force) return;

    abortFamilyLoad(familyKey);
    const controller = new AbortController();
    familyAbortControllers[familyKey] = controller;

    const seq = familyLoadSeq[familyKey] + 1;
    familyLoadSeq[familyKey] = seq;
    state.error = null;
    state.familyError[familyKey] = null;
    state.familyStatus[familyKey] = 'loading';
    if (isActiveTab(container)) render();

    try {
      let payload;
      if (familyKey === 'models') {
        payload = await fetchAdminModels({
          limit: 1000,
          offset: 0,
          includeDisabled: false,
          signal: controller.signal,
        });
      } else if (familyKey === 'connections') {
        const res = await apiFetch('/api/admin/openai/connections', { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to load connections');
        payload = await res.json();
      } else {
        const res = await apiFetch('/api/admin/tool-servers', { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to load MCP servers');
        payload = await res.json();
      }

      if (controller.signal.aborted) return;
      if (familyLoadSeq[familyKey] !== seq) return;

      const resources =
        familyKey === 'models'
          ? filterEnabledResources(payload.models)
          : familyKey === 'connections'
            ? filterEnabledResources(payload.connections)
            : filterEnabledResources(payload.servers);
      const ids = resources.map((resource) => resource.id).filter(Boolean);
      let accessRules = [];
      let connectionAccessRules = [];
      if (ids.length) {
        const accessPayload = await loadFamilyAccess({
          familyKey,
          resourceIds: ids,
          signal: controller.signal,
        });
        accessRules = Array.isArray(accessPayload.rules) ? accessPayload.rules : [];
      }
      if (familyKey === 'models') {
        const connectionIds = Array.from(
          new Set(
            resources
              .map((resource) => String(resource?.connection_id || '').trim())
              .filter(Boolean)
          )
        );
        if (connectionIds.length) {
          try {
            const connectionAccessPayload = await loadFamilyAccess({
              familyKey: 'connections',
              resourceIds: connectionIds,
              signal: controller.signal,
            });
            connectionAccessRules = Array.isArray(connectionAccessPayload.rules)
              ? connectionAccessPayload.rules
              : [];
          } catch (err) {
            console.warn(
              'Failed to load connection dependency access for models:',
              err?.message || err
            );
            connectionAccessRules = [];
          }
        }
      }

      if (controller.signal.aborted) return;
      if (familyLoadSeq[familyKey] !== seq) return;

      const rulesByResource = new Map();
      for (const rule of accessRules) {
        const resourceId = String(
          rule?.model_id || rule?.connection_id || rule?.tool_server_id || ''
        ).trim();
        if (!resourceId) continue;
        if (!rulesByResource.has(resourceId)) {
          rulesByResource.set(resourceId, []);
        }
        rulesByResource.get(resourceId).push(rule);
      }
      if (familyKey === 'models') {
        const connectionRulesById = new Map();
        for (const rule of connectionAccessRules) {
          const connectionId = String(rule?.connection_id || '').trim();
          if (!connectionId) continue;
          if (!connectionRulesById.has(connectionId)) {
            connectionRulesById.set(connectionId, []);
          }
          connectionRulesById.get(connectionId).push(rule);
        }
        state.modelConnectionRulesById = connectionRulesById;
      }

      const sortedResources = sortResourcesByVisibility(
        resources,
        state.selectedGroupId === 'all' ? '' : state.selectedGroupId
      );

      state.resources[familyKey] = sortedResources.map((resource) => ({
        ...resource,
        rules: cloneAclRules(rulesByResource.get(resource.id) || [], normalizeAclRule),
      }));
      if (state.pendingDeepLink && state.pendingDeepLink.familyKey === familyKey) {
        void openDeepLinkedAccessModal(familyKey).catch((err) => {
          console.warn('Failed to open deep-linked ACL modal:', err);
        });
      }
      state.familyStatus[familyKey] = 'loaded';
    } catch (err) {
      if (controller.signal.aborted || String(err?.name || '').toLowerCase() === 'aborterror') {
        return;
      }
      if (familyLoadSeq[familyKey] === seq) {
        state.familyStatus[familyKey] = 'error';
        state.familyError[familyKey] = err?.message || 'Failed to load policies';
      }
    } finally {
      if (familyLoadSeq[familyKey] === seq && familyAbortControllers[familyKey] === controller) {
        familyAbortControllers[familyKey] = null;
      }
      if (familyLoadSeq[familyKey] === seq && isActiveTab(container)) {
        render();
      }
    }
  };

  const render = () => {
    if (!isActiveTab(container)) return;
    const renderSnapshot = captureRenderState(container, {
      inputId: 'policy-search',
      scrollSelector: '[data-policies-scroll]',
    });
    if (state.loading) {
      container.innerHTML = `
        <div class="flex flex-col min-h-0 animate-in fade-in duration-150 w-full">
          <div class="max-w-6xl mx-auto w-full px-1">
            ${renderSkeleton()}
          </div>
        </div>
      `;
      return;
    }

    if (state.error) {
      container.innerHTML = `
        <div class="flex items-center justify-center h-full p-6">
          <div class="max-w-md w-full rounded-3xl border border-red-100 bg-red-50/60 p-6 text-center">
            <div class="text-sm font-semibold text-red-700">Unable to load policies</div>
            <div class="mt-2 text-sm text-red-600">${escapeHtml(state.error)}</div>
          </div>
        </div>
      `;
      return;
    }

    const groupOptions = [
      `<option value="all"${state.selectedGroupId === 'all' ? ' selected' : ''}>All groups</option>`,
      ...state.groups.map(
        (group) =>
          `<option value="${escapeHtml(group.id)}"${state.selectedGroupId === group.id ? ' selected' : ''}>${escapeHtml(group.name || group.id)}</option>`
      ),
    ].join('');

    const familyOptions = FAMILIES.map(
      (family) => `
      <option value="${escapeHtml(family.key)}"${state.activeFamily === family.key ? ' selected' : ''}>${escapeHtml(family.label)}</option>
    `
    ).join('');

    const activeFamily =
      FAMILIES.find((family) => family.key === state.activeFamily) || FAMILIES[0];
    const activePaged = getPagedResources(activeFamily.key);
    const activeSelectedIds = getSelectedSet(activeFamily.key);
    const activeSelectionCount = activeSelectedIds.size;
    const activeVisibleIds = activePaged.items.map((resource) => resource.id);
    const activeVisibleSelectedCount = activeVisibleIds.filter((id) =>
      activeSelectedIds.has(id)
    ).length;
    const activeAllVisibleSelected =
      activeVisibleIds.length > 0 && activeVisibleSelectedCount === activeVisibleIds.length;
    const activeVisibilityCount = Object.entries(state.visibilityFilters).filter(
      ([key, value]) => DEFAULT_VISIBILITY_FILTERS[key] !== value
    ).length;
    const activeFamilyStatus = state.familyStatus[activeFamily.key] || 'idle';
    const activeFamilyError = state.familyError[activeFamily.key] || '';
    const activeFamilyToolbar = `
      <div class="flex items-center justify-between gap-3 rounded-3xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <span class="text-xs text-gray-500 truncate">${escapeHtml(activeSelectionCount ? `${activeSelectionCount} selected` : 'No selection')}</span>
          ${activeAllVisibleSelected ? '' : `${renderButton({ label: 'Select visible', variant: 'secondary', className: 'px-3 py-1.5 text-[11px]', dataAttrs: { 'select-visible-family': activeFamily.key } })}`}
          ${activeSelectionCount ? `${renderButton({ label: 'Clear', variant: 'secondary', className: 'px-3 py-1.5 text-[11px]', dataAttrs: { 'clear-selection-family': activeFamily.key } })}` : ''}
          ${renderButton({ label: 'Bulk ACL', variant: 'primary', className: 'px-3 py-1.5 text-[11px]', disabled: !activeSelectionCount, dataAttrs: { 'bulk-edit-family': activeFamily.key } })}
        </div>
        <div class="text-xs text-gray-400">${activeVisibleIds.length ? `${activeVisibleSelectedCount}/${activeVisibleIds.length} visible selected` : 'No visible rows'}</div>
      </div>
    `;
    const activeFamilyFooter = `
      <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500 border-t border-gray-100">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-3">
            <span>Show</span>
            <select data-page-size-family="${activeFamily.key}" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
              ${PAGE_SIZES.map((size) => `<option value="${size}" ${activePaged.pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}
            </select>
            <span>per page</span>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-xs text-gray-400">${activePaged.total ? `${activePaged.start + 1}-${activePaged.end} of ${activePaged.total}` : '0 of 0'}</div>
            <div class="flex items-center gap-2">
              <button type="button" data-prev-page-family="${activeFamily.key}" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition disabled:opacity-50" ${activePaged.page <= 1 ? 'disabled' : ''}>Prev</button>
              <div class="text-sm text-gray-600">Page ${activePaged.page} / ${activePaged.totalPages}</div>
              <button type="button" data-next-page-family="${activeFamily.key}" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition disabled:opacity-50" ${activePaged.page >= activePaged.totalPages ? 'disabled' : ''}>Next</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const activeFamilyPanel = `
      <div data-family-panel="${activeFamily.key}" class="space-y-4">
        ${
          activeFamilyStatus === 'error'
            ? `
          <div class="rounded-3xl border border-red-100 bg-red-50/70 p-5 text-sm text-red-700">
            <div class="font-semibold">Unable to load ${escapeHtml(activeFamily.label.toLowerCase())}</div>
            <div class="mt-1 text-red-600">${escapeHtml(activeFamilyError || 'Please try again.')}</div>
          </div>
        `
            : activeFamilyStatus === 'loaded'
              ? renderResourceList({
                  title: activeFamily.label,
                  familyKey: activeFamily.key,
                  resources: activePaged.items,
                  groupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
                  selectedIds: activeSelectedIds,
                  connectionRulesById:
                    activeFamily.key === 'models' ? getConnectionRulesByIdForWarnings() : new Map(),
                  onToggleSelection: true,
                  onEdit: null,
                })
              : renderFamilySkeleton()
        }
      </div>
    `;
    const stickyHeader = `
      <div class="shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 relative z-10 isolate">
        <div class="max-w-6xl mx-auto w-full space-y-1 py-1.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Access Policies</div>
            </div>
          </div>
          ${
            window.location.pathname.startsWith('/admin/users/policies')
              ? `
            <div class="px-0.5 text-[11px] text-gray-500 leading-tight">
              Slim policy review view. Disabled resources stay hidden by default.
            </div>
          `
              : ''
          }

          <div class="flex flex-nowrap items-end gap-2 overflow-visible">
            <label class="min-w-0 flex-[0.95] space-y-1">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Group</span>
              <select id="policy-group-filter" class="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-400">
                ${groupOptions}
              </select>
            </label>
            <label class="min-w-[10rem] flex-[0.8] space-y-1">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Resources</span>
              <select id="policy-family-select" class="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-400">
                ${familyOptions}
              </select>
            </label>
            <label class="min-w-0 flex-[1.5] space-y-1">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Search</span>
              <input id="policy-search" value="${escapeHtml(state.query)}" class="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-400" placeholder="Search resources">
            </label>
            <div class="relative shrink-0 z-50">
              <button type="button" id="policy-visibility-toggle" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 outline-none focus:border-gray-400 hover:bg-gray-50" aria-label="Visibility" title="Visibility">
                <span class="flex items-center gap-1">
                  ${activeVisibilityCount ? '<span class="rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] text-white">' + String(activeVisibilityCount) + '</span>' : ''}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5 text-gray-400">
                    <path fill-rule="evenodd" d="M3.5 5.25a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H4.25a.75.75 0 0 1-.75-.75Zm0 4.75a.75.75 0 0 1 .75-.75h8a.75.75 0 0 1 0 1.5h-8a.75.75 0 0 1-.75-.75Zm0 4.75a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" />
                  </svg>
                </span>
              </button>
              <div data-policy-visibility-menu class="${state.filtersOpen ? '' : 'hidden'} absolute right-0 top-full z-[120] mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
                <div class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Visibility</div>
                <div class="mt-1 text-[11px] text-gray-500">Applies to the selected group.</div>
                <label class="mt-3 flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300" data-policy-filter="allowed" ${state.visibilityFilters.allowed ? 'checked' : ''}>
                  <span>
                    ${(() => {
                      const badge = getVisibilityFilterBadge(
                        'Allowed',
                        state.visibilityFilters.allowed
                      );
                      return `<span class="block">${resourceBadge(badge.label, badge.kind, true)}</span>`;
                    })()}
                    <span class="block text-[11px] text-gray-500">Show allowlisted resources.</span>
                  </span>
                </label>
                <label class="mt-3 flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300" data-policy-filter="inaccessible" ${state.visibilityFilters.inaccessible ? 'checked' : ''}>
                  <span>
                    ${(() => {
                      const badge = getVisibilityFilterBadge(
                        'No access',
                        state.visibilityFilters.inaccessible
                      );
                      return `<span class="block">${resourceBadge(badge.label, badge.kind, true)}</span>`;
                    })()}
                    <span class="block text-[11px] text-gray-500">Show resources with no matching ACL rule.</span>
                  </span>
                </label>
                <label class="mt-3 flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300" data-policy-filter="denied" ${state.visibilityFilters.denied ? 'checked' : ''}>
                  <span>
                    ${(() => {
                      const badge = getVisibilityFilterBadge(
                        'Denied',
                        state.visibilityFilters.denied
                      );
                      return `<span class="block">${resourceBadge(badge.label, badge.kind, true)}</span>`;
                    })()}
                    <span class="block text-[11px] text-gray-500">Show explicit deny rules.</span>
                  </span>
                </label>
                ${
                  window.location.pathname.startsWith('/admin/users/policies')
                    ? ''
                    : `
                <label class="mt-3 flex items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300" data-policy-filter="disabled" ${state.visibilityFilters.disabled ? 'checked' : ''}>
                  <span>
                    ${(() => {
                      const badge = getVisibilityFilterBadge(
                        'Disabled',
                        state.visibilityFilters.disabled
                      );
                      return `<span class="block">${resourceBadge(badge.label, badge.kind, true)}</span>`;
                    })()}
                    <span class="block text-[11px] text-gray-500">Show disabled resources.</span>
                  </span>
                </label>`
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="flex flex-col min-h-0 animate-in fade-in duration-300">
        ${stickyHeader}
        ${
          activeFamilyStatus === 'loaded'
            ? `
          <div class="shrink-0 bg-white border-b border-gray-100">
            <div class="max-w-6xl mx-auto w-full px-0.5 py-3">
              ${activeFamilyToolbar}
            </div>
          </div>
        `
            : ''
        }
        <div class="flex-1 min-h-0" data-policies-scroll="1">
          <div class="max-w-6xl mx-auto w-full space-y-4 pb-6 pt-4">
            <section class="space-y-4">
              ${activeFamilyPanel}
            </section>
          </div>
        </div>
        <div class="shrink-0 bg-white border-t border-gray-100">
          <div class="max-w-6xl mx-auto w-full space-y-0.5">
            ${activeFamilyFooter}
          </div>
        </div>
      </div>
    `;

    container.querySelector('#policy-group-filter')?.addEventListener('change', (event) => {
      state.selectedGroupId = event.target.value || 'all';
      const url = new URL(window.location.href);
      if (state.selectedGroupId === 'all') {
        url.searchParams.delete('group');
      } else {
        url.searchParams.set('group', state.selectedGroupId);
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      for (const family of FAMILIES) {
        if (state.resources[family.key]) {
          state.resources[family.key] = sortResourcesByVisibility(
            state.resources[family.key],
            state.selectedGroupId === 'all' ? '' : state.selectedGroupId
          );
        }
      }
      for (const family of FAMILIES) {
        setPagination(family.key, { ...getPagination(family.key), page: 1 });
      }
      render();
    });
    container.querySelector('#policy-search')?.addEventListener('input', (event) => {
      state.query = event.target.value || '';
      for (const family of FAMILIES) {
        setPagination(family.key, { ...getPagination(family.key), page: 1 });
      }
      render();
    });
    container.querySelector('#policy-visibility-toggle')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.filtersOpen = !state.filtersOpen;
      render();
    });
    container.querySelector('#policy-family-select')?.addEventListener('change', (event) => {
      const nextFamily = event.target.value || 'models';
      if (!FAMILIES.some((family) => family.key === nextFamily)) return;
      abortAllFamilyLoads();
      state.activeFamily = nextFamily;
      if (state.familyStatus[state.activeFamily] === 'idle') {
        void loadFamilyResources(state.activeFamily);
      }
      render();
    });
    container.querySelectorAll('[data-policy-filter]').forEach((input) => {
      input.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      input.addEventListener('change', () => {
        const filterKey = input.getAttribute('data-policy-filter');
        if (filterKey && filterKey in state.visibilityFilters) {
          state.visibilityFilters[filterKey] = input.checked;
        }
        for (const family of FAMILIES) {
          setPagination(family.key, { ...getPagination(family.key), page: 1 });
        }
        render();
      });
    });
    container.querySelectorAll('[data-edit-resource]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const familyKey = btn.dataset.family || 'models';
        const resourceId = btn.dataset.editResource || '';
        const resource = (state.resources[familyKey] || []).find(
          (item) => String(item.id) === resourceId
        );
        if (!resource) return;
        try {
          const connectionRulesById = getConnectionRulesByIdForWarnings();
          await openAccessModal({
            familyKey,
            resource,
            groups: state.groups,
            selectedGroupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
            resourceWarning:
              familyKey === 'models'
                ? buildModelAccessModalWarning(
                    [resource],
                    state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
                    connectionRulesById
                  )
                : null,
            onSaved: async (nextRules, targetResources) => {
              await applyResourceRulesImmediate(
                familyKey,
                targetResources.map((item) => item.id),
                nextRules
              );
            },
          });
        } catch (err) {
          console.warn('Failed to open access modal:', err);
        }
      });
    });

    container.querySelectorAll('[data-select-resource]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const familyKey = state.activeFamily;
        const resourceId = checkbox.getAttribute('data-select-resource');
        if (!resourceId) return;
        const next = new Set(getSelectedSet(familyKey));
        if (checkbox.checked) next.add(resourceId);
        else next.delete(resourceId);
        setSelectedSet(familyKey, next);
        render();
      });
    });

    container.querySelectorAll('[data-select-visible-family]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const familyKey = btn.getAttribute('data-select-visible-family') || state.activeFamily;
        const visible = getPagedResources(familyKey).items.map((resource) => resource.id);
        const next = visible;
        setSelectedSet(familyKey, next);
        render();
      });
    });

    container.querySelectorAll('[data-clear-selection-family]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const familyKey = btn.getAttribute('data-clear-selection-family') || state.activeFamily;
        setSelectedSet(familyKey, []);
        render();
      });
    });

    container.querySelectorAll('[data-bulk-edit-family]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const familyKey = btn.getAttribute('data-bulk-edit-family') || state.activeFamily;
        const selectedIds = getSelectedSet(familyKey);
        const resources = (state.resources[familyKey] || []).filter((resource) =>
          selectedIds.has(resource.id)
        );
        if (!resources.length) return;
        try {
          const connectionRulesById = getConnectionRulesByIdForWarnings();
          await openAccessModal({
            familyKey,
            resource: resources[0],
            resources,
            groups: state.groups,
            selectedGroupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
            resourceWarning:
              familyKey === 'models'
                ? buildModelAccessModalWarning(
                    resources,
                    state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
                    connectionRulesById
                  )
                : null,
            onSaved: async (nextRules, targetResources) => {
              await applyResourceRulesImmediate(
                familyKey,
                targetResources.map((item) => item.id),
                nextRules
              );
              setSelectedSet(familyKey, []);
            },
          });
        } catch (err) {
          console.warn('Failed to open bulk access modal:', err);
        }
      });
    });

    container.querySelectorAll('[data-page-size-family]').forEach((select) => {
      select.addEventListener('change', () => {
        const familyKey = select.getAttribute('data-page-size-family') || state.activeFamily;
        const nextSize = Number.parseInt(select.value, 10);
        setPagination(familyKey, {
          page: 1,
          pageSize: PAGE_SIZES.includes(nextSize) ? nextSize : 20,
        });
        render();
      });
    });

    container.querySelectorAll('[data-prev-page-family]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const familyKey = btn.getAttribute('data-prev-page-family') || state.activeFamily;
        const pagination = getPagination(familyKey);
        setPagination(familyKey, { ...pagination, page: Math.max(1, pagination.page - 1) });
        render();
      });
    });

    container.querySelectorAll('[data-next-page-family]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const familyKey = btn.getAttribute('data-next-page-family') || state.activeFamily;
        const pagination = getPagination(familyKey);
        const { totalPages } = getPagedResources(familyKey);
        setPagination(familyKey, {
          ...pagination,
          page: Math.min(totalPages, pagination.page + 1),
        });
        render();
      });
    });

    restoreRenderState(container, renderSnapshot, {
      inputId: 'policy-search',
      scrollSelector: '[data-policies-scroll]',
    });
  };

  const load = async () => {
    state.loading = true;
    state.error = null;
    render();
    try {
      const groupsPayload = await fetchAdminGroups();

      state.groups = Array.isArray(groupsPayload.groups) ? groupsPayload.groups : [];
      if (
        state.selectedGroupId !== 'all' &&
        !state.groups.some((group) => group.id === state.selectedGroupId)
      ) {
        state.selectedGroupId = 'all';
      }
    } catch (err) {
      state.error = err?.message || 'Failed to load policies';
    } finally {
      state.loading = false;
      if (isActiveTab(container)) render();
      if (!state.error) {
        void loadFamilyResources(state.activeFamily);
      }
    }
  };

  const handlePoliciesUpdated = () => {
    const targetFamily = state.activeFamily;
    loadFamilyResources(targetFamily, { force: true }).catch((err) => {
      state.error = err?.message || 'Failed to reload policies';
      state.loading = false;
      if (isActiveTab(container)) render();
    });
  };

  const handleStorageInvalidation = (event) => {
    if (event.key === 'growchat_models_invalidate') {
      handleModelsInvalidation();
    }
    if (event.key === 'growchat_connections_invalidate') {
      handleConnectionsInvalidation();
    }
    if (event.key === 'growchat_tool_servers_invalidate') {
      handleToolServersInvalidation();
    }
  };

  window.addEventListener('growchat:policies-updated', handlePoliciesUpdated);
  window.addEventListener('growchat:models-invalidated', handleModelsInvalidation);
  window.addEventListener('growchat:connections-invalidated', handleConnectionsInvalidation);
  window.addEventListener('growchat:tool-servers-invalidated', handleToolServersInvalidation);
  window.addEventListener('storage', handleStorageInvalidation);
  document.addEventListener('click', handleVisibilityOutsideClick, true);

  cleanupListeners = () => {
    window.removeEventListener('growchat:policies-updated', handlePoliciesUpdated);
    window.removeEventListener('growchat:models-invalidated', handleModelsInvalidation);
    window.removeEventListener('growchat:connections-invalidated', handleConnectionsInvalidation);
    window.removeEventListener('growchat:tool-servers-invalidated', handleToolServersInvalidation);
    window.removeEventListener('storage', handleStorageInvalidation);
    document.removeEventListener('click', handleVisibilityOutsideClick, true);
    abortAllFamilyLoads();
  };

  container.__cleanup = () => {
    cleanupListeners?.();
    cleanupListeners = null;
  };

  load();
}
