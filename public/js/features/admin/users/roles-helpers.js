/**
 * Utility, data, and render helpers for the admin roles page.
 */
import { fetchAdminRbacRoles } from '../../../shared/api.js';
import { createAdminModalShell } from '../modal-shell.js';
import { renderButton } from '../../../shared/components/button.js';

export const ROLE_PRESETS = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full platform access',
    system: true,
    defaultPermissions: [
      'chat.read',
      'chat.write',
      'chat.delete',
      'chat.share',
      'file.upload',
      'file.delete',
      'model.use',
      'model.admin',
      'admin.user.read',
      'admin.user.write',
      'admin.audit.read',
      'admin.rbac.admin',
    ],
  },
  {
    id: 'member',
    name: 'Member',
    description: 'Base app access',
    system: true,
    defaultPermissions: ['chat.read', 'chat.write', 'file.upload', 'model.use'],
  },
];

export const PERMISSION_GROUPS = [
  {
    key: 'chat',
    label: 'Chat',
    permissions: [
      { key: 'chat.read', label: 'Read chats', note: 'Open conversations' },
      { key: 'chat.write', label: 'Send messages', note: 'Compose or reply' },
      { key: 'chat.delete', label: 'Delete chats', note: 'Remove chats from the account' },
      { key: 'chat.share', label: 'Share chats', note: 'Create shareable links' },
    ],
  },
  {
    key: 'files',
    label: 'Files',
    permissions: [
      { key: 'file.upload', label: 'Upload files', note: 'Add files to chats' },
      { key: 'file.delete', label: 'Delete files', note: 'Remove uploaded files' },
    ],
  },
  {
    key: 'models',
    label: 'Models',
    permissions: [
      { key: 'model.use', label: 'Use models', note: 'Chat with any model' },
      { key: 'model.admin', label: 'Manage models', note: 'Change model settings' },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    sensitive: true,
    permissions: [
      { key: 'admin.user.read', label: 'Read users', note: 'View user records' },
      { key: 'admin.user.write', label: 'Manage users', note: 'Edit user accounts' },
      { key: 'admin.audit.read', label: 'Read audit logs', note: 'Review access changes' },
      { key: 'admin.rbac.admin', label: 'Edit roles', note: 'Change templates and permissions' },
    ],
  },
];

export const DEFAULT_GROUP_COLLAPSE = {
  chat: false,
  files: false,
  models: false,
  admin: false,
};

import { escapeHtml } from '../../../shared/utils/dom-escape.js';
export { escapeHtml };

export function clonePermissions(source) {
  return new Set(Array.from(source || []));
}

export function cloneRole(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    system: Boolean(role.system),
    sourceRoleId: role.sourceRoleId || null,
    permissions: clonePermissions(role.permissions),
    defaultPermissions: clonePermissions(role.defaultPermissions),
    initialPermissions: clonePermissions(role.initialPermissions),
  };
}

export function createInitialRoles() {
  return ROLE_PRESETS.map((role) => {
    const permissions = clonePermissions(role.defaultPermissions);
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      system: true,
      sourceRoleId: null,
      permissions,
      defaultPermissions: clonePermissions(role.defaultPermissions),
      initialPermissions: clonePermissions(permissions),
    };
  });
}

export function normalizeLoadedRole(role) {
  const preset = ROLE_PRESETS.find((item) => item.id === role?.id);
  const permissions = clonePermissions(role?.permissions || []);
  return {
    id: role.id,
    name: role.name,
    description:
      role.description || preset?.description || (role.system ? 'System role' : 'Custom role'),
    system: Boolean(role.system),
    sourceRoleId: role.sourceRoleId || null,
    permissions,
    defaultPermissions: clonePermissions(role.defaultPermissions || permissions),
    initialPermissions: clonePermissions(role.initialPermissions || permissions),
  };
}

