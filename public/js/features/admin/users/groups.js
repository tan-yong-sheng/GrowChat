import {
  addGroupMembers,
  createAdminGroup,
  deleteAdminGroup,
  fetchAdminGroup,
  fetchAdminGroups,
  fetchAdminModels,
  fetchAdminUsers,
  fetchGroupDefaultPermissions,
  fetchGroupModelAccess,
  removeGroupMembers,
  updateAdminGroup,
  updateGroupDefaultPermissions,
  updateGroupModelAccess,
} from '../../../shared/api.js';
import { buildProviderOptions, filterModelsBySearchAndProvider } from '../../../shared/utils/model-filters.js';
import { buildMemberSet, clampUserLimit, diffMemberSets, filterUsers } from './groups-members-helpers.js';
import { formatSortLabel, nextGroupSort, sortGroups } from './groups-list-helpers.js';

const SHARE_POLICY_OPTIONS = [
  { value: 'none', label: 'No one' },
  { value: 'members', label: 'Members' },
  { value: 'anyone', label: 'Anyone' },
];

export function getPermissionCatalog() {
  return [
    {
      id: 'workspace',
      title: 'Workspace Permissions',
      items: [
        {
          key: 'model.use',
          label: 'Models Access',
          tooltip: 'Use available models when sending messages. Empty selection allows all models.',
          action: {
            type: 'model-access',
            label: 'Manage',
            tooltip: 'Choose specific models for this group.',
          },
        },
        {
          key: 'model.admin',
          label: 'Manage Models',
          tooltip: 'Change model availability or defaults.',
        },
        {
          id: 'chat-access',
          label: 'Chat Access',
          tooltip: 'Control who can view, create, or delete chats.',
          options: [
            { key: 'chat.read', label: 'Read' },
            { key: 'chat.write', label: 'Write' },
            { key: 'chat.delete', label: 'Delete' },
          ],
        },
        {
          id: 'file-access',
          label: 'File Access',
          tooltip: 'Control file uploads and deletions.',
          options: [
            { key: 'file.upload', label: 'Upload' },
            { key: 'file.delete', label: 'Delete' },
          ],
        },
      ],
    },
    {
      id: 'sharing',
      title: 'Sharing Permissions',
      items: [
        {
          key: 'chat.share',
          label: 'Chat Sharing',
          tooltip: 'Share chats with other users or links (if enabled).',
        },
      ],
    },
    {
      id: 'admin',
      title: 'Admin Permissions',
      items: [
        {
          id: 'user-management',
          label: 'User Management',
          tooltip: 'View and manage user accounts and group membership.',
          options: [
            { key: 'admin.user.read', label: 'Read' },
            { key: 'admin.user.write', label: 'Write' },
          ],
        },
        {
          key: 'admin.audit.read',
          label: 'Audit Log',
          tooltip: 'Read admin audit events.',
        },
        {
          key: 'admin.rbac.admin',
          label: 'RBAC Management',
          tooltip: 'Create groups and edit permissions.',
        },
      ],
    },
  ];
}

export function getGroupModalTheme() {
  return {
    overlay: 'bg-black/25',
    container: 'bg-white text-gray-900 border border-gray-200 shadow-2xl',
    sidebar: 'border-r border-gray-200 bg-white',
    sidebarActive: 'bg-gray-100 text-gray-900',
    sidebarInactive: 'text-gray-500 hover:text-gray-800',
    panelLabel: 'text-gray-600',
    panelText: 'text-gray-900',
    input: 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-400',
    select: 'bg-white border-gray-300 text-gray-900 focus:border-gray-400',
    footer: 'border-t border-gray-200 bg-white',
  };
}

function buildToggleButton(key, label, enabled, options = {}) {
  const { statusLabel = false } = options;
  return `
    <button type="button" class="perm-toggle inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition ${enabled ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' : 'bg-gray-100 text-gray-600 border-gray-200'}" data-permission="${key}" data-toggle-label="${statusLabel ? 'status' : 'static'}" aria-pressed="${enabled ? 'true' : 'false'}">
      <span class="relative inline-flex h-4 w-7 items-center rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}">
        <span class="inline-block h-3 w-3 rounded-full bg-white shadow transition ${enabled ? 'translate-x-3.5' : 'translate-x-0.5'}"></span>
      </span>
      <span class="perm-toggle-label">${label}</span>
    </button>
  `;
}

