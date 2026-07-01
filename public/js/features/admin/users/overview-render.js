/**
 * HTML rendering functions for the admin users overview.
 */
import { buildAdminModalShellMarkup, createAdminModalShell } from '../modal-shell.js';
import { renderButton } from '../../../shared/components/button.js';
import {
  escapeHtml,
  roleBadgeClass,
  roleDisplayName,
  normalizeRole,
  buildRoleSelectOptions,
  accountStatusBadgeClass,
  accountStatusDisplayName,
  timeSince,
  renderChip,
  renderRuleList,
} from './overview-helpers.js';

export function renderAccessInspectorContent(payload, showDisabled = false) {
  const user = payload?.user || {};
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  const rolePermissions = Array.isArray(payload?.role_permissions) ? payload.role_permissions : [];
  const access = payload?.access || {};
  const allRules = [
    ...(access.models || []),
    ...(access.connections || []),
    ...(access.mcp_servers || []),
  ];
  const disabledRuleCount = allRules.filter((rule) => rule?.resource_enabled === false).length;
  const primaryRole = String(user.primary_role || 'member').trim();
  const families = [
    ['Models', access.models || []],
    ['Connections', access.connections || []],
    ['MCP Servers', access.mcp_servers || []],
  ];

  return `
    <div class="space-y-4">
      <div class="rounded-lg border border-gray-100 bg-gray-50/70 px-4 py-3">
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
          ${renderButton({
            label: showDisabled ? 'Hide disabled' : `Show disabled (${disabledRuleCount})`,
            variant: 'secondary',
            className: `px-2.5 py-1 text-label-sm uppercase tracking-wider ${disabledRuleCount ? '' : 'opacity-40 pointer-events-none'}`,
            dataAttrs: { 'toggle-disabled-rules': '' },
          })}
        </div>
      </div>

      <section class="space-y-2">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-600">Groups</div>
        <div class="flex flex-wrap gap-2">
          ${groups.length ? groups.map((group) => renderChip(group.name || group.id, 'neutral')).join('') : '<span class="text-xs text-gray-600">No group memberships</span>'}
        </div>
      </section>

      <section class="space-y-2">
        <div class="text-xs font-semibold uppercase tracking-wider text-gray-600">Role Permissions</div>
        <div class="flex flex-wrap gap-2">
          ${rolePermissions.length ? rolePermissions.map((permission) => renderChip(permission, 'admin')).join('') : '<span class="text-xs text-gray-600">No resolved permissions</span>'}
        </div>
      </section>

      ${families
        .map(
          ([label, rules]) => `
        <section class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="text-xs font-semibold uppercase tracking-wider text-gray-600">${escapeHtml(label)}</div>
            <div class="text-label-sm text-gray-500">${rules.filter((rule) => showDisabled || rule?.resource_enabled !== false).length} rule${rules.filter((rule) => showDisabled || rule?.resource_enabled !== false).length === 1 ? '' : 's'}</div>
          </div>
          ${renderRuleList(rules, { showDisabled })}
        </section>
      `
        )
        .join('')}
    </div>
  `;
}

export function renderAclInspectorModal(
  user,
  body = '<div class="text-sm text-gray-600">Loading ACL inspector...</div>',
  onClose = null
) {
  return createAdminModalShell({
    preset: 'aclEditor',
    title: 'ACL Inspector',
    subtitle: `Read-only effective access for ${escapeHtml(user?.name || user?.email || 'user')}`,
    body,
    closeAttr: 'data-close-access-user',
    rootAttrs: 'id="user-access-modal"',
    modalHash: 'user-access-modal',
    onClose,
  });
}