export function getNextCustomIndex(roles) {
  const indexes = (Array.isArray(roles) ? roles : [])
    .filter((role) => !role.system)
    .map((role) => {
      const match = /^Custom\s+(\d+)$/i.exec(String(role.name || '').trim());
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return (indexes.length ? Math.max(...indexes) : 0) + 1;
}

export function permissionsSignature(role) {
  return `${role.id}:${String(role.name || '').trim()}:${Array.from(role.permissions || [])
    .sort()
    .join(',')}`;
}

export function rolesSignature(roles) {
  return (Array.isArray(roles) ? roles : []).map((role) => permissionsSignature(role)).join('|');
}

export function countSensitivePermissions(role) {
  return Array.from(role?.permissions || []).filter((permissionKey) =>
    permissionKey.startsWith('admin.')
  ).length;
}

export function buildVisibleRoles(query, roles) {
  const normalized = String(query || '')
    .trim()
    .toLowerCase();
  return (Array.isArray(roles) ? roles : []).filter((role) => {
    if (!normalized) return true;
    return `${role.name} ${role.description} ${role.system ? 'system' : 'custom'} ${Array.from(role.permissions || []).join(' ')}`
      .toLowerCase()
      .includes(normalized);
  });
}

export function buildVisibleGroups(query) {
  const normalized = String(query || '')
    .trim()
    .toLowerCase();
  return PERMISSION_GROUPS.map((group) => {
    const permissions = group.permissions.filter((permission) => {
      if (!normalized) return true;
      return `${permission.key} ${permission.label} ${permission.note} ${group.label}`
        .toLowerCase()
        .includes(normalized);
    });
    return {
      ...group,
      permissions,
      visible: permissions.length > 0 || !normalized,
    };
  }).filter((group) => group.visible || normalized);
}

export function formatRoleSummary(role) {
  const enabledCount = role?.permissions?.size || 0;
  const sensitiveCount = countSensitivePermissions(role);
  return `${enabledCount} permissions${sensitiveCount ? ` · ${sensitiveCount} sensitive` : ''}`;
}

export function renderLoadingState() {
  return `
    <div class="flex min-h-[320px] items-center justify-center rounded-lg border border-gray-100 bg-white text-sm text-gray-700">
      Loading roles...
    </div>
  `;
}

export function renderErrorState(message) {
  return `
    <div class="flex min-h-[320px] items-center justify-center rounded-lg border border-red-100 bg-red-50/60 p-6 text-center">
      <div class="max-w-sm">
        <div class="text-sm font-semibold text-red-700">Unable to load roles</div>
        <div class="mt-1 text-sm text-red-600">${escapeHtml(message || 'Please try again.')}</div>
        ${renderButton({ label: 'Retry', variant: 'secondary', className: 'mt-3 px-3 py-1 text-xs text-red-700 border-red-200 hover:bg-red-50 focus:ring-red-500', dataAttrs: { 'role-retry': '' } })}
      </div>
    </div>
  `;
}

export async function ensureRolesLoaded(container, state, data, reRender) {
  if (state.rolesLoaded || state.rolesLoading) return;
  state.rolesLoading = true;
  state.rolesError = null;
  reRender(container, data);

  try {
    const payload = await fetchAdminRbacRoles({ cache: 'no-store' });
    const roles =
      Array.isArray(payload?.roles) && payload.roles.length
        ? payload.roles.map((role) => normalizeLoadedRole(role))
        : createInitialRoles();
    state.roles = roles;
    state.nextCustomIndex = getNextCustomIndex(state.roles);
  } catch (err) {
    state.roles = createInitialRoles();
    state.nextCustomIndex = getNextCustomIndex(state.roles);
    state.rolesError = err?.message || 'Failed to load roles.';
  } finally {
    state.rolesLoaded = true;
    state.rolesLoading = false;
    reRender(container, data);
  }
}

export function createRoleDraft(
  role,
  { isNew = false, sourceRoleId = null, nextCustomIndex = 1 } = {}
) {
  const cloned = cloneRole(role);
  if (isNew) {
    cloned.id = `custom-${nextCustomIndex}`;
    cloned.name = `Custom ${nextCustomIndex}`;
    cloned.description = 'Custom role';
    cloned.system = false;
    cloned.sourceRoleId = sourceRoleId || 'member';
  }
  return cloned;
}

export function createModalShell({ title, subtitle, showDelete = false } = {}) {
  const { modal } = createAdminModalShell({
    preset: 'roleEditor',
    title,
    subtitle,
    modalHash: 'role-modal',
    body: '<div data-modal-body></div>',
    footer: `
      <div class="text-label-xs text-gray-700 leading-tight" data-modal-note></div>
      <div class="flex items-center gap-1.5">
        ${showDelete ? renderButton({ label: 'Delete', variant: 'secondary', className: 'px-2 py-0.75 text-label-xs text-red-600 border-red-200 hover:bg-red-50 focus:ring-red-500', dataAttrs: { 'role-modal-delete': '' } }) : ''}
        ${renderButton({ label: 'Discard', variant: 'secondary', className: 'px-2 py-0.75 text-label-xs', dataAttrs: { 'modal-discard': '' } })}
        ${renderButton({ label: 'Restore defaults', variant: 'secondary', className: 'px-2 py-0.75 text-label-xs', dataAttrs: { 'modal-reset': '' } })}
        ${renderButton({ label: 'Save', variant: 'primary', className: 'px-2.5 py-0.75 text-label-xs', dataAttrs: { 'role-save': '' } })}
      </div>
    `,
    closeAttr: 'data-modal-close',
  });
  return modal;
}

export function renderPermissionGroup(group, draft, modalState) {
  const collapsed =
    Boolean(modalState.groupCollapsed[group.key]) && !String(modalState.query || '').trim();
  const visiblePermissions = group.permissions.filter((permission) => {
    const normalized = String(modalState.query || '')
      .trim()
      .toLowerCase();
    if (!normalized) return true;
    return `${permission.key} ${permission.label} ${permission.note} ${group.label}`
      .toLowerCase()
      .includes(normalized);
  });
  if (!visiblePermissions.length && String(modalState.query || '').trim()) return '';

  return `
    <div id="role-group-${escapeHtml(group.key)}" class="border-b border-gray-100 last:border-b-0 scroll-mt-20">
      <button type="button" data-group-toggle="${escapeHtml(group.key)}" class="flex w-full items-center justify-between px-2.5 py-1.25 hover:bg-gray-50 transition">
        <div class="flex items-center gap-2">
          <span class="text-label-xs font-semibold uppercase tracking-wider text-gray-400">${escapeHtml(group.label)}</span>
          ${group.sensitive ? '<span class="rounded-full border border-amber-200 bg-amber-100 px-1 py-0.5 text-label-xs font-semibold uppercase tracking-wide text-amber-700">Sensitive</span>' : ''}
        </div>
        <div class="text-label-sm text-gray-400">${collapsed ? '▸' : '▾'}</div>
      </button>
      ${
        collapsed
          ? ''
          : visiblePermissions
              .map((permission) => {
                const primary = modalState.advanced ? permission.key : permission.label;
                const secondary = modalState.advanced ? permission.label : permission.key;
                const isSensitive = group.sensitive || permission.key.startsWith('admin.');
                const rowTitle = `${permission.label} · ${permission.key} · ${permission.note}`;
                return `
          <label title="${escapeHtml(rowTitle)}" class="flex items-center justify-between gap-2 border-t border-gray-50 px-2.5 py-1 text-label-xs ${isSensitive ? 'bg-amber-50/30' : ''}">
            <div class="min-w-0 flex-1 flex items-center gap-1.5">
              <span class="font-medium text-gray-900 whitespace-nowrap">${escapeHtml(primary)}</span>
              ${isSensitive ? '<span class="rounded-full border border-amber-200 bg-amber-100 px-1 py-0.5 text-label-xs font-semibold uppercase tracking-wide text-amber-700 whitespace-nowrap">Sensitive</span>' : ''}
              <span class="text-label-xs text-gray-400 whitespace-nowrap">· ${escapeHtml(secondary)}</span>
              <span class="text-label-xs text-gray-500 whitespace-nowrap">· ${escapeHtml(permission.note)}</span>
            </div>
            <input
              type="checkbox"
              data-permission-toggle="${escapeHtml(permission.key)}"
              ${draft.permissions.has(permission.key) ? 'checked' : ''}
              class="h-3.5 w-3.5 rounded border-gray-300 text-black focus:ring-gray-300"
            >
          </label>
        `;
              })
              .join('')
      }
    </div>
  `;
}
