const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function roleBadgeClass(role) {
  if (role === 'admin') return 'bg-blue-100 text-blue-700';
  if (role === 'member') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-700';
}

export function roleDisplayName(role) {
  return role === 'admin' ? 'Admin' : 'Member';
}

export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return value === 'admin' ? 'admin' : 'member';
}

function accountStatusBadgeClass(status) {
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

export function renderAccessInspectorContent(payload, showDisabled = false) {
  const user = payload?.user || {};
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  const rolePermissions = Array.isArray(payload?.role_permissions) ? payload.role_permissions : [];
  const access = payload?.access || {};
  const allRules = [...(access.models || []), ...(access.connections || []), ...(access.mcp_servers || [])];
  const disabledRuleCount = allRules.filter((rule) => rule?.resource_enabled === false).length;
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
              ${renderChip(roleDisplayName(normalizeRole(user.primary_role)), normalizeRole(user.primary_role))}
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

export function renderAclInspectorModal(user, body = '<div class="text-sm text-gray-400">Loading ACL inspector...</div>') {
  return `
    <div id="user-access-modal" class="fixed inset-0 z-[140] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="w-full max-w-2xl max-h-[85vh] rounded-[1.5rem] bg-white shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
        <div class="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-50">
          <div>
            <h3 class="text-xl font-semibold text-gray-900">ACL Inspector</h3>
            <p class="mt-1 text-xs text-gray-500">Read-only effective access for ${escapeHtml(user?.name || user?.email || 'user')}</p>
          </div>
          <button type="button" data-close-access-user class="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="px-5 py-5 overflow-auto" id="user-access-modal-body">
          ${body}
        </div>
      </div>
    </div>
  `;
}

export function renderUserRows(users, stagedDraft = null) {
  const stagedUserId = String(stagedDraft?.userId || '').trim();
  const stagedKind = String(stagedDraft?.kind || '').trim();
  return users.map((u) => {
    const isStaged = stagedUserId && stagedUserId === u.id;
    const isPendingDelete = isStaged && stagedKind === 'delete';
    const isPendingEdit = isStaged && stagedKind === 'edit';
    const stagedPayload = isPendingEdit ? (stagedDraft?.payload || {}) : {};
    const role = normalizeRole(stagedPayload.primary_role || u.primary_role);
    const accountStatus = String(stagedPayload.account_status || u.account_status || 'active');
    const name = String(stagedPayload.name || u.name || '');
    const email = String(stagedPayload.email || u.email || '');
    return `
    <tr data-user-row="${u.id}" class="bg-white text-xs hover:bg-gray-50/50 transition-colors ${isStaged ? 'opacity-60 bg-amber-50/40' : ''}">
      <td class="px-3 py-4 whitespace-nowrap">
        <button class="btn-change-role" data-user-id="${u.id}" data-user-role="${role}" data-user-name="${name}" data-user-email="${email}" data-user-account-status="${accountStatus}" ${isStaged ? 'disabled' : ''}>
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${roleBadgeClass(role)} uppercase">${roleDisplayName(role)}</span>
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
          <button class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors btn-inspect-user-access" data-user-id="${u.id}" data-user-name="${name}" data-user-email="${email}" data-user-role="${role}" data-user-account-status="${accountStatus}" title="Inspect ACL" ${isStaged ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
              <path fill-rule="evenodd" d="M10 1.75a4.25 4.25 0 0 0-4.25 4.25V8H5a2 2 0 0 0-2 2v5.5A2.5 2.5 0 0 0 5.5 18h9a2.5 2.5 0 0 0 2.5-2.5V10a2 2 0 0 0-2-2h-.75V6A4.25 4.25 0 0 0 10 1.75ZM7.25 6a2.75 2.75 0 1 1 5.5 0V8h-5.5V6Z" clip-rule="evenodd" />
            </svg>
          </button>
          <button class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors btn-edit-user" data-user-id="${u.id}" data-user-name="${name}" data-user-email="${email}" data-user-role="${role}" data-user-account-status="${accountStatus}" title="Edit User" ${isStaged ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
              <path d="m2.695 14.763-1.262 3.154a.5.5 0 0 0 .65.65l3.154-1.262a.5.5 0 0 0 .145-.11l10.19-10.192-2.877-2.878L2.805 14.618a.5.5 0 0 0-.11.145Z" />
              <path d="M15.53 3.47a.75.75 0 0 1 1.06 0l1.44 1.44a.75.75 0 0 1 0 1.06l-1.44 1.44-2.5-2.5 1.44-1.44Z" />
            </svg>
          </button>
          ${role === 'admin' ? '' : `
          <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors btn-delete-user" data-user-id="${u.id}" data-user-name="${name}" title="Delete record" ${isStaged ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4">
              <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75V4H5a2 2 0 0 0-2 2v.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V6a2 2 0 0 0-2-2h-1v-.25A2.75 2.75 0 0 0 11.25 1h-2.5ZM8 4h4v-.25A1.25 1.25 0 0 0 10.75 2.5h-1.5A1.25 1.25 0 0 0 8 3.75V4ZM5 8.5V17a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8.5h-10Z" clip-rule="evenodd" />
            </svg>
          </button>
          `}
        </div>
      </td>
    </tr>`;
  }).join('');
}

export function renderLoadingRows(count = 10) {
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

export function renderAddUserModal(draft = null) {
  const primaryRole = String(draft?.primary_role || 'member');
  const accountStatus = String(draft?.account_status || 'active');
  const csvValue = String(draft?.csv || '');
  return `...`;
}

export function renderEditUserModal(user, draft = null) {
  const primaryRole = String(draft?.primary_role || user.primary_role || 'member');
  const accountStatus = String(draft?.account_status || user.account_status || 'active');
  return `...`;
}