export function renderUserRows(users) {
  return users
    .map((u) => {
      const role = String(u.primary_role || 'member').trim();
      const normalizedRole = normalizeRole(role);
      const accountStatus = String(u.account_status || 'active');
      const name = String(u.name || '');
      const email = String(u.email || '');
      return `
    <tr data-user-row="${u.id}" class="bg-white text-xs hover:bg-gray-50/50 transition-colors">
      <td class="px-3 py-4 whitespace-nowrap">
        <button class="btn-change-role focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 rounded transition" data-user-id="${u.id}" data-user-role="${escapeHtml(role)}" data-user-name="${escapeHtml(name)}" data-user-email="${escapeHtml(email)}" data-user-account-status="${escapeHtml(accountStatus)}">
          <span class="px-2 py-0.5 rounded-md text-label-sm font-bold ${roleBadgeClass(role)} uppercase">${escapeHtml(roleDisplayName(role))}</span>
        </button>
      </td>
      <td class="px-3 py-4 font-medium text-gray-900 overflow-hidden">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-label-sm font-bold text-gray-600 overflow-hidden shrink-0">
            ${
              u.avatar
                ? `<img class="w-full h-full object-cover" src="${escapeHtml(u.avatar)}" alt="">`
                : name
                  ? name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .substring(0, 2)
                  : '??'
            }
          </div>
          <div class="truncate">${escapeHtml(name)}</div>
        </div>
      </td>
      <td class="px-3 py-4 whitespace-nowrap">
        <span class="px-2 py-0.5 rounded-md text-label-sm font-bold ${accountStatusBadgeClass(accountStatus)} uppercase">${accountStatusDisplayName(accountStatus)}</span>
      </td>
      <td class="px-3 py-4 text-gray-500 truncate" title="${escapeHtml(email)}">${escapeHtml(email)}</td>
      <td class="px-3 py-4 text-gray-600 font-normal uppercase text-label-sm whitespace-nowrap">${u.last_active_at ? timeSince(u.last_active_at * 1000) : 'N/A'}</td>
      <td class="px-3 py-4 text-gray-600 font-normal text-label-sm whitespace-nowrap">${u.created_at ? new Date(u.created_at * 1000).toLocaleDateString() : 'N/A'}</td>
      <td class="px-3 py-4 text-right whitespace-nowrap">
        <div class="flex justify-end items-center gap-1">
          <button class="p-1.5 text-gray-600 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 btn-inspect-user-access" data-user-id="${u.id}" data-user-name="${escapeHtml(name)}" data-user-email="${escapeHtml(email)}" data-user-role="${escapeHtml(role)}" data-user-account-status="${escapeHtml(accountStatus)}" title="Inspect ACL">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
              <path fill-rule="evenodd" d="M10 1.75a4.25 4.25 0 0 0-4.25 4.25V8H5a2 2 0 0 0-2 2v5.5A2.5 2.5 0 0 0 5.5 18h9a2.5 2.5 0 0 0 2.5-2.5V10a2 2 0 0 0-2-2h-.75V6A4.25 4.25 0 0 0 10 1.75ZM7.25 6a2.75 2.75 0 1 1 5.5 0V8h-5.5V6Z" clip-rule="evenodd" />
            </svg>
          </button>
          <button class="p-1.5 text-gray-600 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 btn-edit-user" data-user-id="${u.id}" data-user-name="${escapeHtml(name)}" data-user-email="${escapeHtml(email)}" data-user-role="${escapeHtml(role)}" data-user-account-status="${escapeHtml(accountStatus)}" title="Edit User">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
              <path d="m2.695 14.763-1.262 3.154a.5.5 0 0 0 .65.65l3.154-1.262a.5.5 0 0 0 .145-.11l10.19-10.192-2.877-2.878L2.805 14.618a.5.5 0 0 0-.11.145Z" />
              <path d="M15.53 3.47a.75.75 0 0 1 1.06 0l1.44 1.44a.75.75 0 0 1 0 1.06l-1.44 1.44-2.5-2.5 1.44-1.44Z" />
            </svg>
          </button>
          ${
            normalizedRole === 'admin'
              ? ''
              : `
          <button class="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 btn-delete-user" data-user-id="${u.id}" data-user-name="${escapeHtml(name)}" title="Delete record">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
              <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H5a2 2 0 0 0-2 2v.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V6a2 2 0 0 0-2-2h-1v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 4h4v-.25A1.25 1.25 0 0 0 10.75 2.5h-1.5A1.25 1.25 0 0 0 8 3.75V4ZM5 8.5V17a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8.5h-10Z" clip-rule="evenodd" />
            </svg>
          </button>
          `
          }
        </div>
      </td>
    </tr>`;
    })
    .join('');
}

export function renderLoadingRows(count = 10) {
  return Array.from(
    { length: count },
    () => `
    <tr class="bg-white text-xs animate-pulse">
      <td class="px-3 py-4"><div class="h-5 w-14 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="flex items-center gap-2.5"><div class="w-7 h-7 rounded-full bg-gray-100"></div><div class="h-4 w-28 rounded bg-gray-100"></div></div></td>
      <td class="px-3 py-4"><div class="h-5 w-16 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="h-4 w-16 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="h-4 w-14 rounded bg-gray-100"></div></td>
      <td class="px-3 py-4"><div class="ml-auto h-8 w-20 rounded bg-gray-100"></div></td>
    </tr>
  `
  ).join('');
}

