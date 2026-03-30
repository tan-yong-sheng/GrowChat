import {
  createUserConnection,
  deleteUserConnection,
  testUserConnection,
  updateUserConnection,
} from '../../shared/api/resources.js';
import { buildConnectionModalMarkup, buildConnectionModalModelsMarkup } from '../../shared/components/connection-modal.js';
import { renderSettingsActionFooter } from '../../shared/components/settings-action-footer.js';
import { renderErrorBanner } from '../../shared/components/section-header.js';
import { sortModelsByActiveThenName } from '../../shared/utils/model-state.js';
import {
  connectionApiTypeDetails,
  formatConnectionModelId,
  getConnectionProviderId,
  inflateManualConnectionModels,
  isCompatibleProviderType,
  normalizeConnectionManualModels,
  normalizeModelRecord,
  providerDisplayLabel as adminProviderDisplayLabel,
  providerUrlPlaceholder as adminProviderUrlPlaceholder,
  resolveKeyLabel,
  resolveUrlLabel,
  updateApiTypeDisplay,
} from '../admin/settings/connections-helpers.js';

const PROVIDER_OPTIONS = [
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude Compatible' },
  { value: 'claude-compatible', label: 'Claude Compatible' },
  { value: 'google', label: 'Gemini' },
  { value: 'gemini-compatible', label: 'Gemini Compatible' },
];

const AUTH_TYPE_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'x-api-key', label: 'X-API-Key' },
  { value: 'x-goog-api-key', label: 'X-Goog-API-Key' },
  { value: 'api-key', label: 'API Key' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeProviderType(value) {
  return String(value || '').trim().toLowerCase() || 'openai-compatible';
}

function providerDisplayLabel(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'openai':
    case 'openai-compatible':
      return 'OpenAI Compatible';
    case 'anthropic':
    case 'claude-compatible':
      return 'Claude Compatible';
    case 'google':
    case 'gemini-compatible':
      return 'Gemini Compatible';
    default:
      return 'OpenAI Compatible';
  }
}

function providerUrlPlaceholder(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'anthropic':
    case 'claude-compatible':
      return 'https://api.anthropic.com/v1';
    case 'google':
    case 'gemini-compatible':
      return 'https://generativelanguage.googleapis.com/v1beta';
    default:
      return 'https://api.openai.com/v1';
  }
}

function normalizePersonalConnection(connection = {}) {
  const headers = connection.headers && typeof connection.headers === 'object' && !Array.isArray(connection.headers)
    ? connection.headers
    : {};
  return {
    id: String(connection.id || '').trim(),
    name: String(connection.name || connection.id || '').trim(),
    provider_type: normalizeProviderType(connection.provider_type || connection.providerType || 'openai-compatible'),
    provider_family: String(connection.provider_family || connection.providerFamily || 'openai').trim().toLowerCase() || 'openai',
    base_url: String(connection.base_url || connection.baseUrl || '').trim(),
    auth_type: String(connection.auth_type || connection.authType || '').trim().toLowerCase(),
    enabled: connection.enabled !== false,
    has_key: Boolean(String(connection.key || '').trim()),
    headers,
    manual_models: Array.isArray(connection.manual_models || connection.manualModels)
      ? [...(connection.manual_models || connection.manualModels)]
      : [],
    note: connection.note || connection.base_url || connection.baseUrl || '',
  };
}

function formatHeadersValue(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers) || !Object.keys(headers).length) {
    return '';
  }
  try {
    return JSON.stringify(headers, null, 2);
  } catch {
    return '';
  }
}

function renderSummaryPill(text, tone = 'gray') {
  const tones = {
    gray: 'border-gray-200 bg-gray-50 text-gray-500',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
  };
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone] || tones.gray}">${escapeHtml(text)}</span>`;
}

function renderAddIconButton(label, attrName) {
  return `
    <button
      type="button"
      ${attrName}
      class="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  `;
}

function buildModalModelsListMarkup(models = [], query = '', selection = new Set(), loading = false, error = '') {
  return buildConnectionModalModelsMarkup(models, query, selection, loading, error);
}