function renderPermissionRow(item, permissionsSet, context = {}) {
  const hasOptions = Array.isArray(item.options);
  const label = item.label || '';
  const tooltip = item.tooltip || '';
  const showActions = context.showActions !== false;
  const info = tooltip
    ? `<span class="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[10px] text-gray-500" title="${tooltip}">i</span>`
    : '';

  if (hasOptions) {
    const toggles = item.options.map((option) => buildToggleButton(
      option.key,
      option.label,
      permissionsSet.has(option.key)
    )).join('');

    return `
      <div class="flex items-center justify-between gap-4 py-2.5">
        <div class="text-sm font-medium text-gray-800">${label}${info}</div>
        <div class="flex items-center gap-2">${toggles}</div>
      </div>
    `;
  }

  const isEnabled = permissionsSet.has(item.key);
  const toggle = buildToggleButton(
    item.key,
    isEnabled ? 'Enabled' : 'Disabled',
    isEnabled,
    { statusLabel: true }
  );
  let action = '';
  if (showActions && item.action?.type === 'model-access') {
    const labelText = item.action.label || 'Manage';
    const actionTooltip = item.action.tooltip || '';
    const disabled = context.requiresGroup && !context.groupId;
    const hint = disabled ? 'Save the group to choose models.' : actionTooltip;
    action = `
      <button type="button" class="model-access-btn inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition ${disabled ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-100'} ${isEnabled ? '' : 'hidden'}" data-model-access-btn data-action-permission="${item.key}" ${disabled ? 'disabled' : ''} title="${hint}">
        <span>${labelText}</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="m9 5.25 6 6-6 6" />
        </svg>
      </button>
    `;
  }

  return `
    <div class="flex items-center justify-between gap-4 py-2.5">
      <div class="text-sm font-medium text-gray-800">${label}${info}</div>
      <div class="flex items-center gap-2">${toggle}${action}</div>
    </div>
  `;
}

function renderPermissionSections(permissionsSet, context = {}) {
  const sections = getPermissionCatalog();
  return sections.map((section) => `
    <div class="space-y-2">
      <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${section.title}</div>
      <div class="space-y-1">
        ${section.items.map((item) => renderPermissionRow(item, permissionsSet, context)).join('')}
      </div>
    </div>
  `).join('');
}

function syncToggleButton(btn, enabled) {
  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  btn.classList.toggle('bg-emerald-500/15', enabled);
  btn.classList.toggle('text-emerald-700', enabled);
  btn.classList.toggle('border-emerald-500/20', enabled);
  btn.classList.toggle('bg-gray-100', !enabled);
  btn.classList.toggle('text-gray-500', !enabled);
  btn.classList.toggle('border-gray-200', !enabled);
  const track = btn.querySelector('span');
  const knob = btn.querySelector('span > span');
  const label = btn.querySelector('.perm-toggle-label');
  if (track) {
    track.classList.toggle('bg-emerald-500', enabled);
    track.classList.toggle('bg-gray-300', !enabled);
  }
  if (knob) {
    knob.classList.toggle('translate-x-3.5', enabled);
    knob.classList.toggle('translate-x-0.5', !enabled);
  }
  if (label && btn.dataset.toggleLabel === 'status') {
    label.textContent = enabled ? 'Enabled' : 'Disabled';
  }
}

function syncPermissionActions(root, permissionsSet) {
  root.querySelectorAll('[data-action-permission]').forEach((btn) => {
    const key = btn.dataset.actionPermission;
    if (!key) return;
    const enabled = permissionsSet.has(key);
    btn.classList.toggle('hidden', !enabled);
  });
}

function wirePermissionToggles(root, permissionsSet) {
  root.querySelectorAll('.perm-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.permission;
      if (!key) return;
      if (permissionsSet.has(key)) {
        permissionsSet.delete(key);
        syncToggleButton(btn, false);
      } else {
        permissionsSet.add(key);
        syncToggleButton(btn, true);
      }
      syncPermissionActions(root, permissionsSet);
    });
  });
}

