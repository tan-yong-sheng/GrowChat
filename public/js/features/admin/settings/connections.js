import { apiFetch } from '../../../shared/api.js';
import { fetchAdminConnectionAccess } from '../../../shared/admin-access.js';
import {
  buildConnectionModalBodyMarkup,
  buildConnectionModalModelsMarkup,
} from '../../../shared/components/connection-modal.js';
import { sortModelsByActiveThenName } from '../../../shared/utils/model-state.js';
import { sortResourcesByEnabledThenLabel } from '../../../shared/utils/resource-sort.js';
import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import { broadcastConnectionsInvalidation } from '../../../shared/utils/connection-sync.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { renderButton } from '../../../shared/components/button.js';
import { clearModalHash, setModalHash } from '../../../shared/utils/modal-hash.js';
import { getAdminModalPreset, Z_INDEX_CLASSES } from '../modal-shell.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import {
  normalizeConnectionModelSelectionMode,
  resolveConnectionModelSelectionMode,
} from '../../../shared/utils/connection-model-selection.js';
import {
  cloneModelSelection,
  connectionApiTypeDetails,
  formatConnectionModelId,
  getConnectionProviderId,
  inflateManualConnectionModels,
  isCompatibleProviderType,
  normalizeProviderFamily,
  normalizeConnectionManualModels,
  normalizeConnectionRecord,
  normalizeModelRecord,
  providerDisplayLabel,
  providerUrlPlaceholder,
  resolveKeyLabel,
  resolveModalUrl,
  resolveUrlLabel,
  previewConnectionModalModels,
  buildSelectedConnectionModels,
  updateApiTypeDisplay,
} from './connections-helpers.js';

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function cloneAclRules(rules = [], normalizer = (rule) => rule) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => normalizer({ ...rule }))
    .filter((rule) => rule !== null && rule !== undefined);
}

function getAclRulesSignature(rules = [], normalizer) {
  return cloneAclRules(rules, normalizer)
    .map((rule) => ({
      principal_type: String(rule?.principal_type || '')
        .trim()
        .toLowerCase(),
      principal_id: String(rule?.principal_id || '').trim(),
      effect: String(rule?.effect || '')
        .trim()
        .toLowerCase(),
      action: String(rule?.action || '')
        .trim()
        .toLowerCase(),
    }))
    .sort(
      (a, b) =>
        a.principal_type.localeCompare(b.principal_type) ||
        a.principal_id.localeCompare(b.principal_id) ||
        a.action.localeCompare(b.action) ||
        a.effect.localeCompare(b.effect)
    )
    .map((rule) => `${rule.principal_type}:${rule.principal_id}:${rule.action}:${rule.effect}`)
    .join('|');
}

function buildModalConnectionPayload(scope = null, selectedConnection = null) {
  const root = scope || document;
  return {
    id: selectedConnection?.id || '',
    name: root.querySelector('#modal-conn-name')?.value || '',
    url: root.querySelector('#modal-conn-url')?.value || '',
    key: root.querySelector('#modal-conn-key')?.value || '',
    headers: root.querySelector('#modal-conn-headers')?.value || '',
    providerType: root.querySelector('#modal-conn-provider')?.value || 'openai',
    providerFamily: root.querySelector('#modal-conn-provider')?.value || 'openai',
    authType: selectedConnection?.authType || selectedConnection?.auth_type || '',
  };
}

const STANDARD_MODAL_PRESET = getAdminModalPreset('standard');

