import { apiFetch, fetchAdminRbacRoles } from '../../../shared/api.js';
import { fetchAdminUserAccess } from '../../../shared/admin-access.js';
import { bindAdminDraftHandlers, clearAdminDraft, getAdminDraft, setAdminDraft } from '../modal-draft.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { buildAdminModalShellMarkup, createAdminModalShell } from '../modal-shell.js';
import { displayFieldErrors, clearFormErrors } from '../../../shared/form-validation.js';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function roleBadgeClass(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'admin') return 'bg-blue-100 text-blue-700';
  if (value === 'member') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-700';
}

function roleDisplayName(role) {
  const value = String(role || '').trim();
  if (!value) return 'Member';
  const normalized = value.toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'member') return 'Member';
  return value;
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function buildRoleSelectOptions(roles, selectedRole = 'member') {
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

  return orderedRoles.map((roleName) => `
    <option value="${escapeHtml(roleName)}" ${normalizeRole(roleName) === selected ? 'selected' : ''}>${escapeHtml(roleDisplayName(roleName))}</option>
  `).join('');
}

async function loadAdminRoles() {
  try {
    const payload = await fetchAdminRbacRoles({ cache: 'no-store' });
    return Array.isArray(payload?.roles) ? payload.roles : [];
  } catch {
    return [];
  }
}

function accountStatusBadgeClass(status) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700';
  if (status === 'pending') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-200 text-gray-600';
}

function accountStatusDisplayName(status) {
  return status === 'pending' ? 'pending' : 'active';
}

function timeSince(timestampMs) {
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

function getActionError(payload, fallback) {
  return payload?.error || payload?.message || fallback;
}

function accessBadgeClass(value) {
  if (value === 'allow') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (value === 'deny') return 'bg-rose-100 text-rose-700 border-rose-200';
  if (value === 'admin') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (value === 'member') return 'bg-green-100 text-green-700 border-green-200';
  if (value === 'shared') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (value === 'personal') return 'bg-gray-100 text-gray-700 border-gray-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function renderChip(label, kind = 'neutral') {
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accessBadgeClass(kind)}">${escapeHtml(label)}</span>`;
}