function renderGroupModal({
  mode,
  group = null,
  permissions = [],
  members = [],
  users = [],
  usersTotal = 0,
  usersError = null,
  onSave,
  onDelete,
}) {
  const permissionsSet = new Set(permissions);
  const isEdit = mode === 'edit';
  const selectedPolicy = group?.share_policy || 'members';
  const selectedMembers = buildMemberSet(members);
  const originalMembers = buildMemberSet(members);
  const memberState = {
    query: '',
  };
  const groupId = group?.id || '';
  const modelAccessState = {
    loaded: false,
    loading: false,
    error: null,
    models: [],
    modelIds: [],
    query: '',
    provider: 'all',
    providerOptions: [],
  };
  const allUsers = Array.isArray(users) ? users : [];
  const theme = getGroupModalTheme();
  const overlay = document.createElement('div');
  overlay.id = 'group-modal';
  overlay.className = 'fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-4';
  overlay.innerHTML = `
    <div class="absolute inset-0 ${theme.overlay}"></div>
    <div class="relative w-full max-w-6xl ${theme.container} rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 shrink-0">
        <div class="text-lg font-semibold">${isEdit ? 'Edit User Group' : 'Add User Group'}</div>
        <button class="p-2 rounded-full hover:bg-gray-100 transition" data-close-group-modal>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="flex flex-1 min-h-0 flex-col md:flex-row">
        <div class="w-full md:w-32 lg:w-36 ${theme.sidebar} border-r-0 md:border-r p-3 md:p-3.5 text-sm shrink-0 border-b md:border-b-0">
          <div class="flex flex-wrap md:flex-col gap-2 md:gap-1.5">
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-xl transition ${theme.sidebarActive}" data-tab="general">
            <span class="flex items-center gap-2">General</span>
          </button>
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-xl transition ${theme.sidebarInactive}" data-tab="permissions">
            <span class="flex items-center gap-2">Permissions</span>
          </button>
            <button class="group-tab flex-1 md:w-full text-left px-3 py-2 rounded-xl transition ${theme.sidebarInactive}" data-tab="members">
            <span class="flex items-center gap-2">Members</span>
          </button>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-6">
          <div data-panel="general" class="space-y-5">
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-600 font-semibold">Name</label>
              <input id="group-name-input" class="w-full ${theme.input} rounded-2xl px-4 py-3 text-sm outline-none" placeholder="Group Name" value="${group?.name || ''}">
            </div>
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-600 font-semibold">Description</label>
              <textarea id="group-description-input" rows="3" class="w-full ${theme.input} rounded-2xl px-4 py-3 text-sm outline-none resize-none" placeholder="Group Description">${group?.description || ''}</textarea>
            </div>
            <div class="space-y-2">
              <label class="text-xs uppercase tracking-wider text-gray-600 font-semibold">Who can share to this group</label>
              <select id="group-share-policy" class="w-full ${theme.select} rounded-2xl px-4 py-3 text-sm outline-none">
                ${SHARE_POLICY_OPTIONS.map((option) => `
                  <option value="${option.value}" ${selectedPolicy === option.value ? 'selected' : ''}>${option.label}</option>
                `).join('')}
              </select>
            </div>
          </div>
          <div data-panel="permissions" class="space-y-6 hidden">
            ${renderPermissionSections(permissionsSet, { showActions: true, requiresGroup: true, groupId })}
          </div>
          <div data-panel="members" class="space-y-4 hidden">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold text-gray-900">Members</div>
                <div class="text-[11px] text-gray-500" id="members-count"></div>
              </div>
              <div class="text-[11px] text-gray-400">${usersTotal ? `Showing ${Math.min(allUsers.length, usersTotal)} of ${usersTotal}` : ''}</div>
            </div>
            <div class="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2">
              <input id="group-member-search" class="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none" placeholder="Search users">
            </div>
            <div id="group-members-error" class="text-sm text-red-500 ${usersError ? '' : 'hidden'}">${usersError || ''}</div>
            <div id="group-members-list" class="space-y-2 max-h-64 overflow-y-auto scrollbar-hidden pr-1"></div>
          </div>
        </div>
      </div>
      <div class="px-5 py-3 ${theme.footer} flex items-center justify-between shrink-0">
        <div class="text-sm text-red-600" id="group-modal-error"></div>
        <div class="flex items-center gap-2">
          ${isEdit ? '<button id="group-delete-btn" class="px-4 py-2 text-sm text-red-500 hover:text-red-600">Delete</button>' : ''}
          <button id="group-save-btn" class="px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800">Save</button>
        </div>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close-group-modal]')) close();
  });

  const tabButtons = overlay.querySelectorAll('.group-tab');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      overlay.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.panel !== tab);
      });
      tabButtons.forEach((other) => {
        other.classList.toggle('bg-gray-100', other === btn);
        other.classList.toggle('text-gray-900', other === btn);
        other.classList.toggle('text-gray-500', other !== btn);
      });
    });
  });

  const permissionsPanel = overlay.querySelector('[data-panel="permissions"]');
  if (permissionsPanel) {
    wirePermissionToggles(permissionsPanel, permissionsSet);
    syncPermissionActions(permissionsPanel, permissionsSet);
    permissionsPanel.querySelectorAll('[data-model-access-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        openModelAccessModal();
      });
    });
  }

  const membersListEl = overlay.querySelector('#group-members-list');
  const membersCountEl = overlay.querySelector('#members-count');
  const membersSearchInput = overlay.querySelector('#group-member-search');

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const loadModelAccessData = async () => {
    if (!groupId || modelAccessState.loading) return;
    modelAccessState.loading = true;
    modelAccessState.error = null;
    try {
      const [modelsPayload, accessPayload] = await Promise.all([
        fetchAdminModels({ limit: 500, offset: 0, includeDisabled: false }),
        fetchGroupModelAccess(groupId),
      ]);
      modelAccessState.models = modelsPayload?.models || [];
      modelAccessState.modelIds = accessPayload?.model_ids || [];
      const providerPayload = Array.isArray(modelsPayload?.providers) ? modelsPayload.providers : [];
      const baseProviders = providerPayload.length
        ? providerPayload
        : buildProviderOptions(modelAccessState.models, { includeAll: false });
      const enabledProviders = baseProviders.filter((option) => Number(option.active || 0) > 0);
      const totals = baseProviders.reduce((acc, option) => {
        acc.active += Number(option.active || 0);
        acc.total += Number(option.total || 0);
        return acc;
      }, { active: 0, total: 0 });
      const allOption = {
        value: 'all',
        label: 'All Providers',
        active: totals.active,
        total: totals.total,
      };
      modelAccessState.providerOptions = [
        allOption,
        ...enabledProviders.filter((option) => option.value !== 'all'),
      ];
      modelAccessState.loaded = true;
    } catch (err) {
      modelAccessState.error = err?.message || 'Failed to load models.';
    } finally {
      modelAccessState.loading = false;
    }
  };

  const openModelAccessModal = async () => {
    if (!groupId) return;
    const selected = new Set(modelAccessState.modelIds || []);
    const providerOptions = modelAccessState.providerOptions.length
      ? modelAccessState.providerOptions
      : buildProviderOptions(modelAccessState.models);
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4';
    modal.innerHTML = `
      <div class="absolute inset-0 ${theme.overlay}"></div>
      <div class="relative w-full max-w-5xl ${theme.container} rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div class="text-lg font-semibold">Model Access</div>
            <div class="text-[11px] text-amber-600 font-medium">* Empty selection allows every available model.</div>
          </div>
          <button class="p-2 rounded-full hover:bg-gray-100 transition" data-close-model-access>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <span id="model-access-summary"></span>
            </div>
            <div class="flex items-center gap-2 self-end sm:self-auto">
              <button type="button" class="inline-flex items-center justify-center size-9 rounded-full border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-400 shadow-sm transition" id="model-access-select-all" title="Select all enabled" aria-label="Select all enabled">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 6.75l1.5 1.5 3-3M4.5 12.75l1.5 1.5 3-3M4.5 18.75l1.5 1.5 3-3M10.5 7.5h9M10.5 13.5h9M10.5 19.5h9" />
                </svg>
              </button>
              <button type="button" class="inline-flex items-center justify-center size-9 rounded-full border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-400 shadow-sm transition" id="model-access-clear" title="Clear selection" aria-label="Clear selection">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 7.5h3M4.5 13.5h3M4.5 19.5h3M10.5 7.5h9M10.5 13.5h9M10.5 19.5h9" />
                </svg>
              </button>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <div class="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 flex-1">
              <input id="model-access-search" class="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none" placeholder="Search models">
            </div>
            <select id="model-access-provider" class="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-gray-300">
              ${providerOptions.map((option) => `
                <option value="${option.value}" ${option.value === modelAccessState.provider ? 'selected' : ''}>
                  ${option.label}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
                </option>
              `).join('')}
            </select>
          </div>
          <div id="model-access-error" class="text-sm text-red-500 ${modelAccessState.error ? '' : 'hidden'}">${escapeHtml(modelAccessState.error || '')}</div>
          <div id="model-access-list" class="space-y-2 max-h-[50vh] overflow-y-auto pr-1"></div>
        </div>
        <div class="px-5 py-3 ${theme.footer} flex items-center justify-between shrink-0">
          <div class="text-sm text-red-600" id="model-access-save-error"></div>
          <div class="flex items-center gap-2">
            <button type="button" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700" data-close-model-access>Cancel</button>
            <button type="button" class="px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800" id="model-access-save-btn">Save</button>
          </div>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close-model-access]')) close();
    });

    const summaryEl = modal.querySelector('#model-access-summary');
    const selectAllBtn = modal.querySelector('#model-access-select-all');
    const clearBtn = modal.querySelector('#model-access-clear');
    const listEl = modal.querySelector('#model-access-list');
    const errorEl = modal.querySelector('#model-access-error');
    const searchInput = modal.querySelector('#model-access-search');
    const providerSelect = modal.querySelector('#model-access-provider');

    const renderSummary = () => {
      if (!summaryEl) return;
      summaryEl.textContent = selected.size ? `${selected.size} selected` : '';
      const enabledCount = (modelAccessState.models || []).filter((model) => model.enabled !== false).length;
      if (selectAllBtn) {
        selectAllBtn.classList.toggle('hidden', enabledCount > 0 && selected.size >= enabledCount);
      }
      if (clearBtn) {
        clearBtn.classList.toggle('hidden', selected.size === 0);
      }
    };

    const renderProviderOptions = () => {
      if (!providerSelect) return;
      const options = modelAccessState.providerOptions.length
        ? modelAccessState.providerOptions
        : buildProviderOptions(modelAccessState.models).filter((option) => Number(option.active || 0) > 0 || option.value === 'all');
      const current = modelAccessState.provider || 'all';
      providerSelect.innerHTML = options.map((option) => `
        <option value="${option.value}" ${option.value === current ? 'selected' : ''}>
          ${option.label}${Number.isFinite(option.active) && Number.isFinite(option.total) ? ` (${option.active} active, ${option.total} total)` : ''}
        </option>
      `).join('');
      if (![...providerSelect.options].some((opt) => opt.value === current)) {
        providerSelect.value = 'all';
        modelAccessState.provider = 'all';
      }
    };

    const matchesQuery = (model, query) => {
      if (!query) return true;
      const haystack = [
        model?.name,
        model?.id,
        model?.provider_family,
        model?.provider,
        model?.connection_name,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    };

    const renderList = () => {
      if (!listEl) return;
      if (modelAccessState.loading) {
        listEl.innerHTML = `
          <div class="space-y-2">
            ${Array.from({ length: 6 }).map(() => `
              <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 animate-pulse">
                <div class="flex flex-col min-w-0 flex-1 space-y-2">
                  <div class="h-3.5 w-40 bg-gray-200 rounded-full"></div>
                  <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
                </div>
                <div class="h-6 w-20 bg-gray-100 rounded-full border border-gray-200"></div>
              </div>
            `).join('')}
          </div>
        `;
        return;
      }
      if (errorEl) {
        errorEl.classList.toggle('hidden', !modelAccessState.error);
        errorEl.textContent = modelAccessState.error || '';
      }
      const query = String(searchInput?.value || '').trim().toLowerCase();
      const provider = providerSelect?.value || modelAccessState.provider || 'all';
      const models = filterModelsBySearchAndProvider(modelAccessState.models || [], {
        query,
        provider,
      });
      if (!models.length) {
        listEl.innerHTML = '<div class="text-sm text-gray-500 py-6 text-center">No models match this search.</div>';
        return;
      }
      listEl.innerHTML = models.map((model) => {
        const modelId = model.id;
        const isSelected = selected.has(modelId);
        const isEnabled = model.enabled !== false;
        const meta = [model.provider_family || model.provider || '', model.connection_name || '']
          .filter(Boolean)
          .join(' • ');
        const badge = isEnabled ? '' : '<span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Disabled</span>';
        const buttonClass = isEnabled
          ? isSelected
            ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
            : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300'
          : 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed';
        const buttonLabel = isEnabled ? (isSelected ? 'Allowed' : 'Allow') : 'Disabled';
        return `
          <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 ${isEnabled ? '' : 'bg-gray-50/70 opacity-60'}">
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2">
                <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(model.name || model.id)}</div>
                ${badge}
              </div>
              <div class="text-[11px] text-gray-500 truncate">${escapeHtml(model.id)}${meta ? ` • ${escapeHtml(meta)}` : ''}</div>
            </div>
            <button type="button" class="model-access-toggle text-[11px] font-semibold px-3 py-1 rounded-full border transition ${buttonClass}" data-model-id="${escapeHtml(modelId)}" ${isEnabled ? '' : 'disabled'}>
              ${buttonLabel}
            </button>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.model-access-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const modelId = btn.dataset.modelId;
          if (!modelId || btn.disabled) return;
          if (selected.has(modelId)) {
            selected.delete(modelId);
          } else {
            selected.add(modelId);
          }
          renderSummary();
          renderList();
        });
      });
    };

    const handleSelectAll = () => {
      selected.clear();
      (modelAccessState.models || [])
        .filter((model) => model.enabled !== false)
        .forEach((model) => selected.add(model.id));
      renderSummary();
      renderList();
    };

    const handleClear = () => {
      selected.clear();
      renderSummary();
      renderList();
    };

    const shouldLoad = !modelAccessState.loaded && !modelAccessState.loading;
    if (shouldLoad) {
      loadModelAccessData().then(() => {
        renderProviderOptions();
        renderSummary();
        renderList();
      });
    }

    renderProviderOptions();
    renderSummary();
    renderList();

    searchInput?.addEventListener('input', renderList);
    providerSelect?.addEventListener('change', (e) => {
      modelAccessState.provider = e.target.value || 'all';
      renderList();
    });
    modal.querySelector('#model-access-select-all')?.addEventListener('click', handleSelectAll);
    modal.querySelector('#model-access-clear')?.addEventListener('click', handleClear);

    modal.querySelector('#model-access-save-btn')?.addEventListener('click', async () => {
      const errorEl = modal.querySelector('#model-access-save-error');
      if (errorEl) errorEl.textContent = '';
      try {
        const modelIds = Array.from(selected);
        await updateGroupModelAccess(groupId, modelIds);
        modelAccessState.modelIds = modelIds;
        close();
      } catch (err) {
        if (errorEl) errorEl.textContent = err?.message || 'Failed to save model access.';
      }
    });

    document.body.appendChild(modal);
  };

  const renderMembers = () => {
    if (!membersListEl) return;
    const filtered = filterUsers(allUsers, memberState.query);
    if (!filtered.length) {
      membersListEl.innerHTML = `
        <div class="text-sm text-gray-500 py-6 text-center">No users found.</div>
      `;
    } else {
      membersListEl.innerHTML = filtered.map((user) => {
        const isSelected = selectedMembers.has(user.id);
        const initials = String(user.name || user.email || '?').trim().charAt(0).toUpperCase() || '?';
        const buttonLabel = isSelected ? 'Member' : 'Add';
        const buttonClass = isSelected
          ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
          : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300';
        return `
          <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">${escapeHtml(initials)}</div>
              <div class="flex flex-col">
                <div class="text-sm font-medium text-gray-900">${escapeHtml(user.name || 'Unknown')}</div>
                <div class="text-[11px] text-gray-500">${escapeHtml(user.email || '')}</div>
              </div>
            </div>
            <button type="button" class="member-toggle text-[11px] font-semibold px-3 py-1 rounded-full border transition ${buttonClass}" data-user-id="${escapeHtml(user.id)}">
              ${buttonLabel}
            </button>
          </div>
        `;
      }).join('');
    }

    if (membersCountEl) {
      membersCountEl.textContent = `${selectedMembers.size} selected`;
    }

    membersListEl.querySelectorAll('.member-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = btn.dataset.userId;
        if (!userId) return;
        if (selectedMembers.has(userId)) {
          selectedMembers.delete(userId);
        } else {
          selectedMembers.add(userId);
        }
        renderMembers();
      });
    });
  };

  if (membersSearchInput) {
    membersSearchInput.addEventListener('input', (e) => {
      memberState.query = e.target.value || '';
      renderMembers();
    });
  }

  renderMembers();

  const showError = (message) => {
    const el = overlay.querySelector('#group-modal-error');
    if (el) el.textContent = message || '';
  };

  overlay.querySelector('#group-save-btn')?.addEventListener('click', async () => {
    const name = overlay.querySelector('#group-name-input')?.value || '';
    const description = overlay.querySelector('#group-description-input')?.value || '';
    const sharePolicy = overlay.querySelector('#group-share-policy')?.value || 'members';
    const permissionsList = Array.from(permissionsSet);
    const memberIds = Array.from(selectedMembers);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        share_policy: sharePolicy,
        permissions: permissionsList,
        member_ids: memberIds,
        original_member_ids: Array.from(originalMembers),
      });
      close();
    } catch (err) {
      showError(err?.message || 'Failed to save group.');
    }
  });

  overlay.querySelector('#group-delete-btn')?.addEventListener('click', async () => {
    if (!group?.id) return;
    try {
      await onDelete?.(group.id);
      close();
    } catch (err) {
      showError(err?.message || 'Failed to delete group.');
    }
  });

  return overlay;
}

async function openCreateModal({ onRefresh, onCreate }) {
  const defaultPermissions = await fetchGroupDefaultPermissions()
    .then((payload) => payload.permissions || [])
    .catch(() => []);

  let users = [];
  let usersTotal = 0;
  let usersError = null;
  try {
    const payload = await fetchAdminUsers({ limit: clampUserLimit(100), offset: 0 });
    users = payload.users || [];
    usersTotal = payload.total || users.length;
  } catch (err) {
    usersError = err.message || 'Unable to load users.';
  }

  const modal = renderGroupModal({
    mode: 'create',
    permissions: defaultPermissions,
    users,
    usersTotal,
    usersError,
    onSave: async (payload) => {
      if (!payload.name) throw new Error('Group name is required.');
      const created = await createAdminGroup(payload);
      const groupId = created?.group?.id;
      if (groupId && payload.member_ids?.length) {
        await addGroupMembers(groupId, payload.member_ids);
      }
      if (typeof onCreate === 'function') {
        onCreate({
          ...created.group,
          member_count: payload.member_ids?.length || 0,
        });
      } else {
        await onRefresh?.();
      }
    },
  });
  document.body.appendChild(modal);
}

async function openEditModal(groupId, { onRefresh, onUpdate, onDelete, onMemberDelta }) {
  const detail = await fetchAdminGroup(groupId);
  let users = [];
  let usersTotal = 0;
  let usersError = null;
  try {
    const payload = await fetchAdminUsers({ limit: clampUserLimit(100), offset: 0 });
    users = payload.users || [];
    usersTotal = payload.total || users.length;
  } catch (err) {
    usersError = err.message || 'Unable to load users.';
  }
  const modal = renderGroupModal({
    mode: 'edit',
    group: detail.group,
    permissions: detail.group?.permissions || [],
    members: detail.members || [],
    users,
    usersTotal,
    usersError,
    onSave: async (payload) => {
      if (!payload.name) throw new Error('Group name is required.');
      const updated = await updateAdminGroup(groupId, payload);
      const before = new Set(payload.original_member_ids || []);
      const after = new Set(payload.member_ids || []);
      const diff = diffMemberSets(before, after);
      if (diff.add.length) {
        await addGroupMembers(groupId, diff.add);
      }
      if (diff.remove.length) {
        await removeGroupMembers(groupId, diff.remove);
      }
      if (typeof onUpdate === 'function') {
        onUpdate({
          ...updated.group,
          permissions: updated.permissions ?? undefined,
        });
      }
      if (typeof onMemberDelta === 'function') {
        onMemberDelta(groupId, diff.add.length - diff.remove.length);
      }
      if (!onUpdate) {
        await onRefresh?.();
      }
    },
    onDelete: async () => {
      await deleteAdminGroup(groupId);
      if (typeof onDelete === 'function') {
        onDelete(groupId);
      } else {
        await onRefresh?.();
      }
    },
  });
  document.body.appendChild(modal);
}

async function openDefaultPermissionsModal({ onRefresh }) {
  const permissionsSet = new Set();
  const payload = await fetchGroupDefaultPermissions().catch(() => ({ permissions: [] }));
  (payload.permissions || []).forEach((perm) => permissionsSet.add(perm));

  const theme = getGroupModalTheme();
  const overlay = document.createElement('div');
  overlay.id = 'default-permissions-modal';
  overlay.className = 'fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-4';
  overlay.innerHTML = `
    <div class="absolute inset-0 ${theme.overlay}"></div>
    <div class="relative w-full max-w-3xl ${theme.container} rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <div class="text-lg font-semibold">Default permissions</div>
        <button class="p-2 rounded-full hover:bg-gray-100 transition" data-close-default-perms>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
        ${renderPermissionSections(permissionsSet, { showActions: false })}
      </div>
      <div class="px-5 py-3 ${theme.footer} flex items-center justify-between shrink-0">
        <div class="text-sm text-red-600" id="default-perms-error"></div>
        <button id="default-perms-save" class="px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800">Save</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close-default-perms]')) close();
  });

  wirePermissionToggles(overlay, permissionsSet);

  const showError = (message) => {
    const el = overlay.querySelector('#default-perms-error');
    if (el) el.textContent = message || '';
  };

  overlay.querySelector('#default-perms-save')?.addEventListener('click', async () => {
    try {
      await updateGroupDefaultPermissions({ permissions: Array.from(permissionsSet) });
      await onRefresh?.();
      close();
    } catch (err) {
      showError(err?.message || 'Failed to save permissions.');
    }
  });

  document.body.appendChild(overlay);
}