export function renderAddUserModal(draft = null, roles = []) {
  const primaryRole = String(draft?.primary_role || 'member').trim();
  const accountStatus = String(draft?.account_status || 'active');
  const csvValue = String(draft?.csv || '');
  return buildAdminModalShellMarkup({
    preset: 'userEditor',
    title: 'Add User',
    body: `
      <div class="space-y-4">
        <div class="flex items-center gap-5 border-b border-gray-100 -mx-5 px-5 -mt-1">
          <button type="button" data-add-user-tab="form" aria-pressed="true" class="pb-3 text-base font-medium text-gray-900 border-b-2 border-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 rounded transition">Form</button>
          <button type="button" data-add-user-tab="csv" aria-pressed="false" class="pb-3 text-base font-medium text-gray-600 border-b-2 border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 rounded transition">CSV Import</button>
        </div>
        <form id="add-user-form" class="space-y-4">
          <label class="block">
            <span class="block text-sm text-gray-600 mb-2">Role</span>
            <select name="primary_role" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
              ${buildRoleSelectOptions(roles, primaryRole)}
            </select>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-600 mb-2">Account Status</span>
            <select name="account_status" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
              <option value="active" ${accountStatus === 'active' ? 'selected' : ''}>Active</option>
              <option value="pending" ${accountStatus === 'pending' ? 'selected' : ''}>Pending</option>
            </select>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-600 mb-2">Name</span>
            <input name="name" type="text" value="${escapeHtml(draft?.name || '')}" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Full Name" required>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-600 mb-2">Email</span>
            <input name="email" type="email" value="${escapeHtml(draft?.email || '')}" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Email" required>
          </label>
          <label class="block">
            <span class="block text-sm text-gray-600 mb-2">Password</span>
            <input name="password" type="password" value="${escapeHtml(draft?.password || '')}" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" placeholder="Enter Your Password" minlength="8" required>
          </label>
          <div id="add-user-error" class="hidden rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
        </form>
        <form id="add-user-csv-form" class="space-y-4 hidden">
          <label class="block">
            <span class="block text-sm text-gray-600 mb-2">CSV Content</span>
            <textarea name="csv" rows="7" required class="w-full rounded-md border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 resize-none" placeholder="Name,Email,Password,Primary Role,Account Status&#10;Jane Doe,jane@example.com,Password123,member,active&#10;John Admin,john@example.com,Password123,admin,active&#10;Pending User,pending@example.com,Password123,member,pending">${escapeHtml(csvValue)}</textarea>
          </label>
          <div class="rounded-md border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            CSV order: <span class="font-medium text-gray-700">Name, Email, Password, Primary Role, Account Status (optional)</span>
          </div>
          <div id="add-user-csv-error" class="hidden rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
          <div id="add-user-csv-result" class="hidden rounded-md border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600 max-h-48 overflow-auto"></div>
        </form>
      </div>
    `,
    footer: `
      <div class="text-sm text-red-600"></div>
      <div class="flex items-center justify-end gap-2">
        <button type="button" data-close-add-user class="px-4 py-2 rounded-md border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 active:scale-95 transition">
          Cancel
        </button>
        <button type="button" id="add-user-save-btn" class="px-4 py-2 rounded-md text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 active:scale-95">
          Save
        </button>
      </div>
    `,
    closeAttr: 'data-close-add-user',
    rootAttrs: 'id="add-user-modal"',
    modalHash: 'add-user-modal',
  });
}

export function renderEditUserModal(user, draft = null, roles = []) {
  const primaryRole = String(draft?.primary_role || user.primary_role || 'member').trim();
  const accountStatus = String(draft?.account_status || user.account_status || 'active');
  return buildAdminModalShellMarkup({
    preset: 'userEditor',
    title: 'Edit User',
    body: `
      <form id="edit-user-form" class="px-5 pb-5 space-y-4">
        <label class="block">
          <span class="block text-sm text-gray-600 mb-2">Role</span>
          <select name="primary_role" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
            ${buildRoleSelectOptions(roles, primaryRole)}
          </select>
        </label>
        <label class="block">
          <span class="block text-sm text-gray-600 mb-2">Account Status</span>
          <select name="account_status" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300 bg-white">
            <option value="active" ${accountStatus !== 'pending' ? 'selected' : ''}>Active</option>
            <option value="pending" ${accountStatus === 'pending' ? 'selected' : ''}>Pending</option>
          </select>
        </label>
        <label class="block">
          <span class="block text-sm text-gray-600 mb-2">Name</span>
          <input name="name" type="text" value="${escapeHtml(draft?.name || user.name || '')}" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" required>
        </label>
        <label class="block">
          <span class="block text-sm text-gray-600 mb-2">Email</span>
          <input name="email" type="email" value="${escapeHtml(draft?.email || user.email || '')}" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" required>
        </label>
        <label class="block">
          <span class="block text-sm text-gray-600 mb-2">New Password</span>
          <input name="password" type="password" class="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-gray-300" minlength="8" placeholder="Leave blank to keep current password">
        </label>
        <div id="edit-user-error" class="hidden rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
      </form>
    `,
    footer: `
      <div class="text-sm text-red-600"></div>
      <div class="flex items-center justify-end gap-2">
        <button type="button" data-close-edit-user class="px-4 py-2 rounded-md border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 active:scale-95 transition">
          Cancel
        </button>
        <button type="button" id="edit-user-save-btn" class="px-4 py-2 rounded-md text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 active:scale-95">
          Save
        </button>
      </div>
    `,
    closeAttr: 'data-close-edit-user',
    rootAttrs: 'id="edit-user-modal"',
    modalHash: 'edit-user-modal',
  });
}