function renderRuleList(rules = [], { showDisabled = false } = {}) {
  const visibleRules = Array.isArray(rules)
    ? rules.filter((rule) => showDisabled || rule?.resource_enabled !== false)
    : [];

  if (!visibleRules.length) {
    return '<div class="rounded-2xl border border-gray-100 bg-gray-50/70 px-3 py-3 text-xs text-gray-400">No matching ACL rules</div>';
  }

  return `
    <div class="space-y-2">
      ${visibleRules.map((rule) => `
        <div class="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 text-xs text-gray-700 ${rule?.resource_enabled === false ? 'opacity-60' : ''}">
          ${renderChip(rule.effect || 'allow', rule.effect)}
          ${renderChip(rule.principal_label || rule.principal_type, 'neutral')}
          <span class="font-semibold text-gray-900">${escapeHtml(rule.resource_id || 'All resources')}</span>
          <span class="text-gray-400">·</span>
          <span class="text-gray-500">${escapeHtml(rule.action || 'use')}</span>
          ${rule?.resource_enabled === false ? '<span class="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Disabled</span>' : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderAccessInspectorContent(payload, showDisabled = false) {
  const user = payload?.user || {};
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  const rolePermissions = Array.isArray(payload?.role_permissions) ? payload.role_permissions : [];
  const access = payload?.access || {};
  const allRules = [...(access.models || []), ...(access.connections || []), ...(access.mcp_servers || [])];
  const disabledRuleCount = allRules.filter((rule) => rule?.resource_enabled === false).length;
  const primaryRole = String(user.primary_role || 'member').trim();
  const families = [
    ['Models', access.models || []],
    ['Connections', access.connections || []],
    ['MCP Servers', access.mcp_servers || []],
  ];

  return `
    <div class="space-y-4">
      <div class="rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <div class="text-sm font-semibold text-gray-900">${escapeHtml(user.name || user.email || 'User')}</div>
              ${renderChip(roleDisplayName(primaryRole), normalizeRole(primaryRole))}
              ${renderChip(user.account_status || 'active', user.account_status === 'pending' ? 'shared' : 'admin')}
            </div>
            <div class="text-xs text-gray-500">${escapeHtml(user.email || '')}</div>
            ${user.account_status === 'pending' ? '<div class="mt-2 text-xs text-amber-700">Pending account. App access is blocked until approved.</div>' : ''}
          </div>
          <button type="button" data-toggle-disabled-rules class="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-50 ${disabledRuleCount ? '' : 'opacity-40 pointer-events-none'}">
            ${showDisabled ? 'Hide disabled' : `Show disabled (${disabledRuleCount})`}
          </button>
        </div>
      </div>

      <section class="space-y-2">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-400">Groups</div>
        <div class="flex flex-wrap gap-2">
          ${groups.length ? groups.map((group) => renderChip(group.name || group.id, 'neutral')).join('') : '<span class="text-xs text-gray-400">No group memberships</span>'}
        </div>
      </section>

      <section class="space-y-2">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-400">Role Permissions</div>
        <div class="flex flex-wrap gap-2">
          ${rolePermissions.length ? rolePermissions.map((permission) => renderChip(permission, 'admin')).join('') : '<span class="text-xs text-gray-400">No resolved permissions</span>'}
        </div>
      </section>

      ${families.map(([label, rules]) => `
        <section class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-gray-400">${escapeHtml(label)}</div>
            <div class="text-[11px] text-gray-500">${rules.filter((rule) => showDisabled || rule?.resource_enabled !== false).length} rule${rules.filter((rule) => showDisabled || rule?.resource_enabled !== false).length === 1 ? '' : 's'}</div>
          </div>
          ${renderRuleList(rules, { showDisabled })}
        </section>
      `).join('')}
    </div>
  `;
}

function renderAclInspectorModal(
  user,
  body = '<div class="text-sm text-gray-400">Loading ACL inspector...</div>',
  onClose = null,
) {
  return createAdminModalShell({
    preset: 'aclEditor',
    title: 'ACL Inspector',
    subtitle: `Read-only effective access for ${escapeHtml(user?.name || user?.email || 'user')}`,
    body,
    closeAttr: 'data-close-access-user',
    rootAttrs: 'id="user-access-modal"',
    onClose,
  });
}

function renderUserRows(users, stagedDraft = null) {
  const stagedUserId = String(stagedDraft?.userId || '').trim();
  const stagedKind = String(stagedDraft?.kind || '').trim();
  return users.map((u) => {
    const isStaged = stagedUserId && stagedUserId === u.id;
    const isPendingDelete = isStaged && stagedKind === 'delete';
    const isPendingEdit = isStaged && stagedKind === 'edit';
    const stagedPayload = isPendingEdit ? (stagedDraft?.payload || {}) : {};
    const role = String(stagedPayload.primary_role || u.primary_role || 'member').trim();
    const normalizedRole = normalizeRole(role);
    const accountStatus = String(stagedPayload.account_status || u.account_status || 'active');
    const name = String(stagedPayload.name || u.name || '');
    const email = String(stagedPayload.email || u.email || '');
    return `
    <tr data-user-row="${u.id}" class="bg-white text-xs hover:bg-gray-50/50 transition-colors ${isStaged ? 'opacity-60 bg-amber-50/40' : ''}">
      <td class="px-3 py-4 whitespace-nowrap">
        <button class="btn-change-role" data-user-id="${u.id}" data-user-role="${escapeHtml(role)}" data-user-name="${escapeHtml(name)}" data-user-email="${escapeHtml(email)}" data-user-account-status="${escapeHtml(accountStatus)}" ${isStaged ? 'disabled' : ''}>
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${roleBadgeClass(role)} uppercase">${escapeHtml(roleDisplayName(role))}</span>
        </button>
      </td>
      <td class="px-3 py-4 font-medium text-gray-900 overflow-hidden">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600 overflow-hidden shrink-0">
            ${u.avatar ? `<img class="w-full h-full object-cover" src="${u.avatar}" alt="">` : (name ? name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2) : '??')}
          </div>
          <div class="truncate">${name}</div>
        </div>
      </td>
      <td class="px-3 py-4 whitespace-nowrap">
        ${isPendingDelete
          ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 uppercase">Pending delete</span>'
          : `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${accountStatusBadgeClass(accountStatus)} uppercase">${accountStatusDisplayName(accountStatus)}</span>`
        }
      </td>
      <td class="px-3 py-4 text-gray-500 truncate" title="${email}">${email}</td>
      <td class="px-3 py-4 text-gray-400 font-normal uppercase text-[10px] whitespace-nowrap">${u.last_active_at ? timeSince(u.last_active_at * 1000) : 'N/A'}</td>
      <td class="px-3 py-4 text-gray-400 font-normal text-[10px] whitespace-nowrap">${u.created_at ? new Date(u.created_at * 1000).toLocaleDateString() : 'N/A'}</td>
      <td class="px-3 py-4 text-right whitespace-nowrap">
        <div class="flex justify-end items-center gap-1">
          <button class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors btn-inspect-user-access" data-user-id="${u.id}" data-user-name="${escapeHtml(name)}" data-user-email="${escapeHtml(email)}" data-user-role="${escapeHtml(role)}" data-user-account-status="${escapeHtml(accountStatus)}" title="Inspect ACL" ${isStaged ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
              <path fill-rule="evenodd" d="M10 1.75a4.25 4.25 0 0 0-4.25 4.25V8H5a2 2 0 0 0-2 2v5.5A2.5 2.5 0 0 0 5.5 18h9a2.5 2.5 0 0 0 2.5-2.5V10a2 2 0 0 0-2-2h-.75V6A4.25 4.25 0 0 0 10 1.75ZM7.25 6a2.75 2.75 0 1 1 5.5 0V8h-5.5V6Z" clip-rule="evenodd" />
            </svg>
          </button>
          <button class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors btn-edit-user" data-user-id="${u.id}" data-user-name="${escapeHtml(name)}" data-user-email="${escapeHtml(email)}" data-user-role="${escapeHtml(role)}" data-user-account-status="${escapeHtml(accountStatus)}" title="Edit User" ${isStaged ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
              <path d="m2.695 14.763-1.262 3.154a.5.5 0 0 0 .65.65l3.154-1.262a.5.5 0 0 0 .145-.11l10.19-10.192-2.877-2.878L2.805 14.618a.5.5 0 0 0-.11.145Z" />
              <path d="M15.53 3.47a.75.75 0 0 1 1.06 0l1.44 1.44a.75.75 0 0 1 0 1.06l-1.44 1.44-2.5-2.5 1.44-1.44Z" />
            </svg>
          </button>
          ${normalizedRole === 'admin' ? '' : `
          <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors btn-delete-user" data-user-id="${u.id}" data-user-name="${name}" title="Delete record" ${isStaged ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
              <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H5a2 2 0 0 0-2 2v.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V6a2 2 0 0 0-2-2h-1v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 4h4v-.25A1.25 1.25 0 0 0 10.75 2.5h-1.5A1.25 1.25 0 0 0 8 3.75V4ZM5 8.5V17a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8.5h-10Z" clip-rule="evenodd" />
            </svg>
          </button>
          `}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderLoadingRows(count = 10) {
  return Array.from({ length: count }, () => `
    <tr class="bg-white text-xs animate-pulse">
      <td class="px-3 py-4"><div class="h-5 w-14 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="flex items-center gap-2.5"><div class="w-7 h-7 rounded-full bg-gray-100"></div><div class="h-4 w-28 rounded bg-gray-100"></div></div></td>
      <td class="px-3 py-4"><div class="h-5 w-16 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="h-4 w-16 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="h-4 w-14 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="ml-auto h-8 w-20 rounded bg-gray-100"></div></td>
    </tr>
  `).join('');
}

function renderAddUserModal(draft = null, roles = []) {
  const primaryRole = String(draft?.primary_role || 'member').trim();
  const accountStatus = String(draft?.account_status || 'active');
  const csvValue = String(draft?.csv || '');
  return buildAdminModalShellMarkup({
    preset: 'userEditor',
    title: 'Add User',
    body: `
      <div class="space-y-4">
        <div class="flex items-center gap-5 border-b border-gray-100 -mx-5 px-5 -mt-1">
          <button type="button" data-add-user-tab="form" class="pb-3 text-base font-medium text-gray-900 border-b-2 border-gray-900">Form</button>
          <button type="button" data-add-user-tab="csv" class="pb-3 text-base font-medium text-gray-400 border-b-2 border-transparent">CSV Import</button>
        </div>
        <form id="add-user-form" class="space-y-3.5">
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">Role</span>
            <select name="primary_role" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
              ${buildRoleSelectOptions(roles, primaryRole)}
            </select>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">Account Status</span>
            <select name="account_status" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
              <option value="active" ${accountStatus === 'active' ? 'selected' : ''}>Active</option>
              <option value="pending" ${accountStatus === 'pending' ? 'selected' : ''}>Pending</option>
            </select>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">Name</span>
            <input name="name" type="text" value="${escapeHtml(draft?.name || '')}" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Full Name" required>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">Email</span>
            <input name="email" type="email" value="${escapeHtml(draft?.email || '')}" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Email" required>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">Password</span>
            <input name="password" type="password" value="${escapeHtml(draft?.password || '')}" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Password" minlength="8" required>
          </label>
          <div id="add-user-error" class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
        </form>
        <form id="add-user-csv-form" class="space-y-4 hidden">
          <label class="block">
            <span class="block text-sm text-gray-400 mb-2">CSV Content</span>
            <textarea name="csv" rows="7" required class="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 resize-none" placeholder="Name,Email,Password,Primary Role,Account Status&#10;Jane Doe,jane@example.com,Password123,member,active&#10;John Admin,john@example.com,Password123,admin,active&#10;Pending User,pending@example.com,Password123,member,pending">${escapeHtml(csvValue)}</textarea>
          </label>
          <div class="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            CSV order: <span class="font-medium text-gray-700">Name, Email, Password, Primary Role, Account Status (optional)</span>
          </div>
          <div id="add-user-csv-error" class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
          <div id="add-user-csv-result" class="hidden rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600 max-h-48 overflow-auto"></div>
        </form>
      </div>
    `,
    footer: `
      <div class="text-sm text-red-600"></div>
      <div class="flex items-center justify-end gap-2">
        <button type="button" data-close-add-user class="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="button" id="add-user-save-btn" class="px-4 py-2 rounded-xl text-sm font-semibold transition">
          Save
        </button>
      </div>
    `,
    closeAttr: 'data-close-add-user',
    rootAttrs: 'id="add-user-modal"',
  });
}

function renderEditUserModal(user, draft = null, roles = []) {
  const primaryRole = String(draft?.primary_role || user.primary_role || 'member').trim();
  const accountStatus = String(draft?.account_status || user.account_status || 'active');
  return buildAdminModalShellMarkup({
    preset: 'userEditor',
    title: 'Edit User',
    body: `
      <form id="edit-user-form" class="px-5 pb-5 space-y-3.5">
        <label class="block">
          <span class="block text-sm text-gray-400 mb-2">Role</span>
          <select name="primary_role" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
            ${buildRoleSelectOptions(roles, primaryRole)}
          </select>
        </label>
        <label class="block">
          <span class="block text-sm text-gray-400 mb-2">Account Status</span>
          <select name="account_status" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
            <option value="active" ${accountStatus !== 'pending' ? 'selected' : ''}>Active</option>
            <option value="pending" ${accountStatus === 'pending' ? 'selected' : ''}>Pending</option>
          </select>
        </label>
        <label class="block">
          <span class="block text-sm text-gray-400 mb-2">Name</span>
          <input name="name" type="text" value="${escapeHtml(draft?.name || user.name || '')}" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" required>
        </label>
        <label class="block">
          <span class="block text-sm text-gray-400 mb-2">Email</span>
          <input name="email" type="email" value="${escapeHtml(draft?.email || user.email || '')}" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" required>
        </label>
        <label class="block">
          <span class="block text-sm text-gray-400 mb-2">New Password</span>
          <input name="password" type="password" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" minlength="8" placeholder="Leave blank to keep current password">
        </label>
        <div id="edit-user-error" class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
      </form>
    `,
    footer: `
      <div class="text-sm text-red-600"></div>
      <div class="flex items-center justify-end gap-2">
        <button type="button" data-close-edit-user class="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="button" id="edit-user-save-btn" class="px-4 py-2 rounded-xl text-sm font-semibold transition">
          Save
        </button>
      </div>
    `,
    closeAttr: 'data-close-edit-user',
    rootAttrs: 'id="edit-user-modal"',
  });
}

export function renderUserOverview(container, data, actions) {
  const uiState = data.userOverviewUi || (data.userOverviewUi = {
    query: '',
    pending: {},
    accessInspector: {
      userId: null,
      refreshToken: null,
      payload: null,
      showDisabled: false,
      modalEl: null,
      bodyEl: null,
    },
  });
  const draftKey = 'overview';
  let activeModalIsDirty = null;
  let activeModalKind = null;
  let activeModalUserId = null;
  const draftRegistry = {
    get: () => getAdminDraft(data, 'users', draftKey),
    set: (value) => setAdminDraft(data, 'users', draftKey, value),
    clear: () => clearAdminDraft(data, 'users', draftKey),
  };

  const commitOverviewDraft = async () => {
    const draft = draftRegistry.get();
    if (!draft) return;

    const payload = draft.payload || {};
    const normalizedPayload = {
      primary_role: String(payload.primary_role || 'member'),
      account_status: String(payload.account_status || 'active'),
      name: String(payload.name || '').trim(),
      email: String(payload.email || '').trim(),
    };
    const password = String(payload.password || '');
    if (password) {
      normalizedPayload.password = password;
    }

    if (draft.kind === 'import-csv') {
      const csv = String(payload.csv || '').trim();
      const res = await apiFetch('/api/admin/users/import', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      });
      const responsePayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getActionError(responsePayload, `Failed to import users (${res.status})`));
      }
      actions.invalidateCache?.();
      await actions.reload?.({ preserveContent: true });
      draftRegistry.clear();
      data.requestUsersFooterSync?.();
      return;
    }

    if (draft.kind === 'delete') {
      const res = await apiFetch(`/api/admin/users/${draft.userId}`, { method: 'DELETE' });
      const responsePayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getActionError(responsePayload, `Failed to delete user (${res.status})`));
      }
      actions.removeUser(draft.userId);
      draftRegistry.clear();
      data.requestUsersFooterSync?.();
      return;
    }

    if (draft.kind === 'create') {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(normalizedPayload),
      });
      const responsePayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getActionError(responsePayload, `Failed to create user (${res.status})`));
      }
      actions.prependUser(responsePayload.user);
      draftRegistry.clear();
      data.requestUsersFooterSync?.();
      return;
    }

    if (draft.kind === 'edit') {
      const res = await apiFetch(`/api/admin/users/${draft.userId}`, {
        method: 'PUT',
        body: JSON.stringify(normalizedPayload),
      });
      const responsePayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getActionError(responsePayload, `Failed to update user (${res.status})`));
      }
      actions.updateUser(responsePayload.user);
      draftRegistry.clear();
      data.requestUsersFooterSync?.();
    }
  };

  const discardOverviewDraft = () => {
    draftRegistry.clear();
    updateView();
    data.requestUsersFooterSync?.();
  };

  const isOverviewDirty = () => Boolean(draftRegistry.get()) || Boolean(typeof activeModalIsDirty === 'function' && activeModalIsDirty());

  data.usersDirtyCheckers = data.usersDirtyCheckers || {};
  data.usersSaveHandlers = data.usersSaveHandlers || {};
  data.usersDiscardHandlers = data.usersDiscardHandlers || {};
  bindAdminDraftHandlers(data, 'users', draftKey, {
    isDirty: isOverviewDirty,
    save: commitOverviewDraft,
    discard: discardOverviewDraft,
    requestFooterSync: data.requestUsersFooterSync,
  });

  container.innerHTML = `
    <div class="flex flex-col h-full min-h-0 animate-in fade-in duration-300">
      <div class="pt-0.5 pb-2.5 flex justify-between items-center sticky top-0 z-10 bg-white">
        <div class="flex items-center text-xl font-medium px-0.5 gap-2">
          <div class="flex-shrink-0 text-gray-900">Users</div>
          <div class="text-gray-500 font-normal ml-0.5" id="users-total-count"></div>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30 w-64">
            <div class="flex-shrink-0 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search users" id="user-search-input">
            <div id="clear-search-container" class="hidden ml-1.5">
              <button id="clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <button id="open-add-user-modal" class="w-10 h-10 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center" title="Add User">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
          </button>
        </div>
      </div>
      <div class="relative flex-1 min-h-0 overflow-hidden w-full rounded-3xl border border-gray-100 bg-white">
        <div class="h-full overflow-auto">
          <div class="min-w-[1120px]">
            <table class="w-full text-sm text-left text-gray-500 table-fixed">
              <thead class="text-[11px] text-gray-900 font-bold uppercase bg-gray-50/50">
                <tr class="border-b border-gray-100">
                  <th scope="col" class="px-3 py-3 w-24">Role</th>
                  <th scope="col" class="px-3 py-3 w-1/4">Name</th>
                  <th scope="col" class="px-3 py-3 w-24">Status</th>
                  <th scope="col" class="px-3 py-3 w-1/3">Email</th>
                  <th scope="col" class="px-3 py-3 w-24">Last Active</th>
                  <th scope="col" class="px-3 py-3 w-28">Created At</th>
                  <th scope="col" class="px-3 py-3 w-24 text-right"></th>
                </tr>
              </thead>
              <tbody id="users-table-body" class="divide-y divide-gray-50/50"></tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between gap-4 py-4 px-0.5 text-sm text-gray-500">
        <div class="flex items-center gap-3">
          <span>Show</span>
          <select id="users-page-size" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span>per page</span>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-xs text-gray-400" id="users-page-range"></div>
          <div class="flex items-center gap-2">
            <button id="users-page-prev" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">Prev</button>
            <div class="text-sm text-gray-600" id="users-page-label"></div>
            <button id="users-page-next" class="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>
      <div class="text-gray-400 text-[11px] flex items-center justify-end gap-1.5 px-0.5">
        <span>ⓘ</span>
        <span>Admins are listed first, then all users are sorted alphabetically.</span>
      </div>
    </div>
  `;

  const searchInput = container.querySelector('#user-search-input');
  const clearSearchBtn = container.querySelector('#clear-search-btn');
  const clearSearchContainer = container.querySelector('#clear-search-container');
  const tbody = container.querySelector('#users-table-body');
  const totalCount = container.querySelector('#users-total-count');
  const pageRange = container.querySelector('#users-page-range');
  const pageLabel = container.querySelector('#users-page-label');
  const prevButton = container.querySelector('#users-page-prev');
  const nextButton = container.querySelector('#users-page-next');
  const pageSizeSelect = container.querySelector('#users-page-size');

  function getPendingKey(type, userId) {
    return `${type}:${userId}`;
  }

  function setPending(type, userId, value) {
    uiState.pending[getPendingKey(type, userId)] = value;
    syncPendingState();
  }

  async function refreshAccessInspector(userId) {
    if (!userId) return;
    const modal = uiState.accessInspector.modalEl;
    const body = uiState.accessInspector.bodyEl;
    if (!modal || !body) return;
    const currentToken = String(Date.now());
    uiState.accessInspector.userId = userId;
    uiState.accessInspector.refreshToken = currentToken;
    body.innerHTML = '<div class="text-sm text-gray-400">Refreshing ACL inspector...</div>';
    try {
      const payload = await fetchAdminUserAccess(userId);
      if (uiState.accessInspector.refreshToken !== currentToken) return;
      uiState.accessInspector.payload = payload;
      body.innerHTML = renderAccessInspectorContent(payload, uiState.accessInspector.showDisabled);
    } catch (err) {
      if (uiState.accessInspector.refreshToken !== currentToken) return;
      body.innerHTML = `
        <div class="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          ${escapeHtml(err.message || 'Failed to inspect user access')}
        </div>
      `;
    } finally {
      if (uiState.accessInspector.refreshToken === currentToken) {
        uiState.accessInspector.refreshToken = null;
      }
    }
  }

  function isPending(type, userId) {
    return Boolean(uiState.pending[getPendingKey(type, userId)]);
  }

  function applySearchFilter() {
    const query = String(uiState.query || '').toLowerCase();
    tbody.querySelectorAll('tr').forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }

  function syncSearchClearState() {
    if (!clearSearchContainer) return;
    if (String(uiState.query || '').trim()) {
      clearSearchContainer.classList.remove('hidden');
    } else {
      clearSearchContainer.classList.add('hidden');
    }
  }

  function syncPendingState() {
    tbody.querySelectorAll('.btn-change-role').forEach((btn) => {
      btn.disabled = isPending('role', btn.dataset.userId);
      btn.classList.toggle('opacity-50', btn.disabled);
      btn.classList.toggle('pointer-events-none', btn.disabled);
    });
    tbody.querySelectorAll('.btn-inspect-user-access').forEach((btn) => {
      btn.disabled = isPending('access', btn.dataset.userId);
      btn.classList.toggle('opacity-50', btn.disabled);
      btn.classList.toggle('pointer-events-none', btn.disabled);
    });
    tbody.querySelectorAll('.btn-edit-user').forEach((btn) => {
      btn.disabled = isPending('edit', btn.dataset.userId);
      btn.classList.toggle('opacity-50', btn.disabled);
      btn.classList.toggle('pointer-events-none', btn.disabled);
    });
    tbody.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.disabled = isPending('delete', btn.dataset.userId);
      btn.classList.toggle('opacity-50', btn.disabled);
      btn.classList.toggle('pointer-events-none', btn.disabled);
    });
  }

  function bindRowActions() {
    tbody.querySelectorAll('.btn-change-role').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const currentRole = normalizeRole(btn.dataset.userRole || 'member');
        const userName = btn.dataset.userName;
        const userEmail = btn.dataset.userEmail || '';
        const userStatus = btn.dataset.userAccountStatus || 'active';
        const nextRole = currentRole === 'admin' ? 'member' : 'admin';
        if (!window.confirm(`Change role for ${userName} to ${nextRole.toUpperCase()}?`)) return;
        draftRegistry.set({
          kind: 'edit',
          userId: btn.dataset.userId,
          payload: {
            primary_role: nextRole,
            account_status: userStatus,
            name: userName,
            email: userEmail,
          },
        });
        updateView();
        data.requestUsersFooterSync?.();
      });
    });

    tbody.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userName = btn.dataset.userName;
        if (!window.confirm(`Delete user ${userName}? This will permanently remove the account record.`)) return;
        draftRegistry.set({
          kind: 'delete',
          userId: btn.dataset.userId,
          payload: {
            name: userName,
          },
        });
        updateView();
        data.requestUsersFooterSync?.();
      });
    });

    tbody.querySelectorAll('.btn-inspect-user-access').forEach((btn) => {
      btn.addEventListener('click', async () => {
        setPending('access', btn.dataset.userId, true);
        uiState.accessInspector.userId = btn.dataset.userId;
        uiState.accessInspector.refreshToken = null;
        uiState.accessInspector.payload = null;
        uiState.accessInspector.showDisabled = false;
        const shell = renderAclInspectorModal({
          name: btn.dataset.userName || '',
          email: btn.dataset.userEmail || '',
          primary_role: String(btn.dataset.userRole || 'member').trim(),
          account_status: btn.dataset.userAccountStatus || 'active',
        }, '<div class="text-sm text-gray-400">Loading ACL inspector...</div>', () => {
          uiState.accessInspector.userId = null;
          uiState.accessInspector.refreshToken = null;
          uiState.accessInspector.payload = null;
          uiState.accessInspector.modalEl = null;
          uiState.accessInspector.bodyEl = null;
        });
        uiState.accessInspector.modalEl = shell.modal;
        uiState.accessInspector.bodyEl = shell.bodyEl;
        shell.modal.classList.add('user-access-modal-shell');

        shell.modal?.addEventListener('click', (e) => {
          if (e.target.closest('[data-toggle-disabled-rules]')) {
            uiState.accessInspector.showDisabled = !uiState.accessInspector.showDisabled;
            if (uiState.accessInspector.payload && uiState.accessInspector.bodyEl) {
              uiState.accessInspector.bodyEl.innerHTML = renderAccessInspectorContent(uiState.accessInspector.payload, uiState.accessInspector.showDisabled);
            }
          }
        });

        try {
          await refreshAccessInspector(btn.dataset.userId);
        } catch (err) {
          if (uiState.accessInspector.bodyEl) {
            uiState.accessInspector.bodyEl.innerHTML = `
              <div class="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                ${escapeHtml(err.message || 'Failed to inspect user access')}
              </div>
            `;
          }
        } finally {
          setPending('access', btn.dataset.userId, false);
        }
      });
    });

    tbody.querySelectorAll('.btn-edit-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const roles = await loadAdminRoles();
          const user = {
            id: btn.dataset.userId,
            name: btn.dataset.userName || '',
            email: btn.dataset.userEmail || '',
            primary_role: String(btn.dataset.userRole || 'member').trim(),
            account_status: btn.dataset.userAccountStatus || 'active',
          };
          const stagedDraft = draftRegistry.get();
          const initialDraft = stagedDraft?.kind === 'edit' && stagedDraft.userId === user.id ? stagedDraft.payload : null;
          document.body.insertAdjacentHTML('beforeend', renderEditUserModal(user, initialDraft, roles));

          const modal = document.getElementById('edit-user-modal');
          const form = document.getElementById('edit-user-form');
          const saveBtn = modal?.querySelector('#edit-user-save-btn');
          const fields = {
            primaryRole: form?.querySelector('[name="primary_role"]'),
            accountStatus: form?.querySelector('[name="account_status"]'),
            name: form?.querySelector('[name="name"]'),
            email: form?.querySelector('[name="email"]'),
            password: form?.querySelector('[name="password"]'),
          };
          const modalState = {
            dirty: false,
          };
          const baseValues = {
            primary_role: normalizeRole(initialDraft?.primary_role || user.primary_role || 'member'),
            account_status: String(initialDraft?.account_status || user.account_status || 'active'),
            name: String(initialDraft?.name || user.name || '').trim(),
            email: String(initialDraft?.email || user.email || '').trim(),
            password: String(initialDraft?.password || ''),
          };

          const close = () => {
            activeModalIsDirty = null;
            activeModalKind = null;
            activeModalUserId = null;
            data.requestUsersFooterSync?.();
            modal?.remove();
          };

          const isDirty = () => (
            normalizeRole(fields.primaryRole?.value || 'member') !== baseValues.primary_role
            || String(fields.accountStatus?.value || 'active') !== baseValues.account_status
            || String(fields.name?.value || '').trim() !== baseValues.name
            || String(fields.email?.value || '').trim() !== baseValues.email
            || String(fields.password?.value || '').trim() !== ''
          );

          const syncDirty = () => {
            modalState.dirty = isDirty();
            activeModalIsDirty = isDirty;
            activeModalKind = 'edit';
            activeModalUserId = user.id;
            setModalSaveButtonState(saveBtn, { enabled: modalState.dirty, saving: false });
            data.requestUsersFooterSync?.();
          };

          const saveEdit = async () => {
            displayFieldErrors(form);
            if (typeof form?.reportValidity === 'function' && !form.reportValidity()) return;
            const fd = new FormData(form);
            const payload = {
              primary_role: String(fd.get('primary_role') || 'member').trim(),
              account_status: String(fd.get('account_status') || 'active'),
              name: String(fd.get('name') || '').trim(),
              email: String(fd.get('email') || '').trim(),
            };
            const password = String(fd.get('password') || '');
            if (password) payload.password = password;
            draftRegistry.set({
              kind: 'edit',
              userId: user.id,
              payload,
            });
            clearFormErrors(form);
            updateView();
            data.requestUsersFooterSync?.();
            close();
          };

          modal?.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('[data-close-edit-user]')) {
              close();
            }
          });
          saveBtn?.addEventListener('click', () => {
            saveEdit();
          });

          form?.querySelectorAll('input, select, textarea').forEach((el) => {
            el.addEventListener('input', syncDirty);
            el.addEventListener('change', syncDirty);
          });

          form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            saveEdit();
          });

          syncDirty();
        } catch (err) {
          window.alert(err.message);
        }
      });
    });
  }

  if (!uiState.accessInspectorListenersBound) {
    if (typeof window.__growchatAccessInspectorCleanup === 'function') {
      window.__growchatAccessInspectorCleanup();
    }
    uiState.accessInspectorListenersBound = true;
    const handleAccessInvalidation = () => {
      if (uiState.accessInspector?.userId && uiState.accessInspector.modalEl) {
        refreshAccessInspector(uiState.accessInspector.userId);
      }
    };
    window.addEventListener('growchat:models-invalidated', handleAccessInvalidation);
    window.addEventListener('growchat:connections-invalidated', handleAccessInvalidation);
    window.addEventListener('growchat:tool-servers-invalidated', handleAccessInvalidation);
    uiState.accessInspectorCleanup = () => {
      window.removeEventListener('growchat:models-invalidated', handleAccessInvalidation);
      window.removeEventListener('growchat:connections-invalidated', handleAccessInvalidation);
      window.removeEventListener('growchat:tool-servers-invalidated', handleAccessInvalidation);
      uiState.accessInspectorListenersBound = false;
    };
    window.__growchatAccessInspectorCleanup = uiState.accessInspectorCleanup;
  }

  function updateView() {
    const users = data.users || [];
    const total = data.total || users.length;
    const page = data.pagination?.page || 1;
    const pageSize = data.pagination?.pageSize || 20;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pageStart = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
    const pageEnd = Math.min(page * pageSize, total);

    totalCount.textContent = String(total);
    const isTableLoading = data.loading && (data.loadingMode === 'table' || data.loadingMode === 'initial');

    tbody.innerHTML = isTableLoading
      ? renderLoadingRows(Math.min(pageSize, 10))
      : renderUserRows(users, draftRegistry.get());
    pageRange.textContent = `${pageStart}-${pageEnd} of ${total}`;
    pageLabel.textContent = `Page ${page} / ${totalPages}`;
    prevButton.disabled = data.loading || page <= 1;
    nextButton.disabled = data.loading || page >= totalPages;
    pageSizeSelect.disabled = data.loading;
    pageSizeSelect.value = String(pageSize);
    searchInput.value = uiState.query;
    if (!isTableLoading) {
      bindRowActions();
      applySearchFilter();
      syncPendingState();
    }
  }

  searchInput?.addEventListener('input', (e) => {
    uiState.query = String(e.target.value || '');
    syncSearchClearState();
    applySearchFilter();
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (!searchInput) return;
    uiState.query = '';
    searchInput.value = '';
    syncSearchClearState();
    searchInput.focus();
    applySearchFilter();
  });

  pageSizeSelect?.addEventListener('change', async (e) => {
    data.pagination.pageSize = parseInt(e.target.value, 10);
    data.pagination.page = 1;
    await actions.reload({ preserveContent: true });
  });

  prevButton?.addEventListener('click', async () => {
    if (data.pagination.page <= 1) return;
    data.pagination.page -= 1;
    await actions.reload({ preserveContent: true });
  });

  nextButton?.addEventListener('click', async () => {
    const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.pagination?.pageSize || 20)));
    if (data.pagination.page >= totalPages) return;
    data.pagination.page += 1;
    await actions.reload({ preserveContent: true });
  });

  container.querySelector('#open-add-user-modal')?.addEventListener('click', async () => {
    const roles = await loadAdminRoles();
    const stagedDraft = draftRegistry.get();
    const initialDraft = stagedDraft?.kind === 'create' || stagedDraft?.kind === 'import-csv'
      ? stagedDraft.payload
      : null;
    document.body.insertAdjacentHTML('beforeend', renderAddUserModal({
      primary_role: initialDraft?.primary_role || 'member',
      account_status: initialDraft?.account_status || 'active',
      name: initialDraft?.name || '',
      email: initialDraft?.email || '',
      password: initialDraft?.password || '',
      csv: initialDraft?.csv || '',
      tab: stagedDraft?.tab || (stagedDraft?.kind === 'import-csv' ? 'csv' : 'form'),
    }, roles));
    const modal = document.getElementById('add-user-modal');
    const form = document.getElementById('add-user-form');
    const csvForm = document.getElementById('add-user-csv-form');
    const formTab = modal?.querySelector('[data-add-user-tab="form"]');
    const csvTab = modal?.querySelector('[data-add-user-tab="csv"]');
    const saveBtn = modal?.querySelector('#add-user-save-btn');
    const fields = {
      primaryRole: form?.querySelector('[name="primary_role"]'),
      accountStatus: form?.querySelector('[name="account_status"]'),
      name: form?.querySelector('[name="name"]'),
      email: form?.querySelector('[name="email"]'),
      password: form?.querySelector('[name="password"]'),
      csv: csvForm?.querySelector('[name="csv"]'),
    };
    const modalState = {
      activeTab: stagedDraft?.tab || (stagedDraft?.kind === 'import-csv' ? 'csv' : 'form'),
      dirty: false,
    };
    const baseValues = {
      primary_role: String(initialDraft?.primary_role || 'member'),
      account_status: String(initialDraft?.account_status || 'active'),
      name: String(initialDraft?.name || '').trim(),
      email: String(initialDraft?.email || '').trim(),
      password: String(initialDraft?.password || ''),
      csv: String(initialDraft?.csv || '').trim(),
    };

    const isDirty = () => (
      String(fields.primaryRole?.value || 'member') !== baseValues.primary_role
      || String(fields.accountStatus?.value || 'active') !== baseValues.account_status
      || String(fields.name?.value || '').trim() !== baseValues.name
      || String(fields.email?.value || '').trim() !== baseValues.email
      || String(fields.password?.value || '').trim() !== baseValues.password
      || String(fields.csv?.value || '').trim() !== baseValues.csv
    );

    const syncDirty = () => {
      modalState.dirty = isDirty();
      activeModalIsDirty = isDirty;
      activeModalKind = modalState.activeTab === 'csv' ? 'import-csv' : 'create';
      activeModalUserId = null;
      setModalSaveButtonState(saveBtn, { enabled: modalState.dirty, saving: false });
      data.requestUsersFooterSync?.();
    };

    const close = () => {
      activeModalIsDirty = null;
      activeModalKind = null;
      activeModalUserId = null;
      modal?.remove();
      data.requestUsersFooterSync?.();
    };

    const setTab = (tab) => {
      const isForm = tab === 'form';
      modalState.activeTab = tab;
      form?.classList.toggle('hidden', !isForm);
      csvForm?.classList.toggle('hidden', isForm);
      formTab?.classList.toggle('text-gray-900', isForm);
      formTab?.classList.toggle('border-gray-900', isForm);
      formTab?.classList.toggle('text-gray-400', !isForm);
      formTab?.classList.toggle('border-transparent', !isForm);
      csvTab?.classList.toggle('text-gray-900', !isForm);
      csvTab?.classList.toggle('border-gray-900', !isForm);
      csvTab?.classList.toggle('text-gray-400', isForm);
      csvTab?.classList.toggle('border-transparent', isForm);
      syncDirty();
    };

    formTab?.addEventListener('click', () => setTab('form'));
    csvTab?.addEventListener('click', () => setTab('csv'));

    modal?.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close-add-user]')) {
        close();
      }
    });

    const saveCurrent = () => {
      if (modalState.activeTab === 'csv') {
        if (typeof csvForm?.reportValidity === 'function' && !csvForm.reportValidity()) return;
        const fd = new FormData(csvForm);
        const csv = String(fd.get('csv') || '').trim();
        draftRegistry.set({
          kind: 'import-csv',
          tab: 'csv',
          payload: { csv },
        });
      } else {
        if (typeof form?.reportValidity === 'function' && !form.reportValidity()) return;
        const fd = new FormData(form);
        draftRegistry.set({
          kind: 'create',
          tab: 'form',
          payload: {
            primary_role: String(fd.get('primary_role') || 'member').trim(),
            account_status: String(fd.get('account_status') || 'active'),
            name: String(fd.get('name') || '').trim(),
            email: String(fd.get('email') || '').trim(),
            password: String(fd.get('password') || ''),
          },
        });
      }
      data.requestUsersFooterSync?.();
      close();
    };

    saveBtn?.addEventListener('click', () => {
      saveCurrent();
    });

    form?.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('input', syncDirty);
      el.addEventListener('change', syncDirty);
    });
    csvForm?.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('input', syncDirty);
      el.addEventListener('change', syncDirty);
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveCurrent();
    });

    csvForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveCurrent();
    });

    setTab(modalState.activeTab);
  });

  updateView();
  syncSearchClearState();
}