function buildFormBodyMarkup(connection = null, modalState = {}) {
  const providerType = normalizeProviderType(connection?.provider_type || connection?.providerType || 'openai-compatible');
  const baseUrl = String(connection?.base_url || connection?.baseUrl || '').trim();
  const headersValue = formatHeadersValue(connection?.headers);
  const apiType = connectionApiTypeDetails(providerType);
  const query = String(modalState.query || '');
  const models = Array.isArray(modalState.models) ? modalState.models : [];
  const selection = modalState.selection instanceof Set ? modalState.selection : new Set();
  const hasKey = Boolean(connection?.has_key);
  return `
    <form id="account-connection-form" class="space-y-4 p-5 sm:p-6">
      <input type="hidden" name="auth_type" value="${escapeHtml(String(connection?.auth_type || connection?.authType || '').trim().toLowerCase())}">
      <input type="hidden" name="enabled" value="${connection?.enabled === false ? 'off' : 'on'}">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Name</div>
          <input
            name="name"
            value="${escapeHtml(connection?.name || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="Personal OpenAI"
            autocomplete="off"
            required
          />
        </label>
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Provider Type</div>
          <select
            name="provider_type"
            class="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
          >
            ${PROVIDER_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${providerType === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <div id="modal-conn-url-label" class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">${resolveUrlLabel(providerType)}</div>
          <div class="flex items-center gap-2">
            <input
              name="base_url"
              value="${escapeHtml(baseUrl)}"
              class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
              placeholder="${escapeHtml(adminProviderUrlPlaceholder(providerType))}"
              autocomplete="off"
            />
            <button
              type="button"
              data-account-connection-test
              class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Test connection"
              aria-label="Test connection"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="size-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
          <div data-account-connection-test-message class="mt-1 text-[11px] text-gray-400"></div>
          <div id="modal-conn-url-hint" class="mt-1 text-[11px] text-gray-400">${isCompatibleProviderType(providerType) ? 'Required for compatible providers.' : 'Uses the built-in default if left blank.'}</div>
        </label>
        <label class="block">
          <div id="modal-conn-key-label" class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">API Key *</div>
          <input
            name="key"
            type="password"
            value=""
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="${hasKey ? 'Leave blank to keep current key' : 'Enter API key'}"
            autocomplete="new-password"
          />
          <div class="mt-1 text-[11px] text-gray-400">${hasKey ? 'A key is already saved. Leave this blank to keep it.' : 'Optional for providers that do not require a key.'}</div>
        </label>
      </div>

      <label class="block">
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Headers</div>
        <textarea
          name="headers"
          rows="6"
          class="w-full rounded-xl border border-gray-200 px-4 py-2.5 font-mono text-xs outline-none focus:ring-1 focus:ring-gray-300"
          placeholder='{"X-Custom-Header":"value"}'
        >${escapeHtml(headersValue)}</textarea>
        <div class="mt-1 text-[11px] text-gray-400">Leave blank to keep existing headers. Use valid JSON when editing them.</div>
      </label>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">API Type</label>
          <div id="modal-conn-api-type-label" class="text-sm text-gray-900">${apiType.label}</div>
          <div id="modal-conn-api-type-hint" class="text-[11px] text-gray-400">${apiType.endpoint}</div>
        </div>
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Provider</label>
          <div id="modal-conn-provider-hint" class="text-sm text-gray-900">${adminProviderDisplayLabel(providerType)}</div>
        </div>
      </div>

      <div class="space-y-2" id="modal-models-section">
        <div class="flex items-center justify-between">
          <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Models</label>
          <div class="flex items-center gap-2 text-[11px] text-gray-400">
            <button type="button" id="modal-models-select-all" class="px-2 py-1 rounded-md hover:bg-gray-50">All</button>
            <button type="button" id="modal-models-select-none" class="px-2 py-1 rounded-md hover:bg-gray-50">None</button>
          </div>
        </div>
        <div class="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
            <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
          </svg>
          <input id="modal-models-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none" placeholder="Search models" value="${escapeHtml(query)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
        </div>
        <div class="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2">
          <input id="modal-manual-model-id" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none" placeholder="Add model manually" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
          <button id="modal-manual-model-add" type="button" class="shrink-0 rounded-full bg-black px-3 py-1 text-[11px] font-medium text-white hover:bg-gray-900 transition">Add</button>
        </div>
        <div id="modal-models-list" class="rounded-2xl border border-gray-100 bg-white max-h-48 overflow-y-auto scrollbar-hidden text-sm">
          ${buildModalModelsListMarkup(models, query, selection, Boolean(modalState.loadingModels), modalState.modelsError || '')}
        </div>
        <div id="modal-models-status" class="text-[11px] text-gray-400"></div>
      </div>

      <div data-account-connection-form-error class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
    </form>
  `;
}

