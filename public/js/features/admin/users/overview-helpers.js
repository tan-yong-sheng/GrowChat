/**
 * Utility helpers for the admin users overview.
 */
import { fetchAdminRbacRoles } from '../../../shared/api.js';

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export { escapeHtml };

export function roleBadgeClass(role) {
  const value = String(role || '')
    .trim()
    .toLowerCase();
  if (value === 'admin') return 'bg-neutral-900 text-white';
  if (value === 'member') return 'bg-neutral-100 text-neutral-900';
  return 'bg-gray-100 text-gray-700';
}

export function roleDisplayName(role) {
  const value = String(role || '').trim();
  if (!value) return 'Member';
  const normalized = value.toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'member') return 'Member';
  return value;
}

export function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase();
}

export function buildRoleSelectOptions(roles, selectedRole = 'member') {
  const selected = normalizeRole(selectedRole);
  const orderedRoles = [];
  const seen = new Set();
  const pushRole = (roleName) => {
    const value = String(roleName || '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    orderedRoles.push(value);
  };
  pushRole('member');
  pushRole('admin');
  (Array.isArray(roles) ? roles : []).forEach((role) => pushRole(role?.name));
  pushRole(selectedRole);
  return orderedRoles
    .map(
      (roleName) => `
      <option value="${escapeHtml(roleName)}" ${normalizeRole(roleName) === selected ? 'selected' : ''}>${escapeHtml(roleDisplayName(roleName))}</option>
    `
    )
    .join('');
}

export async function loadAdminRoles() {
  try {
    const payload = await fetchAdminRbacRoles({ cache: 'no-store' });
    return Array.isArray(payload?.roles) ? payload.roles : [];
  } catch {
    return [];
  }
}

export function accountStatusBadgeClass(status) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700';
  if (status === 'pending') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-200 text-gray-600';
}

export function accountStatusDisplayName(status) {
  return status === 'pending' ? 'pending' : 'active';
}

export function timeSince(timestampMs) {
  if (!timestampMs) return 'N/A';
  const seconds = Math.floor((Date.now() - timestampMs) / 1000);
  const buckets = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, label] of buckets) {
    const value = Math.floor(seconds / size);
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`;
  }
  return `${Math.max(seconds, 0)} seconds ago`;
}

export function getActionError(payload, fallback) {
  return payload?.error || payload?.message || fallback;
}

export function accessBadgeClass(value) {
  if (value === 'allow') return 'bg-neutral-900 text-white border-neutral-900';
  if (value === 'deny') return 'bg-neutral-100 text-neutral-600 border-neutral-200 line-through';
  if (value === 'danger') return 'bg-neutral-100 text-neutral-900 border-neutral-900';
  if (value === 'warning') return 'bg-neutral-100 text-neutral-900 border-neutral-300';
  if (value === 'admin') return 'bg-neutral-900 text-white border-neutral-900';
  if (value === 'member') return 'bg-neutral-100 text-neutral-900 border-neutral-200';
  if (value === 'shared') return 'bg-neutral-100 text-neutral-900 border-neutral-300';
  if (value === 'personal') return 'bg-neutral-50 text-neutral-500 border-neutral-200';
  return 'bg-neutral-50 text-neutral-500 border-neutral-200';
}

export function renderChip(label, kind = 'neutral') {
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wide ${accessBadgeClass(kind)}">${escapeHtml(label)}</span>`;
}

export function getRuleAccessState(rule = {}) {
  if (rule?.resource_enabled === false) {
    return { label: 'Disabled', kind: 'danger' };
  }
  if (rule?.hidden_for_user) {
    return { label: 'Hidden for user', kind: 'warning' };
  }
  if (String(rule?.effect || '').toLowerCase() === 'deny') {
    return { label: 'Revoked', kind: 'danger' };
  }
  if (String(rule?.principal_type || '').toLowerCase() === 'group') {
    return { label: 'Shared', kind: 'shared' };
  }
  return { label: 'Personal', kind: 'personal' };
}

export function renderRuleList(rules = [], { showDisabled = false } = {}) {
  const visibleRules = Array.isArray(rules)
    ? rules.filter((rule) => showDisabled || rule?.resource_enabled !== false)
    : [];
  if (!visibleRules.length) {
    return '<div class="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-3 text-xs text-gray-600">No matching ACL rules</div>';
  }
  return `
    <div class="space-y-2">
      ${visibleRules
        .map((rule) => {
          const state = getRuleAccessState(rule);
          return `
        <div class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs text-gray-700 ${rule?.resource_enabled === false ? 'opacity-60' : ''}">
          ${renderChip(state.label, state.kind)}
          ${renderChip(rule.effect || 'allow', rule.effect)}
          ${renderChip(rule.principal_label || rule.principal_type, 'neutral')}
          <span class="font-semibold text-gray-900">${escapeHtml(rule.resource_id || 'All resources')}</span>
          <span class="text-gray-600">·</span>
          <span class="text-gray-500">${escapeHtml(rule.action || 'use')}</span>
          ${rule?.hidden_for_user ? '<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wide text-amber-700">Hidden for user</span>' : ''}
          ${rule?.resource_enabled === false ? '<span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wide text-gray-500">Disabled</span>' : ''}
        </div>
      `;
        })
        .join('')}
    </div>
  `;
}