function renderEmptyState() {
  return `
    <div class="w-full flex flex-col justify-center items-center py-16 px-4">
      <div class="flex flex-col items-center max-w-xs text-center">
        <div class="text-4xl mb-4 bg-gray-50 p-6 rounded-[2.5rem] text-blue-500 shadow-inner">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-12">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        </div>
        <div class="text-lg font-bold text-gray-900 mb-1.5">No groups found</div>
        <div class="text-gray-500 text-xs leading-relaxed">Use groups to organize your users and assign permissions.</div>
      </div>
    </div>
  `;
}

export function renderGroupsOverview(container, data, actions = {}) {
  const sortKey = data.groupsSort || 'members';
  const groups = sortGroups(data.groups || [], sortKey);
  const isLoading = data.groupsLoading;
  const error = data.groupsError;

  container.innerHTML = `
    <div class="flex flex-col h-full animate-in fade-in duration-300">
      <div class="flex flex-col gap-1 px-1 mt-1.5 mb-3">
        <div class="flex justify-between items-center">
          <div class="flex items-center md:self-center text-xl font-medium px-0.5 gap-2 shrink-0">
            <div class="text-gray-900">Groups</div>
            <div class="text-lg font-medium text-gray-500">${groups.length}</div>
          </div>
          <div class="flex w-full justify-end gap-1.5">
            <button class="px-4 py-1.5 rounded-full bg-gray-100 text-gray-900 transition-all hover:bg-gray-200 font-semibold text-xs flex items-center shadow-sm" id="create-group-btn">
              <span class="mr-2 text-sm">+</span>
              <span>New Group</span>
            </button>
          </div>
        </div>
      </div>

      <div class="py-2.5 bg-white rounded-[2rem] border border-gray-100/50 shadow-sm overflow-hidden">
        <div class="flex items-center w-full space-x-2 py-1 px-4 mb-1">
          <div class="flex flex-1 items-center bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30">
            <div class="text-gray-400 mr-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="size-3.5">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </div>
            <input class="w-full text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" placeholder="Search Groups" id="group-search-input">
            <div id="clear-search-container" class="hidden ml-1.5">
              <button id="clear-search-btn" class="p-0.5 rounded-full hover:bg-gray-200 transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <button class="relative flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-50/50 hover:bg-gray-100 border border-gray-100/30 rounded-xl shrink-0 transition-colors" id="sort-groups-btn">
            <span class="text-xs font-medium text-gray-700">${formatSortLabel(sortKey)}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3.5 text-gray-400">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>

        ${isLoading ? `
          <div class="p-10 text-center text-sm text-gray-500">Loading groups...</div>
        ` : error ? `
          <div class="p-10 text-center text-sm text-red-500">${error}</div>
        ` : groups.length ? `
          <div class="my-2 px-4 grid grid-cols-1 gap-1">
            ${groups.map((group) => `
              <div class="flex items-center justify-between px-3.5 py-3 rounded-2xl hover:bg-gray-50/80 transition-all group cursor-pointer border border-transparent hover:border-gray-100/50" data-group-row="${group.id}">
                <div class="flex items-center gap-3.5">
                  <div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                  </div>
                  <div class="flex flex-col">
                    <div class="font-semibold text-gray-900 text-sm">${group.name}</div>
                    <div class="text-[11px] text-gray-500 font-medium">${group.member_count || 0} members</div>
                  </div>
                </div>
                <button class="p-2 hover:bg-gray-200 rounded-xl text-gray-400 opacity-0 group-hover:opacity-100 transition-all btn-edit-group" data-group-id="${group.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            `).join('')}
          </div>
        ` : renderEmptyState()}
      </div>

      <button class="flex items-center justify-between rounded-[1.25rem] w-full transition-all mt-6 hover:bg-gray-50/80 p-3 group border border-transparent hover:border-gray-100/50" id="default-permissions-btn">
        <div class="flex items-center gap-3.5">
          <div class="p-2.5 bg-gray-100 rounded-full text-gray-500 group-hover:bg-gray-200 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <div class="text-left">
            <div class="text-sm font-bold text-gray-900">Default permissions</div>
            <div class="flex text-[11px] mt-0.5 text-gray-500 font-medium">applies to all users with the "user" role</div>
          </div>
        </div>
        <div class="text-gray-400 group-hover:text-gray-600 transition-colors mr-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </button>
    </div>
  `;

  const reload = async () => {
    await actions.reload?.();
  };

  container.querySelector('#create-group-btn')?.addEventListener('click', async () => {
    await openCreateModal({
      onRefresh: reload,
      onCreate: actions.onCreate,
    });
  });
  container.querySelector('#default-permissions-btn')?.addEventListener('click', async () => {
    await openDefaultPermissionsModal({ onRefresh: reload });
  });
  container.querySelectorAll('.btn-edit-group').forEach((btn) => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await openEditModal(btn.dataset.groupId, {
      onRefresh: reload,
      onUpdate: actions.onUpdate,
      onDelete: actions.onDelete,
      onMemberDelta: actions.onMemberDelta,
    });
  }));

  const searchInput = container.querySelector('#group-search-input');
  const clearSearchBtn = container.querySelector('#clear-search-btn');
  const clearSearchContainer = container.querySelector('#clear-search-container');

  searchInput?.addEventListener('input', (e) => {
    if (e.target.value) {
      clearSearchContainer?.classList.remove('hidden');
    } else {
      clearSearchContainer?.classList.add('hidden');
    }

    const query = String(e.target.value || '').toLowerCase();
    const groupItems = container.querySelectorAll('[data-group-row]');
    groupItems.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? 'flex' : 'none';
    });
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (!searchInput) return;
    searchInput.value = '';
    clearSearchContainer?.classList.add('hidden');
    searchInput.focus();
    searchInput.dispatchEvent(new Event('input'));
  });

  container.querySelector('#sort-groups-btn')?.addEventListener('click', () => {
    const next = nextGroupSort(sortKey);
    actions.onSortChange?.(next);
  });
}

export async function preloadGroupsData() {
  return fetchAdminGroups();
}
