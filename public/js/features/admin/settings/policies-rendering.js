/**
 * HTML rendering helpers for the policies settings view.
 *
 * Template generators for skeletons, resource rows, ACL editor rows,
 * and modal markup.
 */

import { createAdminModalShell } from '../modal-shell.js';
import {
  getResourceNote,
  getResourceLabel,
  getResourceVisibilityBadge,
  getModelConnectionWarning,
  buildPoliciesDeepLink,
} from './policies-acl-helpers.js';

/**
 * Escape a value for safe inclusion in HTML attributes and text.
 */
import { escapeHtml } from '../../../shared/utils/dom-escape.js';
export { escapeHtml };

/**
 * Render a small coloured badge pill.
 */
export function resourceBadge(label, kind = 'neutral', compact = false) {
  const map = {
    neutral: 'bg-gray-100 text-gray-700 border-gray-200',
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    danger: 'bg-rose-100 text-rose-700 border-rose-200',
    admin: 'bg-amber-100 text-amber-700 border-amber-200',
    shared: 'bg-surface-container text-on-surface border-outline-variant',
    personal: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    none: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  const sizeClass = compact ? 'px-[5px] py-0.5 text-label-xs' : 'px-1.5 py-0.5 text-label-xs';
  return `<span class="inline-flex items-center rounded-full border ${sizeClass} font-semibold uppercase tracking-wide ${map[kind] || map.neutral}">${escapeHtml(label)}</span>`;
}

/**
 * Create the modal shell used by the access editor.
 */
export function createModal({ preset = 'aclEditor', title, subtitle, body, footer }) {
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

/**
 * Full-page skeleton shown while policies are loading.
 */
export function renderSkeleton() {
  return `
  <div class="space-y-4">
    <div class="h-12 w-full rounded-lg bg-gray-100 animate-pulse"></div>
    <div class="grid gap-3">
      ${Array.from({ length: 4 })
        .map(
          () => `
      <div class="h-20 rounded-lg bg-gray-50 border border-gray-100 animate-pulse"></div>
      `
        )
        .join('')}
    </div>
  </div>
  `;
}

/**
 * Skeleton for a single family panel while it loads.
 */
export function renderFamilySkeleton() {
  return `
  <div class="space-y-4">
    <div class="h-12 w-full rounded-lg bg-gray-100 animate-pulse"></div>
    <div class="grid gap-2">
      ${Array.from({ length: 4 })
        .map(
          () => `
      <div class="group flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2 py-0.5 shadow-sm">
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
    <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between gap-4">
        <div class="h-9 w-28 rounded-lg bg-gray-100 animate-pulse"></div>
        <div class="h-9 w-48 rounded-lg bg-gray-100 animate-pulse"></div>
      </div>
    </div>
  </div>
  `;
}

/**
 * Render the owner badge for a resource.
 */
function renderOwnerBadge(resource) {
  return resource.source === 'user'
    ? resourceBadge('Personal', 'personal', true)
    : resourceBadge('Platform', 'admin', true);
}

/**
 * Build the dependency warning for a model resource.
 */
function buildDependencyWarning(resource, familyKey, groupId, connectionRulesById) {
  return familyKey === 'models'
    ? getModelConnectionWarning(resource, groupId, connectionRulesById)
    : null;
}

/**
 * Render the selection checkbox for a resource row.
 */
function renderSelectionCheckbox({ resource, isSelected, onToggleSelection, note }) {
  if (!onToggleSelection) return '';
  return `
          <input type="checkbox" class="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-300 shrink-0"
            data-select-resource="${escapeHtml(resource.id)}"
            ${isSelected ? 'checked' : ''}
            aria-label="Select ${escapeHtml(getResourceLabel(resource))}"
          >
          `;
}

/**
 * Render the dependency warning link for a resource row.
 */
function renderDependencyWarning(dependencyWarning, { groupId, resource }) {
  const href =
    dependencyWarning.linkHref ||
    buildPoliciesDeepLink({
      groupId,
      familyKey: 'connections',
      resourceId: resource.connection_id || '',
      open: 'access',
    });
  return `
          <a href="${escapeHtml(href)}"
            class="inline-flex items-center gap-1 rounded-full border px-[5px] py-0.5 text-label-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
            title="${escapeHtml(dependencyWarning.title)}"
            aria-label="${escapeHtml(dependencyWarning.linkLabel || dependencyWarning.title)}"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.5 15A1.5 1.5 0 0 0 3.08 21h17.84a1.5 1.5 0 0 0 1.29-2.14l-8.5-15a1.5 1.5 0 0 0-2.58 0Z" />
            </svg>
            <span>Blocked</span>
          </a>
          `;
}

/**
 * Render the edit button for a resource row.
 */
function renderEditButton({ resource, familyKey, editDisabled }) {
  const disabledClass = editDisabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : '';
  const disabledAttr = editDisabled ? 'disabled' : '';
  const title = editDisabled ? 'Disabled resources cannot be edited' : 'Edit access rules';
  return `
          <button type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition ${disabledClass}"
            ${disabledAttr}
            data-edit-resource="${escapeHtml(resource.id)}"
            data-family="${escapeHtml(familyKey)}"
            title="${escapeHtml(title)}"
            aria-label="Edit access rules"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
            </svg>
          </button>
          `;
}

/**
 * Render a single resource row.
 */
function renderResourceRow(resource, ctx) {
  const { familyKey, groupId, selectedIds, connectionRulesById, onToggleSelection } = ctx;
  const visibilityBadge = getResourceVisibilityBadge(resource, groupId);
  const ownerBadge = renderOwnerBadge(resource);
  const dependencyWarning = buildDependencyWarning(
    resource,
    familyKey,
    groupId,
    connectionRulesById
  );
  const isSelected = selectedIds instanceof Set && selectedIds.has(resource.id);
  const note = getResourceNote(resource, familyKey);
  const editDisabled = resource.enabled === false;
  const rowClass = isSelected ? 'border-gray-400 bg-gray-50' : 'border-gray-200 bg-white';
  const disabledBadge = resource.enabled === false ? resourceBadge('Disabled', 'none', true) : '';

  return `
      <div class="group flex items-center justify-between gap-2 rounded-lg border ${rowClass} px-2 py-0.5">
        <label class="flex items-center gap-1 min-w-0 flex-1 cursor-pointer" title="${escapeHtml(note)}">
          ${renderSelectionCheckbox({ resource, isSelected, onToggleSelection, note })}
          <div class="min-w-0 flex items-center gap-1">
            <div class="text-body-sm font-semibold text-gray-900 truncate">${escapeHtml(getResourceLabel(resource))}</div>
            <span class="opacity-80 transition group-hover:opacity-100">${ownerBadge}</span>
            ${disabledBadge}
          </div>
        </label>
        <div class="flex items-center gap-1 shrink-0">
          ${dependencyWarning ? renderDependencyWarning(dependencyWarning, { groupId, resource }) : ''}
          ${resourceBadge(visibilityBadge.label, visibilityBadge.kind, true)}
          ${renderEditButton({ resource, familyKey, editDisabled })}
        </div>
      </div>
      `;
}

/**
 * Render the list of resources for a family with checkboxes and edit buttons.
 */
export function renderResourceList({
  familyKey,
  resources,
  groupId,
  selectedIds = new Set(),
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
              .map((resource) =>
                renderResourceRow(resource, {
                  familyKey,
                  groupId,
                  selectedIds,
                  connectionRulesById,
                  onToggleSelection,
                })
              )
              .join('')
          : `
      <div class="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
        No resources in this family.
      </div>
      `
      }
    </div>
  </section>
  `;
}

/**
 * Build the per-group ACL effect rows used in the access modal.
 */
export function buildAclRows(groups, rules = []) {
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
      <div class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(group.name || group.id)}</div>
            ${group.is_system ? '<span class="text-label-sm font-semibold uppercase tracking-wide text-gray-400">System</span>' : ''}
          </div>
          <div class="text-label-sm text-gray-500 truncate">${escapeHtml(group.description || group.id)}</div>
        </div>
        <select class="resource-acl-effect rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-gray-400"
          data-group-id="${escapeHtml(group.id)}">
          <option value="none" ${effect === 'none' ? 'selected' : ''}>No access</option>
          <option value="allow" ${effect === 'allow' ? 'selected' : ''}>Allow</option>
          <option value="deny" ${effect === 'deny' ? 'selected' : ''}>Deny</option>
        </select>
      </div>
      `;
    })
    .join('');
}

/**
 * Build the selection toolbar HTML for the active family panel.
 */
export function buildFamilyToolbarHtml(ctx) {
  const {
    escapeHtml,
    renderButton,
    activeFamily,
    activeSelectionCount,
    activeAllVisibleSelected,
    activeVisibleIds,
    activeVisibleSelectedCount,
  } = ctx;
  return `<div class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm"><div class="flex items-center gap-2 min-w-0 flex-wrap"><span class="text-xs text-gray-500 truncate">${escapeHtml(activeSelectionCount ? `${activeSelectionCount} selected` : 'No selection')}</span>${activeAllVisibleSelected ? '' : renderButton({ label: 'Select visible', variant: 'secondary', className: 'px-3 py-1.5 text-label-sm', dataAttrs: { 'select-visible-family': activeFamily.key } })}${activeSelectionCount ? renderButton({ label: 'Clear', variant: 'secondary', className: 'px-3 py-1.5 text-label-sm', dataAttrs: { 'clear-selection-family': activeFamily.key } }) : ''}${renderButton({ label: 'Bulk ACL', variant: 'primary', className: 'px-3 py-1.5 text-label-sm', disabled: !activeSelectionCount, dataAttrs: { 'bulk-edit-family': activeFamily.key } })}</div><div class="text-xs text-gray-400">${activeVisibleIds.length ? `${activeVisibleSelectedCount}/${activeVisibleIds.length} visible selected` : 'No visible rows'}</div></div>`;
}

/**
 * Build the pagination footer HTML for the active family panel.
 */
export function buildFamilyFooterHtml(ctx) {
  const { activeFamily, activePaged, PAGE_SIZES } = ctx;
  return `<div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500 border-t border-gray-100"><div class="flex items-center gap-4"><div class="flex items-center gap-3"><span>Show</span><select data-page-size-family="${activeFamily.key}" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">${PAGE_SIZES.map((s) => `<option value="${s}" ${activePaged.pageSize === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span>per page</span></div><div class="flex items-center gap-4"><div class="text-xs text-gray-400">${activePaged.total ? `${activePaged.start + 1}-${activePaged.end} of ${activePaged.total}` : '0 of 0'}</div><div class="flex items-center gap-2"><button type="button" data-prev-page-family="${activeFamily.key}" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition disabled:opacity-50" ${activePaged.page <= 1 ? 'disabled' : ''}>Prev</button><div class="text-sm text-gray-600">Page ${activePaged.page} / ${activePaged.totalPages}</div><button type="button" data-next-page-family="${activeFamily.key}" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 transition disabled:opacity-50" ${activePaged.page >= activePaged.totalPages ? 'disabled' : ''}>Next</button></div></div></div></div>`;
}

/**
 * Build the family panel HTML (error, loaded list, or skeleton).
 */
export function buildFamilyPanelHtml(ctx) {
  const {
    escapeHtml,
    activeFamily,
    activeFamilyStatus,
    activeFamilyError,
    activePaged,
    state,
    getConnectionRulesByIdForWarnings,
    renderResourceList,
    renderFamilySkeleton,
  } = ctx;
  return `<div data-family-panel="${activeFamily.key}" class="space-y-4">${activeFamilyStatus === 'error' ? `<div class="rounded-lg border border-red-100 bg-red-50/70 p-5 text-sm text-red-700"><div class="font-semibold">Unable to load ${escapeHtml(activeFamily.label.toLowerCase())}</div><div class="mt-1 text-red-600">${escapeHtml(activeFamilyError || 'Please try again.')}</div></div>` : activeFamilyStatus === 'loaded' ? renderResourceList({ title: activeFamily.label, familyKey: activeFamily.key, resources: activePaged.items, groupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId, selectedIds: ctx.activeSelectedIds, connectionRulesById: activeFamily.key === 'models' ? getConnectionRulesByIdForWarnings() : new Map(), onToggleSelection: true, onEdit: null }) : renderFamilySkeleton()}</div>`;
}