function buildListCard(connection) {
  const providerLabel = connection.provider_label || providerDisplayLabel(connection.provider_type);
  const baseUrl = connection.base_url || connection.note || '';
  const readOnlyText = connection.readOnly
    ? (connection.readOnlyLabel || 'Shared from admin')
    : '';
  return `
    <div data-connection-row="${escapeHtml(connection.id)}" data-id="${escapeHtml(connection.id)}" class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2 border-b border-gray-50 last:border-0 ${connection.enabled === false ? 'opacity-70' : ''}">
      <div class="flex flex-col min-w-0">
        <div class="text-xs font-medium text-gray-900">${escapeHtml(connection.name || providerLabel)}</div>
        <div class="text-[10px] text-gray-400 font-mono">${escapeHtml(baseUrl)}</div>
        <div class="text-[10px] text-gray-400 mt-0.5">${escapeHtml(providerLabel)}</div>
        <div class="mt-0.5 inline-flex w-fit items-center rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500 ${connection.enabled === false ? '' : 'hidden'}">Disabled</div>
        ${readOnlyText ? `<div class="text-[10px] text-gray-400 mt-0.5">${escapeHtml(readOnlyText)}</div>` : ''}
      </div>
      <div class="flex items-center justify-end gap-3 self-end sm:self-auto flex-wrap">
        <button
          type="button"
          data-list-action="edit"
          data-account-connection-edit="${escapeHtml(connection.id)}"
          class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
        <button data-id="${escapeHtml(connection.id)}" class="connection-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${connection.enabled === false ? 'bg-gray-200' : 'bg-black'}">
          <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${connection.enabled === false ? 'translate-x-0' : 'translate-x-4'}"></span>
        </button>
      </div>
    </div>
  `;
}

function buildAccessibleCard(connection) {
  return `
    <div class="py-2.5 border-b border-gray-50 last:border-0">
      <div class="flex flex-wrap items-center gap-2">
        <div class="truncate text-sm font-semibold text-gray-900">${escapeHtml(connection.name || connection.id || 'Connection')}</div>
        ${renderSummaryPill(connection.access_label || 'Shared', 'gray')}
      </div>
      <div class="mt-1 truncate text-xs text-gray-500">${escapeHtml(connection.note || connection.base_url || '')}</div>
    </div>
  `;
}