export function renderConnectionsSettings(container, data) {
  const isActiveTab = () => container?.dataset?.settingsTab === 'connections';
  const canManageAcls = data.capabilities?.canManageAcls !== false;
  const connectionsState =
    data.connectionsSettings ||
    (data.connectionsSettings = {
      loading: false,
      error: null,
      openai: {
        enabled: true,
        connections: [],
      },
      loaded: false,
      showModal: false,
      selectedConnection: null,
      modalModels: [],
      modalModelsLoading: false,
      modalModelsError: null,
      modalModelsSelection: new Set(),
      modalModelsOriginal: new Set(),
      modalModelsConnectionId: null,
      modalSaving: false,
      modalModelsQuery: '',
      modelOverrides: new Map(),
      modalMode: 'create',
    });

  // Migration for old state format
  if (connectionsState.openai && !connectionsState.openai.connections) {
    const oldUrl = connectionsState.openai.url || 'https://api.openai.com/v1';
    const oldKey = connectionsState.openai.key || '';
    connectionsState.openai.connections = [
      {
        id: 'default',
        name: 'OpenAI',
        url: oldUrl,
        key: oldKey,
        headers: '',
        providerType: 'openai',
        apiType: connectionApiTypeDetails('openai').value,
      },
    ];
    delete connectionsState.openai.url;
    delete connectionsState.openai.key;
  }

  const renderLoadingSkeleton = () => `
    <div class="space-y-2">
      ${Array.from({ length: 5 })
        .map(
          () => `
        <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 animate-pulse">
          <div class="flex flex-col min-w-0 flex-1 space-y-2">
            <div class="h-3.5 w-44 bg-gray-200 rounded-full"></div>
            <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
            <div class="h-2.5 w-32 bg-gray-100 rounded-full"></div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="h-6 w-12 rounded-full bg-gray-100 border border-gray-200"></div>
            <div class="h-6 w-6 rounded-full bg-gray-100 border border-gray-200"></div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;

  const getConnectionsListMarkup = () => {
    if (connectionsState.loading) {
      return renderLoadingSkeleton();
    }
    if (connectionsState.openai.connections.length === 0) {
      return '<div class="py-10 text-center text-sm text-gray-700">No connections configured</div>';
    }
    const deduped = new Map();
    connectionsState.openai.connections.forEach((conn) => {
      const key = `${conn?.source || 'manual'}::${conn?.id || ''}::${conn?.url || ''}`;
      if (!deduped.has(key)) deduped.set(key, conn);
    });
    return Array.from(deduped.values())
      .map((conn) => {
        const safeId = escapeHtml(conn.id);
        const safeName = escapeHtml(conn.name || providerDisplayLabel(conn.providerType));
        const safeUrl = escapeHtml(conn.url || '');
        const safeProvider = escapeHtml(providerDisplayLabel(conn.providerType));
        return `
      <div data-connection-row="${safeId}" class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2 border-b border-gray-50 last:border-0 ${conn.enabled === false ? 'opacity-70' : ''}">
        <div class="flex flex-col min-w-0">
          <div class="text-xs font-medium text-gray-900">${safeName}</div>
          <div class="text-[10px] text-gray-700 font-mono">${safeUrl}</div>
          <div class="text-[10px] text-gray-700 mt-0.5">${safeProvider}</div>
          <div data-connection-disabled-badge class="mt-0.5 inline-flex w-fit items-center rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-700 ${conn.enabled === false ? '' : 'hidden'}">Disabled</div>
          ${conn.readOnly ? '<div class="text-[10px] text-gray-700 mt-0.5">Read-only connection</div>' : ''}
        </div>
        <div class="flex items-center justify-end gap-3 self-end sm:self-auto flex-wrap">
          <button
            data-id="${safeId}"
            class="connection-acl-btn inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 transition ${conn.enabled === false || !canManageAcls ? 'hidden' : ''}"
            title="Edit access rules"
            aria-label="Edit access rules"
            ${canManageAcls ? '' : 'disabled aria-disabled="true"'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Zm4.5 3.75v2.25" />
            </svg>
          </button>
          <button data-id="${safeId}" class="edit-connection-btn p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors rounded ${conn.readOnly ? 'hidden' : ''}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          <button data-id="${safeId}" class="connection-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${conn.enabled === false ? 'bg-gray-200' : 'bg-black'}">
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${conn.enabled === false ? 'translate-x-0' : 'translate-x-4'}"></span>
          </button>
        </div>
      </div>
    `;
      })
      .join('');
  };

  const renderConnectionsList = () => {
    const list = container.querySelector('#connections-list');
    if (!list) return;
    list.innerHTML = getConnectionsListMarkup();
  };

  const openConnectionAccessModal = async (connection, { _onApply } = {}) => {
    if (!connection?.id) return;
    const { modal, close } = createAdminAclModalShell({
      idsPrefix: 'connection-acl',
      title: 'Connection Access',
      subtitle: connection.name || connection.id,
      closeAttr: 'data-close-connection-access',
    });

    const listEl = modal.querySelector('#connection-acl-list');
    const errorEl = modal.querySelector('#connection-acl-error');
    const saveErrorEl = modal.querySelector('#connection-acl-save-error');
    const summaryEl = modal.querySelector('#connection-acl-summary');
    const countEl = modal.querySelector('#connection-acl-count');
    const reasonEl = modal.querySelector('#connection-acl-reason');
    const saveBtn = modal.querySelector('#connection-acl-save-btn');
    let baseRules = [];

    const state = {
      loading: true,
      saving: false,
      error: null,
      groups: [],
      rulesByGroup: new Map(),
    };

    const renderSummary = () => {
      let reasonText = 'No explicit rules. Admin users can access by default.';
      if (summaryEl) {
        const allowCount = Array.from(state.rulesByGroup.values()).filter(
          (value) => value === 'allow'
        ).length;
        const denyCount = Array.from(state.rulesByGroup.values()).filter(
          (value) => value === 'deny'
        ).length;
        if (!allowCount && !denyCount) {
          summaryEl.textContent = 'No access rules';
          reasonText = 'No explicit rules. Admin users can access by default.';
        } else {
          const parts = [];
          if (allowCount) parts.push(`${allowCount} allow`);
          if (denyCount) parts.push(`${denyCount} deny`);
          summaryEl.textContent = parts.join(', ');
          if (allowCount && denyCount) {
            reasonText =
              'Explicit allow rules share this connection with selected groups. Deny rules override allow rules.';
          } else if (denyCount) {
            reasonText = 'This connection is explicitly blocked for selected groups.';
          } else {
            reasonText = 'This connection is shared with selected groups.';
          }
        }
      }
      if (countEl) {
        countEl.textContent = state.groups.length ? `${state.groups.length} groups` : '';
      }
      if (reasonEl) {
        reasonEl.textContent = reasonText;
      }
    };

    const updateSaveButton = () => {
      if (!saveBtn) return;
      setModalSaveButtonState(saveBtn, {
        enabled: true,
        saving: state.saving,
        label: 'Save',
        enabledClass:
          'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800',
        disabledClass:
          'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
      });
    };

    const renderList = () => {
      if (!listEl) return;
      if (state.loading) {
        listEl.innerHTML = `
          <div class="space-y-2">
            ${Array.from({ length: 5 })
              .map(
                () => `
              <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 animate-pulse">
                <div class="flex flex-col min-w-0 flex-1 space-y-2">
                  <div class="h-3.5 w-40 bg-gray-200 rounded-full"></div>
                  <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
                </div>
                <div class="h-4 w-4 bg-gray-100 rounded border border-gray-200"></div>
              </div>
            `
              )
              .join('')}
          </div>
        `;
        return;
      }
      if (errorEl) {
        errorEl.textContent = state.error || '';
        errorEl.classList.toggle('hidden', !state.error);
      }
      if (!state.groups.length) {
        listEl.innerHTML =
          '<div class="text-sm text-gray-500 py-6 text-center">No resource teams available.</div>';
        return;
      }
      listEl.innerHTML = state.groups
        .map((group) => {
          const groupId = group.id;
          const effect = state.rulesByGroup.get(groupId) || 'none';
          const badge = group.is_system
            ? '<span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">System</span>'
            : '';
          return `
          <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 hover:border-gray-300">
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2">
                <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(group.name || group.id)}</div>
                ${badge}
              </div>
              <div class="text-[11px] text-gray-500 truncate">${escapeHtml(group.description || group.id)}</div>
            </div>
            <select class="connection-acl-effect rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-gray-400" data-group-id="${escapeHtml(groupId)}">
              <option value="none" ${effect === 'none' ? 'selected' : ''}>No access</option>
              <option value="allow" ${effect === 'allow' ? 'selected' : ''}>Allow</option>
              <option value="deny" ${effect === 'deny' ? 'selected' : ''}>Deny</option>
            </select>
          </div>
        `;
        })
        .join('');

      listEl.querySelectorAll('.connection-acl-effect').forEach((select) => {
        select.addEventListener('change', () => {
          const groupId = select.getAttribute('data-group-id');
          if (!groupId) return;
          const effect = String(select.value || 'none');
          if (effect === 'none') {
            state.rulesByGroup.delete(groupId);
          } else {
            state.rulesByGroup.set(groupId, effect === 'deny' ? 'deny' : 'allow');
          }
          renderSummary();
        });
      });
    };

    const loadAccess = async () => {
      state.loading = true;
      state.error = null;
      renderList();
      try {
        const payload = await fetchAdminConnectionAccess(connection.id);
        state.groups = Array.isArray(payload.groups) ? payload.groups : [];
        baseRules = cloneAclRules(payload.rules || []);
        state.rulesByGroup = new Map(
          (Array.isArray(baseRules) ? baseRules : [])
            .filter((rule) => String(rule?.principal_type || '').toLowerCase() === 'group')
            .map((rule) => [
              String(rule.principal_id || '').trim(),
              String(rule.effect || 'allow')
                .trim()
                .toLowerCase() === 'deny'
                ? 'deny'
                : 'allow',
            ])
            .filter(([groupId]) => Boolean(groupId))
        );
      } catch (err) {
        state.error = err.message || 'Failed to load connection access';
      } finally {
        state.loading = false;
        renderSummary();
        renderList();
      }
    };

    saveBtn?.addEventListener('click', async () => {
      if (state.saving) return;
      if (saveErrorEl) saveErrorEl.textContent = '';
      state.saving = true;
      updateSaveButton();
      try {
        const rules = Array.from(state.rulesByGroup.entries()).map(([groupId, effect]) => ({
          principal_type: 'group',
          principal_id: groupId,
          effect,
          action: 'use',
        }));
        const sameAsBase = getAclRulesSignature(rules) === getAclRulesSignature(baseRules);

        // Make immediate API call
        const res = await apiFetch('/api/admin/openai/connections', {
          method: 'PUT',
          body: JSON.stringify({
            enabled: connectionsState.openai.enabled,
            connections: connectionsState.openai.connections
              .filter((c) => !c.readOnly)
              .map((conn) => ({
                ...conn,
                manualModels: normalizeConnectionManualModels(conn.manualModels),
              })),
            model_updates: [],
            access_updates: sameAsBase
              ? []
              : [
                  {
                    connection_id: connection.id,
                    rules: cloneAclRules(rules),
                  },
                ],
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to save connection access');
        }

        broadcastConnectionsInvalidation();
        close();
      } catch (err) {
        if (saveErrorEl)
          saveErrorEl.textContent = err.message || 'Failed to save connection access';
      } finally {
        state.saving = false;
        updateSaveButton();
      }
    });

    updateSaveButton();
    renderSummary();
    renderList();
    loadAccess();
    document.body.appendChild(modal);
  };

  const render = () => {
    if (!isActiveTab()) return;
    const isReadOnlyConnection = Boolean(connectionsState.selectedConnection?.readOnly);
    const standardModalZIndexClass =
      Z_INDEX_CLASSES[STANDARD_MODAL_PRESET.zIndex] || `z-[${STANDARD_MODAL_PRESET.zIndex}]`;
    if (!Z_INDEX_CLASSES[STANDARD_MODAL_PRESET.zIndex]) {
      console.error(
        `[connections] Unmapped z-index ${STANDARD_MODAL_PRESET.zIndex}; add it to Z_INDEX_CLASSES so Tailwind JIT generates the CSS. Falling back to z-[${STANDARD_MODAL_PRESET.zIndex}].`
      );
    }
    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        <div class="pt-0.5 pb-6 bg-white">
          <div class="max-w-2xl mx-auto w-full flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Connections</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <div class="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pr-2">
                <div class="flex flex-col">
                  <div class="text-xs font-medium text-gray-900">LLM Providers</div>
                  <div class="text-[10px] text-gray-400">Manage each provider directly below.</div>
                </div>
              </div>
            </section>

            <section id="manage-connections-section" class="space-y-1 mt-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage LLM Chat Providers</div>
                <button id="add-connection" class="shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              <hr class="border-gray-100/30 my-2" />

              <div id="connections-list" class="space-y-2">
                ${getConnectionsListMarkup()}
              </div>
            </section>

            <div id="connections-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>

      <!-- Edit Connection Modal -->
      <div id="edit-connection-modal" class="${STANDARD_MODAL_PRESET.outerClass} ${standardModalZIndexClass} ${connectionsState.showModal ? '' : 'hidden'}">
        <div class="${STANDARD_MODAL_PRESET.overlayClass}"></div>
        <div class="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
          <div class="px-6 pt-6 pb-4 flex justify-between items-center border-b border-gray-50">
            <h3 id="modal-title" class="text-lg font-medium text-gray-900">${connectionsState.selectedConnection ? 'Edit Connection' : 'Add Connection'}</h3>
            <button type="button" id="close-modal" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
            ${buildConnectionModalBodyMarkup({
              providerType: connectionsState.selectedConnection?.providerType || 'openai',
              name: connectionsState.selectedConnection?.name || '',
              url: connectionsState.selectedConnection?.url || '',
              keyValue: '',
              hasKey: Boolean(
                connectionsState.selectedConnection?.key ||
                connectionsState.selectedConnection?.keyMasked
              ),
              headers: connectionsState.selectedConnection?.headers || '',
              apiType: connectionApiTypeDetails(
                connectionsState.selectedConnection?.providerType || 'openai'
              ),
              canManage: true,
              showTestButton: !isReadOnlyConnection,
              testHiddenClass: isReadOnlyConnection ? ' hidden' : '',
              manualModelsHiddenClass: isReadOnlyConnection ? ' hidden' : '',
              disabledAttr: '',
              disabledControlClass: '',
              testButtonAttrs: '',
              testMessageAttrs: '',
              models: connectionsState.modalModels || [],
              query: connectionsState.modalModelsQuery || '',
              selection: connectionsState.modalModelsSelection || new Set(),
              loadingModels: Boolean(connectionsState.modalModelsLoading),
              modelsError: connectionsState.modalModelsError || '',
              showKeyHint: true,
            })}
          </div>

          <div class="px-6 py-6 flex justify-end gap-3 border-t border-gray-50">
            ${renderButton({ label: 'Delete', variant: 'ghost', id: 'delete-connection', className: `px-5 py-1.5 focus:ring-red-500 active:scale-95 ${connectionsState.selectedConnection ? '' : 'hidden'}` })}
            ${renderButton({ label: 'Save', variant: 'primary', id: 'save-modal', className: 'px-5 py-1.5 active:scale-95' })}
          </div>
        </div>
      </div>
    `;

    bindEvents();
  };

  const loadConnections = async () => {
    if (connectionsState.loaded) return;
    connectionsState.loaded = true;
    try {
      const res = await apiFetch('/api/admin/openai/connections?include_disabled=1');
      if (!res.ok) {
        throw new Error('Failed to load connections');
      }
      const payload = await res.json();
      connectionsState.openai.enabled = payload?.enabled !== false;
      connectionsState.openai.connections = sortResourcesByEnabledThenLabel(
        Array.isArray(payload?.connections)
          ? payload.connections.map((conn) => normalizeConnectionRecord(conn))
          : []
      );
      if (isActiveTab()) render();
    } catch (err) {
      console.warn('Failed to load connections', err);
    }
  };

  const setTestStatus = (status, message = '', scope = container) => {
    const messageEl = scope.querySelector('#connection-test-message');
    if (messageEl) {
      messageEl.textContent = message || '';
      messageEl.classList.toggle('hidden', !message);
      messageEl.classList.toggle('text-red-500', status === 'error');
      messageEl.classList.toggle('text-gray-900', status === 'success');
      messageEl.classList.toggle('text-gray-400', status === 'idle' || status === 'testing');
    }
  };

  const updateConnectionToggle = (btn, enabled) => {
    if (!btn) return;
    btn.classList.toggle('bg-black', enabled);
    btn.classList.toggle('bg-gray-200', !enabled);
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', enabled);
      knob.classList.toggle('translate-x-0', !enabled);
    }
  };

  const showFeedback = (message, type = 'success') => {
    const feedback = container.querySelector('#connections-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    if (type === 'success') {
      feedback.className =
        'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
    } else if (type === 'error') {
      feedback.className =
        'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
    }
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  };

  const fillModalFields = (connection, scope = container) => {
    const nameInput = scope.querySelector('#modal-conn-name');
    const urlInput = scope.querySelector('#modal-conn-url');
    const keyInput = scope.querySelector('#modal-conn-key');
    const headersInput = scope.querySelector('#modal-conn-headers');
    const providerSelect = scope.querySelector('#modal-conn-provider');
    const testButton = scope.querySelector('#test-connection');
    const testMessage = scope.querySelector('#connection-test-message');
    const isReadOnlyConnection = Boolean(connection?.readOnly);
    if (nameInput) nameInput.value = connection?.name || '';
    if (urlInput) urlInput.value = connection?.url || '';
    if (keyInput) keyInput.value = '';
    if (headersInput) headersInput.value = connection?.headers || '';
    if (providerSelect) providerSelect.value = connection?.providerType || 'openai';
    if (urlInput) {
      const providerType = providerSelect?.value || connection?.providerType || 'openai';
      const defaultUrl = providerUrlPlaceholder(providerType);
      urlInput.placeholder = defaultUrl;
      if (
        !isCompatibleProviderType(providerType) &&
        !String(urlInput.value || '').trim() &&
        !isReadOnlyConnection
      ) {
        urlInput.value = defaultUrl;
      }
    }
    if (nameInput)
      nameInput.placeholder = `e.g. ${providerDisplayLabel(providerSelect?.value || connection?.providerType || 'openai')}`;
    if (nameInput) nameInput.disabled = isReadOnlyConnection;
    if (urlInput) urlInput.disabled = isReadOnlyConnection;
    if (keyInput) keyInput.disabled = isReadOnlyConnection;
    if (headersInput) headersInput.disabled = isReadOnlyConnection;
    if (providerSelect) providerSelect.disabled = isReadOnlyConnection;
    if (nameInput) nameInput.classList.toggle('text-gray-400', isReadOnlyConnection);
    if (urlInput) urlInput.classList.toggle('text-gray-400', isReadOnlyConnection);
    if (keyInput) keyInput.classList.toggle('text-gray-400', isReadOnlyConnection);
    if (headersInput) headersInput.classList.toggle('text-gray-400', isReadOnlyConnection);
    if (providerSelect) providerSelect.classList.toggle('text-gray-400', isReadOnlyConnection);
    const title = scope.querySelector('#modal-title');
    if (title)
      title.textContent =
        connectionsState.modalMode === 'update' ? 'Edit Connection' : 'Add Connection';
    const providerHint = scope.querySelector('#modal-conn-provider-hint');
    if (providerHint)
      providerHint.textContent = providerDisplayLabel(
        providerSelect?.value || connection?.providerType || 'openai'
      );
    const urlLabel = scope.querySelector('#modal-conn-url-label');
    if (urlLabel)
      urlLabel.textContent = resolveUrlLabel(
        providerSelect?.value || connection?.providerType || 'openai'
      );
    const urlHint = scope.querySelector('#modal-conn-url-hint');
    if (urlHint) {
      urlHint.textContent = isCompatibleProviderType(
        providerSelect?.value || connection?.providerType || 'openai'
      )
        ? 'Required for compatible providers.'
        : 'Uses the built-in default if left blank.';
    }
    const keyLabel = scope.querySelector('#modal-conn-key-label');
    if (keyLabel) keyLabel.textContent = resolveKeyLabel();
    const keyHint = scope.querySelector('#modal-conn-key-hint');
    if (keyHint) {
      keyHint.textContent =
        connection?.hasKey || connection?.keyMasked
          ? 'A key is already saved. Leave this blank to keep it.'
          : 'Optional for providers that do not require a key.';
    }
    updateApiTypeDisplay(scope, providerSelect?.value || connection?.providerType || 'openai');
    const deleteBtn = scope.querySelector('#delete-connection');
    if (deleteBtn)
      deleteBtn.classList.toggle(
        'hidden',
        connectionsState.modalMode !== 'update' || isReadOnlyConnection
      );
    if (testButton) testButton.classList.toggle('hidden', isReadOnlyConnection);
    if (testMessage) testMessage.classList.toggle('hidden', isReadOnlyConnection);
    setTestStatus('idle', '', scope);
  };

  const renderModalModels = (scope = container) => {
    const list = scope.querySelector('#modal-models-list');
    const status = scope.querySelector('#modal-models-status');
    if (!list || !status) return;
    if (
      !connectionsState.selectedConnection &&
      (!Array.isArray(connectionsState.modalModels) || connectionsState.modalModels.length === 0)
    ) {
      list.innerHTML =
        '<div class="px-4 py-3 text-xs text-gray-400">Click Verify to load models from this connection.</div>';
      status.textContent = '';
      return;
    }
    if (connectionsState.modalModelsLoading) {
      list.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Loading models...</div>';
      status.textContent = '';
      return;
    }
    if (connectionsState.modalModelsError) {
      list.innerHTML = '<div class="px-4 py-3 text-xs text-red-500">Failed to load models.</div>';
      status.textContent = connectionsState.modalModelsError;
      status.classList.add('text-red-500');
      return;
    }
    const models = sortModelsByActiveThenName(connectionsState.modalModels);
    const selected = connectionsState.modalModelsSelection || new Set();
    if (!models.length) {
      list.innerHTML =
        '<div class="px-4 py-3 text-xs text-gray-400">No models discovered for this connection.</div>';
      status.textContent = '';
      return;
    }
    list.innerHTML = buildConnectionModalModelsMarkup(
      models,
      connectionsState.modalModelsQuery,
      selected,
      connectionsState.modalModelsLoading,
      connectionsState.modalModelsError || ''
    );
    status.classList.remove('text-red-500');
    status.textContent = models.length
      ? `Models selected in this connection: ${selected.size}`
      : '';
  };

  const addManualModalModel = (scope = container) => {
    const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
    const connection = connectionsState.selectedConnection;
    if (!connection?.id || connection?.readOnly) return;
    const input = modalRoot.querySelector('#modal-manual-model-id');
    if (!input) return;
    const raw = String(input.value || '').trim();
    const safe = raw.replace(/^models\//i, '');
    if (!safe) {
      setTestStatus('error', 'Model name is required', modalRoot);
      return;
    }
    const providerId = getConnectionProviderId(connection);
    const fullId = formatConnectionModelId(providerId, safe);
    if (!fullId) {
      setTestStatus('error', 'Model name is required', modalRoot);
      return;
    }
    const nextModels = Array.isArray(connectionsState.modalModels)
      ? [...connectionsState.modalModels]
      : [];
    const manualRecord = normalizeModelRecord({
      id: fullId,
      name: safe,
      manual: true,
      manualModelId: safe,
    });
    const existingIndex = nextModels.findIndex((model) => model.id === fullId);
    if (existingIndex === -1) {
      nextModels.push(manualRecord);
    } else {
      nextModels[existingIndex] = {
        ...nextModels[existingIndex],
        ...manualRecord,
        manual: true,
        manualModelId: safe,
      };
    }
    const nextManualModels = normalizeConnectionManualModels(connection.manualModels);
    if (!nextManualModels.some((model) => model.modelId === safe)) {
      nextManualModels.push({ modelId: safe, name: safe });
    }
    connectionsState.modalModelsError = null;
    connectionsState.modalModelsLoading = false;
    connection.manualModels = nextManualModels;
    connectionsState.modalModels = nextModels;
    connectionsState.modalModelsSelection = new Set(connectionsState.modalModelsSelection || []);
    connectionsState.modalModelsSelection.add(fullId);
    connectionsState.modalModelsOriginal = new Set(connectionsState.modalModelsOriginal || []);
    connectionsState.modalModelsOriginal.add(fullId);
    input.value = '';
    renderModalModels(modalRoot);
  };

  const loadModalModels = async (connection, scope = container) => {
    const connectionId = String(connection?.id || '').trim();
    if (!connectionId) {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsQuery = '';
      connectionsState.modalModelsConnectionId = null;
      connectionsState.modalModelsError = null;
      connectionsState.modalModelsLoading = false;
      renderModalModels(scope);
      return;
    }

    const seedModels = inflateManualConnectionModels(connection);
    const seedSelection = new Set(seedModels.map((model) => model.id));
    const inferredMode =
      normalizeConnectionModelSelectionMode(
        connection?.manualModelsMode || connection?.manual_models_mode
      ) || (seedSelection.size > 0 ? 'some' : 'all');

    connectionsState.modalModelsLoading = true;
    connectionsState.modalModelsError = null;
    connectionsState.modalModelsConnectionId = connectionId;
    connectionsState.modalModels = seedModels;
    connectionsState.modalModelsSelection = seedSelection;
    connectionsState.modalModelsOriginal = cloneModelSelection(seedSelection);
    renderModalModels(scope);

    try {
      const res = await apiFetch('/api/admin/models?limit=0&offset=0&include_disabled=1');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.details?.message || err.message || err.error || 'Failed to load models'
        );
      }
      const payload = await res.json();
      const allModels = Array.isArray(payload?.models) ? payload.models : [];
      const preview = previewConnectionModalModels(seedModels, seedSelection, allModels, {
        ...connection,
        manualModelsMode: inferredMode,
      });
      connectionsState.modalModels = preview.models;
      connectionsState.modalModelsSelection = preview.selection;
      connectionsState.modalModelsOriginal = preview.original;
    } catch (err) {
      connectionsState.modalModelsError = err.message || 'Failed to load models';
    } finally {
      connectionsState.modalModelsLoading = false;
      renderModalModels(scope);
    }
  };

  const refreshModalModels = async (scope = container) => {
    const modalRoot = scope.querySelector('#edit-connection-modal') || scope;
    const payload = buildModalConnectionPayload(modalRoot, connectionsState.selectedConnection);
    const resolvedUrl = resolveModalUrl(payload.providerType, payload.url);
    if (!resolvedUrl) {
      setTestStatus('error', 'URL is required for compatible providers', modalRoot);
      return;
    }
    payload.url = resolvedUrl;

    connectionsState.modalModelsLoading = true;
    connectionsState.modalModelsError = null;
    renderModalModels(modalRoot);
    setTestStatus('testing', 'Verifying connection and loading models...', modalRoot);

    try {
      const res = await apiFetch('/api/admin/openai/connections/test', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const responsePayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          responsePayload.details?.message ||
            responsePayload.message ||
            responsePayload.error ||
            'Connection failed'
        );
      }
      if (Array.isArray(responsePayload.models)) {
        const preview = previewConnectionModalModels(
          connectionsState.modalModels,
          connectionsState.modalModelsSelection,
          responsePayload.models,
          connectionsState.selectedConnection
        );
        connectionsState.modalModels = preview.models;
        connectionsState.modalModelsSelection = preview.selection;
        connectionsState.modalModelsOriginal = preview.original;
        renderModalModels(modalRoot);
        const existingManualModels = connectionsState.selectedConnection
          ? inflateManualConnectionModels(connectionsState.selectedConnection)
          : [];
        if (existingManualModels.length > 0) {
          const merged = new Map(
            (connectionsState.modalModels || []).map((model) => [model.id, model])
          );
          existingManualModels.forEach((model) => {
            if (!merged.has(model.id)) {
              merged.set(model.id, model);
              connectionsState.modalModelsSelection.add(model.id);
              connectionsState.modalModelsOriginal.add(model.id);
            }
          });
          connectionsState.modalModels = Array.from(merged.values());
          renderModalModels(modalRoot);
        }
      } else {
        connectionsState.modalModels = [];
        connectionsState.modalModelsSelection = new Set();
        connectionsState.modalModelsOriginal = new Set();
      }
      const count = Array.isArray(responsePayload.models) ? responsePayload.models.length : 0;
      setTestStatus(
        'success',
        count > 0 ? `Connection successful. ${count} models loaded.` : 'Connection successful.',
        modalRoot
      );
      renderModalModels(modalRoot);
    } catch (err) {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsError = err.message || 'Failed to load models';
      renderModalModels(modalRoot);
      setTestStatus('error', err.message || 'Connection failed', modalRoot);
    } finally {
      connectionsState.modalModelsLoading = false;
      renderModalModels(modalRoot);
    }
  };

  const updateModalSaveButton = (scope = container) => {
    const btn = scope.querySelector('#save-modal');
    if (!btn) return;
    const saving = connectionsState.modalSaving;
    btn.disabled = saving;
    btn.textContent = saving ? 'Saving...' : 'Save';
    btn.classList.toggle('opacity-60', saving);
    btn.classList.toggle('cursor-not-allowed', saving);
  };

  const openModal = (connection) => {
    if (connection) {
      connectionsState.modalMode = 'update';
      connectionsState.selectedConnection = { ...connection };
      if (connectionsState.selectedConnection.enabled === undefined) {
        connectionsState.selectedConnection.enabled = true;
      }
    } else {
      connectionsState.modalMode = 'create';
      connectionsState.selectedConnection = {
        id: `conn-${Math.random().toString(36).slice(2, 10)}`,
        name: '',
        url: '',
        key: '',
        headers: '',
        providerType: 'openai',
        providerFamily: 'openai',
        apiType: connectionApiTypeDetails('openai').value,
        enabled: true,
        manualModels: [],
      };
    }
    connectionsState.showModal = true;
    const modal = container.querySelector('#edit-connection-modal, #add-connection-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }
    setModalHash(
      connectionsState.modalMode === 'update' ? 'edit-connection-modal' : 'add-connection-modal'
    );
    if (!connectionsState.selectedConnection) {
      connectionsState.modalModels = [];
      connectionsState.modalModelsSelection = new Set();
      connectionsState.modalModelsOriginal = new Set();
      connectionsState.modalModelsQuery = '';
    }
    fillModalFields(connectionsState.selectedConnection, modal || container);
    loadModalModels(connectionsState.selectedConnection, modal || container);
    updateModalSaveButton(modal || container);
  };

  const closeModal = () => {
    connectionsState.showModal = false;
    connectionsState.modalMode = 'create';
    const modal = container.querySelector('#edit-connection-modal, #add-connection-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    clearModalHash('edit-connection-modal');
    clearModalHash('add-connection-modal');
  };

  const bindEvents = () => {
    container.querySelector('#add-connection')?.addEventListener('click', () => {
      openModal(null);
    });

    const list = container.querySelector('#connections-list');
    list?.addEventListener('click', (e) => {
      const toggle = e.target.closest('.connection-toggle');
      if (toggle) {
        const id = toggle.dataset.id;
        const connection = connectionsState.openai.connections.find((c) => c.id === id);
        if (connection) {
          const previousEnabled = connection.enabled !== false;
          const nextEnabled = !previousEnabled;

          // Optimistic UI update
          connection.enabled = nextEnabled;
          const enabled = connection.enabled !== false;
          const row = toggle.closest('[data-connection-row]');
          updateConnectionToggle(toggle, enabled);
          if (row) {
            row.classList.toggle('opacity-70', !enabled);
            const badge = row.querySelector('[data-connection-disabled-badge]');
            if (badge) badge.classList.toggle('hidden', enabled);
            const aclBtn = row.querySelector('.connection-acl-btn');
            if (aclBtn) aclBtn.classList.toggle('hidden', !enabled || !canManageAcls);
          }

          // Make immediate API call
          (async () => {
            try {
              const manualConnections = connectionsState.openai.connections
                .filter((c) => !c.readOnly)
                .map((conn) => ({
                  ...conn,
                  manualModels: normalizeConnectionManualModels(conn.manualModels),
                }));
              const res = await apiFetch('/api/admin/openai/connections', {
                method: 'PUT',
                body: JSON.stringify({
                  enabled: connectionsState.openai.enabled,
                  connections: manualConnections,
                  model_updates: [],
                  access_updates: [],
                }),
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || 'Failed to save connection');
              }

              broadcastModelsInvalidation();
              broadcastConnectionsInvalidation();
              showFeedback('Connection updated', 'success');
              data.modelsSettingsInvalidate = Date.now();
              if (data.generalSettings) {
                data.generalSettings.models = [];
                data.generalSettings.modelsInvalidateToken = data.modelsSettingsInvalidate;
              }
            } catch (err) {
              // Rollback on error
              connection.enabled = previousEnabled;
              const enabled = connection.enabled !== false;
              updateConnectionToggle(toggle, enabled);
              if (row) {
                row.classList.toggle('opacity-70', !enabled);
                const badge = row.querySelector('[data-connection-disabled-badge]');
                if (badge) badge.classList.toggle('hidden', enabled);
                const aclBtn = row.querySelector('.connection-acl-btn');
                if (aclBtn) aclBtn.classList.toggle('hidden', !enabled || !canManageAcls);
              }
              showFeedback(err.message || 'Failed to update connection', 'error');
            }
          })();
        }
        return;
      }
      const aclBtn = e.target.closest('.connection-acl-btn');
      if (aclBtn) {
        if (!canManageAcls) return;
        const id = aclBtn.dataset.id;
        const connection = connectionsState.openai.connections.find((c) => c.id === id);
        if (connection) {
          openConnectionAccessModal(connection);
        }
        return;
      }
      const btn = e.target.closest('.edit-connection-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      const connection = connectionsState.openai.connections.find((c) => c.id === id);
      openModal(connection || null);
    });

    container.querySelector('#close-modal')?.addEventListener('click', () => {
      closeModal();
    });

    let testInFlight = false;
    container.querySelector('#test-connection')?.addEventListener('click', async () => {
      if (testInFlight) return;
      testInFlight = true;
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      setTestStatus('testing', 'Testing connection...', modalRoot);
      try {
        await refreshModalModels(modalRoot);
      } catch (err) {
        setTestStatus('error', err.message || 'Connection failed', modalRoot);
      } finally {
        testInFlight = false;
      }
    });

    container.querySelector('#save-modal')?.addEventListener('click', async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (connectionsState.modalSaving) return;
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      const name = modalRoot.querySelector('#modal-conn-name').value;
      const url = modalRoot.querySelector('#modal-conn-url').value;
      const keyValue = modalRoot.querySelector('#modal-conn-key').value;
      const headers = modalRoot.querySelector('#modal-conn-headers').value;
      const providerType = modalRoot.querySelector('#modal-conn-provider')?.value || 'openai';
      const providerFamily = normalizeProviderFamily(providerType);
      const apiType = connectionApiTypeDetails(providerType).value;
      const resolvedUrl = resolveModalUrl(providerType, url);
      if (!resolvedUrl) {
        setTestStatus('error', 'URL is required for compatible providers', modalRoot);
        return;
      }
      const enabled = connectionsState.selectedConnection?.enabled !== false;
      const connection = connectionsState.selectedConnection;
      const key = String(keyValue || '').trim();
      const models = connectionsState.modalModels || [];
      const selected = connectionsState.modalModelsSelection || new Set();
      const manualModels = buildSelectedConnectionModels(
        models,
        selected,
        connectionsState.selectedConnection
      );
      const existingManualModelsMode =
        normalizeConnectionModelSelectionMode(
          connectionsState.selectedConnection?.manualModelsMode ||
            connectionsState.selectedConnection?.manual_models_mode
        ) || 'all';
      const manualModelsMode =
        Array.isArray(models) && models.length > 0
          ? resolveConnectionModelSelectionMode(models, selected)
          : existingManualModelsMode;

      // Store previous state for rollback
      const previousConnections = connectionsState.openai.connections.slice();
      const previousSelectedConnection = connection ? { ...connection } : null;

      // Build the connection object to save
      let connectionToSave;
      let index = -1;
      if (connection?.id) {
        index = connectionsState.openai.connections.findIndex((c) => c.id === connection.id);
        if (index !== -1) {
          connectionToSave = {
            ...connectionsState.openai.connections[index],
            name,
            url: resolvedUrl,
            headers,
            providerType,
            providerFamily,
            apiType,
            enabled,
            manualModels,
            manualModelsMode,
            ...(key ? { key } : {}),
          };
        } else {
          const nextId =
            connection.id ||
            connectionsState.selectedConnection?.id ||
            Math.random().toString(36).substr(2, 9);
          connectionToSave = {
            id: nextId,
            name,
            url: resolvedUrl,
            key,
            headers,
            providerType,
            providerFamily,
            apiType,
            enabled,
            manualModels,
            manualModelsMode,
          };
        }
      } else {
        const nextId =
          connectionsState.selectedConnection?.id || Math.random().toString(36).substr(2, 9);
        connectionToSave = {
          id: nextId,
          name,
          url: resolvedUrl,
          key,
          headers,
          providerType,
          providerFamily,
          apiType,
          enabled,
          manualModels,
          manualModelsMode,
        };
      }

      // Make immediate API call
      connectionsState.modalSaving = true;
      updateModalSaveButton(modalRoot);
      try {
        // Update state with new connection
        if (index !== -1) {
          connectionsState.openai.connections[index] = connectionToSave;
        } else {
          connectionsState.openai.connections.push(connectionToSave);
        }

        const manualConnectionsToSave = connectionsState.openai.connections
          .filter((c) => !c.readOnly)
          .map((conn) => ({
            ...conn,
            manualModels: normalizeConnectionManualModels(conn.manualModels),
          }));
        const res = await apiFetch('/api/admin/openai/connections', {
          method: 'PUT',
          body: JSON.stringify({
            enabled: connectionsState.openai.enabled,
            connections: manualConnectionsToSave,
            model_updates: [],
            access_updates: [],
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to save connection');
        }

        broadcastModelsInvalidation();
        broadcastConnectionsInvalidation();
        showFeedback('Connection saved', 'success');
        data.modelsSettingsInvalidate = Date.now();
        if (data.generalSettings) {
          data.generalSettings.models = [];
          data.generalSettings.modelsInvalidateToken = data.modelsSettingsInvalidate;
        }
        closeModal();
        renderConnectionsList();
      } catch (err) {
        // Rollback on error
        connectionsState.openai.connections = previousConnections;
        if (previousSelectedConnection && connectionsState.selectedConnection) {
          Object.assign(connectionsState.selectedConnection, previousSelectedConnection);
        }
        renderConnectionsList();
        showFeedback(err.message || 'Failed to save connection', 'error');
      } finally {
        connectionsState.modalSaving = false;
        updateModalSaveButton(modalRoot);
      }
    });

    container.querySelector('#modal-models-select-all')?.addEventListener('click', () => {
      connectionsState.modalModelsSelection = new Set(
        connectionsState.modalModels.map((model) => model.id)
      );
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-select-none')?.addEventListener('click', () => {
      connectionsState.modalModelsSelection = new Set();
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-list')?.addEventListener('change', (e) => {
      const checkbox = e.target.closest('input[type="checkbox"][data-model-id]');
      if (!checkbox) return;
      const id = checkbox.getAttribute('data-model-id');
      if (!id) return;
      const next = new Set(connectionsState.modalModelsSelection || []);
      if (checkbox.checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      connectionsState.modalModelsSelection = next;
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-search')?.addEventListener('input', (e) => {
      connectionsState.modalModelsQuery = e.target.value;
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-manual-model-add')?.addEventListener('click', () => {
      addManualModalModel(container);
    });

    container.querySelector('#modal-manual-model-id')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addManualModalModel(container);
      }
    });

    container.querySelector('#modal-conn-provider')?.addEventListener('change', (e) => {
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      const hint = modalRoot.querySelector('#modal-conn-provider-hint');
      const urlLabel = modalRoot.querySelector('#modal-conn-url-label');
      const urlHint = modalRoot.querySelector('#modal-conn-url-hint');
      const urlInput = modalRoot.querySelector('#modal-conn-url');
      const nameInput = modalRoot.querySelector('#modal-conn-name');
      const nextProvider = e.target.value;
      if (hint) hint.textContent = providerDisplayLabel(nextProvider);
      if (urlInput) {
        const nextDefault = providerUrlPlaceholder(nextProvider);
        urlInput.placeholder = nextDefault;
        if (isCompatibleProviderType(nextProvider)) {
          const currentValue = String(urlInput.value || '').trim();
          const knownDefaults = [
            providerUrlPlaceholder('openai'),
            providerUrlPlaceholder('google'),
            providerUrlPlaceholder('anthropic'),
          ];
          if (!currentValue || knownDefaults.includes(currentValue)) {
            urlInput.value = '';
          }
        } else {
          urlInput.value = nextDefault;
        }
      }
      if (urlLabel) urlLabel.textContent = resolveUrlLabel(nextProvider);
      if (urlHint) {
        urlHint.textContent = isCompatibleProviderType(nextProvider)
          ? 'Required for compatible providers.'
          : 'Uses the built-in default if left blank.';
      }
      if (nameInput) nameInput.placeholder = `e.g. ${providerDisplayLabel(nextProvider)}`;
      updateApiTypeDisplay(modalRoot, nextProvider);
    });

    container.querySelector('#delete-connection')?.addEventListener('click', async () => {
      if (connectionsState.selectedConnection) {
        const connectionId = connectionsState.selectedConnection.id;
        connectionsState.openai.connections = connectionsState.openai.connections.filter(
          (c) => c.id !== connectionId
        );
        closeModal();
        renderConnectionsList();

        // Make immediate API call to delete
        try {
          const manualConnections = connectionsState.openai.connections
            .filter((c) => !c.readOnly)
            .map((conn) => ({
              ...conn,
              manualModels: normalizeConnectionManualModels(conn.manualModels),
            }));
          const res = await apiFetch('/api/admin/openai/connections', {
            method: 'PUT',
            body: JSON.stringify({
              enabled: connectionsState.openai.enabled,
              connections: manualConnections,
              model_updates: [],
              access_updates: [],
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Failed to delete connection');
          }

          broadcastModelsInvalidation();
          broadcastConnectionsInvalidation();
          showFeedback('Connection deleted', 'success');
        } catch (err) {
          showFeedback(err.message || 'Failed to delete connection', 'error');
          // Reload to restore state
          connectionsState.loaded = false;
          loadConnections();
        }
      }
    });

    container.querySelector('#toggle-key-visibility')?.addEventListener('click', () => {
      const input = container.querySelector('#modal-conn-key');
      const button = container.querySelector('#toggle-key-visibility');
      if (!input || !button) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute('aria-label', input.type === 'password' ? 'Show key' : 'Hide key');
      const label = button.querySelector('[data-password-toggle-label]');
      if (label) label.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
  };

  render();
  loadConnections();
}