export function renderAccountConnectionsSection(container, state = {}, { onRefresh, footerHost } = {}) {
  const getConnections = () => {
    const connections = state.settings?.connections || {};
    return {
      personal: Array.isArray(connections.my_connections)
        ? connections.my_connections.map((connection) => normalizePersonalConnection(connection))
        : [],
      accessible: Array.isArray(connections.connections)
        ? connections.connections.map((connection) => ({
          id: String(connection.id || '').trim(),
          name: String(connection.name || connection.id || '').trim(),
          note: String(connection.note || connection.base_url || '').trim(),
          access_label: String(connection.access_label || 'Shared').trim(),
        }))
        : [],
    };
  };

  const viewState = {
    saving: false,
    error: '',
    ...getConnections(),
  };

  let activeModal = null;
  const showPageError = (message = '') => {
    viewState.error = String(message || '');
    render();
  };

  const closeModal = () => {
    activeModal?.remove();
    activeModal = null;
  };

  const refreshConnections = async () => {
    if (typeof onRefresh !== 'function') {
      render();
      return;
    }
    const nextState = await onRefresh();
    viewState.error = '';
    if (nextState) {
      state.settings = nextState.settings;
      const nextConnections = getConnections();
      viewState.personal = nextConnections.personal;
      viewState.accessible = nextConnections.accessible;
    }
    render();
  };

  const openConnectionModal = (connection = null) => {
    closeModal();
    const isEdit = Boolean(connection?.id);
    const title = isEdit ? 'Edit Connection' : 'Add Connection';
    const initialModels = normalizeConnectionManualModels(connection?.manual_models || connection?.manualModels)
      .map((model) => normalizeModelRecord({
        id: model.modelId,
        name: model.name || model.modelId,
        manual: true,
        manualModelId: model.modelId,
      }))
      .filter(Boolean);
    const modalState = {
      models: initialModels,
      selection: new Set(initialModels.map((model) => model.id)),
      query: '',
      loadingModels: false,
      modelsError: '',
    };
    const modalMarkup = buildConnectionModalMarkup({
      rootId: 'account-connection-modal',
      title,
      connection: connection ? {
        ...connection,
        url: String(connection.base_url || connection.baseUrl || connection.url || '').trim(),
        providerType: String(connection.provider_type || connection.providerType || 'openai').trim().toLowerCase() || 'openai',
        headers: formatHeadersValue(connection.headers),
        key: String(connection.key || connection.keyMasked || '').trim(),
        enabled: connection.enabled !== false,
      } : null,
      isVisible: true,
      showAccountHooks: true,
      isEnvConnection: connection?.source === 'env',
      modalState,
    });
    const modalWrapper = document.createElement('div');
    modalWrapper.innerHTML = modalMarkup.trim();
    const modal = modalWrapper.firstElementChild;
    container.appendChild(modal);

    activeModal = modal;
    const bodyEl = modal;
    const overlay = modal.querySelector('.absolute.inset-0');
    const providerSelect = bodyEl?.querySelector('#modal-conn-provider');
    const baseUrlInput = bodyEl?.querySelector('#modal-conn-url');
    const keyInput = bodyEl?.querySelector('#modal-conn-key');
    const headersInput = bodyEl?.querySelector('#modal-conn-headers');
    const nameInput = bodyEl?.querySelector('#modal-conn-name');
    const testBtn = bodyEl?.querySelector('[data-account-connection-test], #test-connection');
    const testMessage = bodyEl?.querySelector('[data-account-connection-test-message], #connection-test-message');
    const modelsList = bodyEl?.querySelector('#modal-models-list');
    const modelsStatus = bodyEl?.querySelector('#modal-models-status');
    const searchInput = bodyEl?.querySelector('#modal-models-search');
    const manualInput = bodyEl?.querySelector('#modal-manual-model-id');
    const manualAddBtn = bodyEl?.querySelector('#modal-manual-model-add');
    const selectAllBtn = bodyEl?.querySelector('#modal-models-select-all');
    const selectNoneBtn = bodyEl?.querySelector('#modal-models-select-none');
    const saveBtn = modal.querySelector('[data-account-connection-save], #save-modal');
    const deleteBtn = modal.querySelector('[data-account-connection-delete-modal], #delete-connection');
    const closeBtn = modal.querySelector('#close-modal');
    const toggleKeyBtn = modal.querySelector('#toggle-key-visibility');

    const setError = (message) => {
      setTestMessage(message, message ? 'error' : 'idle');
    };

    const setSaving = (saving) => {
      viewState.saving = saving;
      if (saveBtn) {
        saveBtn.disabled = saving;
        saveBtn.textContent = saving ? 'Saving...' : 'Save';
        saveBtn.classList.toggle('opacity-60', saving);
        saveBtn.classList.toggle('cursor-not-allowed', saving);
      }
      if (deleteBtn) {
        deleteBtn.disabled = saving;
        deleteBtn.classList.toggle('opacity-60', saving);
        deleteBtn.classList.toggle('cursor-not-allowed', saving);
      }
    };

    const setTestMessage = (message, tone = 'idle') => {
      if (!testMessage) return;
      testMessage.textContent = message || '';
      testMessage.classList.toggle('hidden', !message);
      testMessage.classList.toggle('text-red-500', tone === 'error');
      testMessage.classList.toggle('text-gray-900', tone === 'success');
      testMessage.classList.toggle('text-gray-400', tone === 'idle' || tone === 'testing');
    };

    const syncProviderUi = () => {
      if (!providerSelect || !baseUrlInput) return;
      const providerType = providerSelect.value;
      const nextDefault = adminProviderUrlPlaceholder(providerType);
      baseUrlInput.placeholder = nextDefault;
      if (isCompatibleProviderType(providerType)) {
        const currentValue = String(baseUrlInput.value || '').trim();
        const knownDefaults = [
          adminProviderUrlPlaceholder('openai'),
          adminProviderUrlPlaceholder('google'),
          adminProviderUrlPlaceholder('anthropic'),
        ];
        if (!currentValue || knownDefaults.includes(currentValue)) {
          baseUrlInput.value = '';
        }
      } else {
        baseUrlInput.value = nextDefault;
      }
      updateApiTypeDisplay(bodyEl, providerType);
      const urlLabel = bodyEl?.querySelector('#modal-conn-url-label');
      if (urlLabel) urlLabel.textContent = resolveUrlLabel(providerType);
      const providerHint = bodyEl?.querySelector('#modal-conn-provider-hint');
      if (providerHint) providerHint.textContent = adminProviderDisplayLabel(providerType);
      const urlHint = bodyEl?.querySelector('#modal-conn-url-hint');
      if (urlHint) {
        urlHint.textContent = isCompatibleProviderType(providerType)
          ? 'Required for compatible providers.'
          : 'Uses the built-in default if left blank.';
      }
      const keyLabel = bodyEl?.querySelector('#modal-conn-key-label');
      if (keyLabel) keyLabel.textContent = 'API Key *';
      if (nameInput) nameInput.placeholder = `e.g. ${adminProviderDisplayLabel(providerType)}`;
    };

    const renderModels = () => {
      if (!modelsList || !modelsStatus) return;
      if (!connection?.id && (!Array.isArray(modalState.models) || modalState.models.length === 0)) {
        modelsList.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Click Verify to load models from this connection.</div>';
        modelsStatus.textContent = '';
        if (searchInput) searchInput.value = modalState.query;
        return;
      }
      if (modalState.loadingModels) {
        modelsList.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Loading models...</div>';
        modelsStatus.textContent = '';
        if (searchInput) searchInput.value = modalState.query;
        return;
      }
      if (modalState.modelsError) {
        modelsList.innerHTML = '<div class="px-4 py-3 text-xs text-red-500">Failed to load models.</div>';
        modelsStatus.textContent = modalState.modelsError;
        modelsStatus.classList.add('text-red-500');
        if (searchInput) searchInput.value = modalState.query;
        return;
      }
      const models = sortModelsByActiveThenName(modalState.models);
      const selected = modalState.selection instanceof Set ? modalState.selection : new Set();
      modelsList.innerHTML = buildConnectionModalModelsMarkup(
        models,
        modalState.query,
        selected,
        false,
        '',
      );
      modelsStatus.classList.remove('text-red-500');
      modelsStatus.textContent = models.length ? `${selected.size} of ${models.length} enabled` : '';
      if (searchInput) searchInput.value = modalState.query;
    };

    const updateModalStateModels = (models = []) => {
      const nextModels = sortModelsByActiveThenName(
        (Array.isArray(models) ? models : [])
          .map((model) => normalizeModelRecord(model))
          .filter(Boolean),
      );
      const nextSelection = new Set();
      nextModels.forEach((model) => {
        nextSelection.add(model.id);
      });
      modalState.models = nextModels;
      modalState.selection = nextSelection;
      modalState.modelsError = '';
      renderModels();
    };

    const buildPayload = () => {
      const providerType = normalizeProviderType(providerSelect?.value || connection?.provider_type || connection?.providerType || 'openai');
      const baseUrl = String(baseUrlInput?.value || '').trim();
      const resolvedUrl = isCompatibleProviderType(providerType)
        ? baseUrl
        : (baseUrl || adminProviderUrlPlaceholder(providerType));
      const selectedModels = Array.from(modalState.selection || new Set())
        .map((modelId) => {
          const model = (modalState.models || []).find((item) => item.id === modelId);
          if (!model) return null;
          return {
            modelId: String(model.manualModelId || model.id || '').trim(),
            name: String(model.name || model.id || '').trim(),
          };
        })
        .filter(Boolean);
      const payload = {
        name: String(nameInput?.value || '').trim(),
        provider_type: providerType,
        base_url: resolvedUrl,
        key: String(keyInput?.value || '').trim(),
        headers: String(headersInput?.value || '').trim(),
        auth_type: String(connection?.auth_type || connection?.authType || '').trim().toLowerCase(),
        enabled: connection?.enabled !== false,
        manual_models: selectedModels,
      };
      if (!payload.key) delete payload.key;
      if (!payload.headers) delete payload.headers;
      if (!payload.auth_type) delete payload.auth_type;
      return payload;
    };

    const testConnection = async () => {
      const payload = buildPayload();
      if (!payload.name) throw new Error('Name is required');
      if (isCompatibleProviderType(payload.provider_type) && !payload.base_url) throw new Error('Connection URL is required');
      setTestMessage('Testing connection...', 'testing');
      modalState.loadingModels = true;
      renderModels();
      try {
        const result = await testUserConnection(payload);
        const discovered = Array.isArray(result?.models)
          ? result.models.map((model) => normalizeModelRecord({
            id: model.id,
            name: model.name || model.id,
            manual: false,
          })).filter(Boolean)
          : [];
        const existingManual = (modalState.models || []).filter((model) => model.manual);
        const merged = [...existingManual, ...discovered];
        const unique = new Map();
        merged.forEach((model) => {
          if (!unique.has(model.id)) unique.set(model.id, model);
        });
        modalState.models = sortModelsByActiveThenName(Array.from(unique.values()));
        modalState.selection = new Set(modalState.models.map((model) => model.id));
        modalState.modelsError = '';
        setTestMessage(result?.message || `Connection successful. ${discovered.length} models loaded.`, 'success');
      } catch (err) {
        modalState.modelsError = err?.message || 'Failed to test connection';
        setTestMessage(err?.message || 'Failed to test connection', 'error');
      } finally {
        modalState.loadingModels = false;
        renderModels();
      }
    };

    const saveConnection = async () => {
      const payload = buildPayload();
      const name = String(payload.name || '').trim();

      if (!name) {
        throw new Error('Name is required');
      }
      if (isCompatibleProviderType(payload.provider_type) && !payload.base_url) {
        throw new Error('Connection URL is required');
      }

      if (isEdit) {
        await updateUserConnection(connection.id, payload);
      } else {
        await createUserConnection(payload);
      }
    };

    const finishAndRefresh = async () => {
      closeModal();
      await refreshConnections();
    };

    saveBtn?.addEventListener('click', async () => {
      if (viewState.saving) return;
      setError('');
      setSaving(true);
      try {
        await saveConnection();
        await finishAndRefresh();
      } catch (err) {
        setError(err?.message || 'Failed to save connection');
      } finally {
        setSaving(false);
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (viewState.saving || !isEdit) return;
      if (!window.confirm(`Delete connection ${connection.name || connection.id}? This cannot be undone.`)) return;
      setError('');
      setSaving(true);
      try {
        await deleteUserConnection(connection.id);
        await finishAndRefresh();
      } catch (err) {
        setError(err?.message || 'Failed to delete connection');
      } finally {
        setSaving(false);
      }
    });

    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);
    providerSelect?.addEventListener('change', syncProviderUi);
    toggleKeyBtn?.addEventListener('click', () => {
      if (!keyInput) return;
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    });
    testBtn?.addEventListener('click', async () => {
      if (viewState.saving) return;
      setError('');
      try {
        await testConnection();
      } catch (err) {
        setError(err?.message || 'Failed to test connection');
      }
    });
    searchInput?.addEventListener('input', (event) => {
      modalState.query = String(event.target.value || '');
      renderModels();
    });
    selectAllBtn?.addEventListener('click', () => {
      modalState.selection = new Set((modalState.models || []).map((model) => model.id));
      renderModels();
    });
    selectNoneBtn?.addEventListener('click', () => {
      modalState.selection = new Set();
      renderModels();
    });
    manualAddBtn?.addEventListener('click', () => {
      const raw = String(manualInput?.value || '').trim();
      if (!raw) return;
      const normalized = normalizeModelRecord({
        id: raw,
        name: raw,
        manual: true,
        manualModelId: raw,
      });
      if (!normalized) return;
      const nextModels = Array.isArray(modalState.models) ? modalState.models.slice() : [];
      if (!nextModels.some((model) => model.id === normalized.id)) {
        nextModels.push(normalized);
      }
      modalState.models = sortModelsByActiveThenName(nextModels);
      modalState.selection = new Set(modalState.models.map((model) => model.id));
      modalState.query = '';
      modalState.modelsError = '';
      if (manualInput) manualInput.value = '';
      renderModels();
    });
    modelsList?.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-model-id]');
      if (!checkbox) return;
      const modelId = checkbox.dataset.modelId;
      if (!modelId) return;
      if (checkbox.checked) {
        modalState.selection.add(modelId);
      } else {
        modalState.selection.delete(modelId);
      }
      renderModels();
    });
    syncProviderUi();
    renderModels();
    return modal;
  };

  window.__accountConnectionsHandlers = {
    openAdd: () => openConnectionModal(null),
    openEdit: (connectionId) => {
      const connection = viewState.personal.find((item) => item.id === connectionId);
      if (connection) {
        openConnectionModal(connection);
      }
    },
    deleteConnection: async (connectionId) => {
      const connection = viewState.personal.find((item) => item.id === connectionId);
      if (!connection) return;
      if (!window.confirm(`Delete connection ${connection.name || connection.id}? This cannot be undone.`)) return;
      showPageError('');
      try {
        await deleteUserConnection(connection.id);
        await refreshConnections();
      } catch (err) {
        showPageError(err?.message || 'Failed to delete connection');
      }
    },
  };

  const render = () => {
    const combinedConnections = [
      ...viewState.personal.map((connection) => ({ ...connection })),
      ...viewState.accessible.map((connection) => ({
        id: connection.id,
        name: connection.name,
        base_url: connection.note,
        provider_type: 'openai-compatible',
        provider_label: connection.access_label || 'Shared',
        readOnly: true,
        readOnlyLabel: connection.access_label ? `Shared from ${connection.access_label.toLowerCase()}` : 'Shared from admin',
        enabled: true,
        note: connection.note,
      })),
    ];
    const personalMarkup = combinedConnections.length
      ? combinedConnections.map((connection) => buildListCard(connection)).join('')
      : '<div class="py-8 text-center text-sm text-gray-500">No connections configured</div>';

    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        ${viewState.error ? renderErrorBanner({ message: viewState.error }) : ''}
        <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Connections</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto">
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
              <div class="flex items-center justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage LLM Chat Providers</div>
                <button id="add-connection" data-account-connection-add class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Add Connection" aria-label="Add Connection">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              <hr class="border-gray-100/30 my-2" />

              <div data-account-personal-connections class="space-y-2">
                ${personalMarkup}
              </div>
            </section>

            <div id="connections-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>
    `;

    if (footerHost) {
      footerHost.innerHTML = renderSettingsActionFooter({
        footerId: 'connections-action-footer',
        dirtyId: 'connections-dirty',
        saveId: 'save-connections',
      });
    }

    container.querySelector('[data-action="add-connection"], #add-connection, [data-account-connection-add]')?.addEventListener('click', () => {
      openConnectionModal(null);
    });

    container.querySelectorAll('[data-list-action="edit"]').forEach((button) => {
      button.addEventListener('click', () => {
        const connectionId = button.dataset.accountConnectionEdit || button.closest('[data-connection-row]')?.dataset.id;
        const connection = viewState.personal.find((item) => item.id === connectionId);
        if (connection) {
          openConnectionModal(connection);
        }
      });
    });

    container.querySelectorAll('.connection-toggle').forEach((toggleBtn) => {
      toggleBtn.addEventListener('click', async () => {
        const id = toggleBtn.dataset.id;
        const connection = viewState.personal.find((item) => item.id === id);
        if (!connection) return;
        const nextEnabled = connection.enabled === false;
        connection.enabled = nextEnabled;
        const row = toggleBtn.closest('[data-connection-row]');
        updateConnectionToggle(toggleBtn, nextEnabled);
        if (row) {
          row.classList.toggle('opacity-70', !nextEnabled);
          const badge = row.querySelector('[data-connection-disabled-badge]');
          if (badge) badge.classList.toggle('hidden', nextEnabled);
        }
        try {
          await updateUserConnection(connection.id, { enabled: nextEnabled });
        } catch (err) {
          showPageError(err?.message || 'Failed to update connection');
          await refreshConnections();
        }
      });
    });
  };

  render();
}
