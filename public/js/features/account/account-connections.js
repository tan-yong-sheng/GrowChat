import { createUserConnection, deleteUserConnection, updateUserConnection } from '../../shared/api/resources.js';
import { createSettingsModalShell } from '../../shared/components/settings-modal-shell.js';
import { renderSectionHeader, renderSettingsPageLayout, renderSubsection, renderErrorBanner } from '../../shared/components/section-header.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';

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

function buildFormBodyMarkup(connection = null) {
  const providerType = normalizeProviderType(connection?.provider_type || connection?.providerType || 'openai-compatible');
  const baseUrl = String(connection?.base_url || connection?.baseUrl || '').trim();
  const headersValue = formatHeadersValue(connection?.headers);
  const authType = String(connection?.auth_type || connection?.authType || '').trim().toLowerCase();
  const enabled = connection?.enabled !== false;
  const hasKey = Boolean(connection?.has_key);
  return `
    <form id="account-connection-form" class="space-y-4 p-5 sm:p-6">
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
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Provider</div>
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
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Base URL</div>
          <input
            name="base_url"
            value="${escapeHtml(baseUrl)}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="${escapeHtml(providerUrlPlaceholder(providerType))}"
            autocomplete="off"
          />
        </label>
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Auth Type</div>
          <select
            name="auth_type"
            class="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
          >
            ${AUTH_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${authType === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
          </select>
        </label>
      </div>

      <label class="block">
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">API Key</div>
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

      <label class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <input
          name="enabled"
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
          ${enabled ? 'checked' : ''}
        />
        <span class="text-sm text-gray-700">Enabled</span>
      </label>

      <div data-account-connection-form-error class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
    </form>
  `;
}

function buildListCard(connection) {
  const statusTone = connection.enabled === false ? 'amber' : 'green';
  const statusText = connection.enabled === false ? 'Disabled' : 'Enabled';
  const providerLabel = providerDisplayLabel(connection.provider_type);
  const details = [
    connection.base_url ? connection.base_url : 'No base URL',
    providerLabel,
  ];
  if (connection.auth_type) details.push(`Auth: ${connection.auth_type}`);
  if (connection.has_key) details.push('Key saved');
  return `
    <div class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2 border-b border-gray-50 last:border-0 ${connection.enabled === false ? 'opacity-70' : ''}" data-list-action data-id="${escapeHtml(connection.id)}">
      <div class="flex flex-col min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <div class="truncate text-sm font-semibold text-gray-900">${escapeHtml(connection.name || connection.id || 'Connection')}</div>
          ${renderSummaryPill(statusText, statusTone)}
        </div>
        <div class="mt-1 truncate text-xs text-gray-500">${escapeHtml(details.join(' · '))}</div>
        ${connection.note ? `<div class="mt-1 truncate text-[11px] text-gray-400">${escapeHtml(connection.note)}</div>` : ''}
      </div>
      <div class="flex items-center justify-end gap-2 self-end sm:self-auto flex-wrap">
        <button
          type="button"
          data-list-action="edit"
          class="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Edit
        </button>
        <button
          type="button"
          data-list-action="delete"
          class="rounded-full border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
        >
          Delete
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

export function renderAccountConnectionsSection(container, state = {}, { onRefresh } = {}) {
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
    const subtitle = isEdit
      ? `${connection.name || connection.id || 'Connection'} · Personal resource`
      : 'Create a personal connection for your account.';
    const { modal, overlay, closeBtn, bodyEl } = createSettingsModalShell({
      rootId: 'account-connection-modal',
      title,
      subtitle,
      body: buildFormBodyMarkup(connection),
      footer: `
        <div class="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
          <div class="text-xs text-gray-400">
            ${isEdit ? 'Update the connection details and save changes.' : 'Create a new personal connection.'}
          </div>
          <div class="flex items-center gap-2">
            ${isEdit ? `
              <button type="button" data-account-connection-delete-modal class="rounded-full border border-red-100 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition">
                Delete
              </button>
            ` : ''}
            <button type="button" data-account-connection-cancel class="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="button" data-account-connection-save class="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition">
              Save
            </button>
          </div>
        </div>
      `,
    });

    activeModal = modal;
    const form = bodyEl?.querySelector('#account-connection-form');
    const errorEl = bodyEl?.querySelector('[data-account-connection-form-error]');
    const providerSelect = bodyEl?.querySelector('[name="provider_type"]');
    const baseUrlInput = bodyEl?.querySelector('[name="base_url"]');
    const saveBtn = modal.querySelector('[data-account-connection-save]');
    const deleteBtn = modal.querySelector('[data-account-connection-delete-modal]');
    const cancelBtn = modal.querySelector('[data-account-connection-cancel]');

    const setError = (message) => {
      if (!errorEl) return;
      if (!message) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
        return;
      }
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
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

    const syncProviderUi = () => {
      if (!providerSelect || !baseUrlInput) return;
      const providerType = providerSelect.value;
      const placeholder = providerUrlPlaceholder(providerType);
      baseUrlInput.placeholder = placeholder;
      if (!String(baseUrlInput.value || '').trim()) {
        baseUrlInput.placeholder = placeholder;
      }
    };

    const saveConnection = async () => {
      if (!form) return;
      const formData = new FormData(form);
      const name = String(formData.get('name') || '').trim();
      const providerType = normalizeProviderType(formData.get('provider_type'));
      const baseUrl = String(formData.get('base_url') || '').trim();
      const key = String(formData.get('key') || '').trim();
      const authType = String(formData.get('auth_type') || '').trim().toLowerCase();
      const headersRaw = String(formData.get('headers') || '').trim();
      const enabled = formData.get('enabled') === 'on';

      if (!name) {
        throw new Error('Name is required');
      }

      let headers;
      if (headersRaw) {
        try {
          headers = JSON.parse(headersRaw);
          if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
            throw new Error('Headers must be a JSON object');
          }
        } catch (err) {
          throw new Error(err.message || 'Headers must be valid JSON');
        }
      }

      const payload = {
        name,
        provider_type: providerType,
        enabled,
      };
      if (baseUrl || !isEdit) payload.base_url = baseUrl;
      if (key || !isEdit) payload.key = key;
      if (authType) payload.auth_type = authType;
      if (headers !== undefined) payload.headers = headersRaw;

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

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
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

    saveBtn?.addEventListener('click', () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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

    cancelBtn?.addEventListener('click', closeModal);
    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);
    providerSelect?.addEventListener('change', syncProviderUi);
    syncProviderUi();

    document.body.appendChild(modal);
    return modal;
  };

  const render = () => {
    const personalMarkup = viewState.personal.length
      ? viewState.personal.map((connection) => buildListCard(connection)).join('')
      : '<div class="py-8 text-center text-sm text-gray-500">No personal connections yet. Add one to connect a provider.</div>';
    const accessibleMarkup = viewState.accessible.length
      ? viewState.accessible.map((connection) => buildAccessibleCard(connection)).join('')
      : '<div class="py-8 text-center text-sm text-gray-500">No shared connections available.</div>';

    const header = renderSectionHeader({
      label: 'ACCOUNT SETTINGS',
      title: 'Connections',
      subtitle: 'Manage your LLM provider connections',
      actionButton: { label: 'Add Connection', key: 'add-connection' },
    });

    const personalSection = renderSubsection({
      label: 'PERSONAL CONNECTIONS',
      description: 'Your own provider endpoints',
      content: personalMarkup,
    });

    const accessibleSection = renderSubsection({
      label: 'ACCESSIBLE CONNECTIONS',
      description: 'Connections shared from admin or other sources',
      content: accessibleMarkup,
    });

    const content = `
      ${viewState.error ? renderErrorBanner({ message: viewState.error }) : ''}
      ${personalSection}
      <div class="mt-6"></div>
      ${accessibleSection}
    `;

    const shellHtml = renderSettingsShell({
      contentHtml: renderSettingsPageLayout({
        header,
        content,
      }),
    });

    container.innerHTML = shellHtml;

    container.querySelector('[data-action="add-connection"]')?.addEventListener('click', () => {
      openConnectionModal(null);
    });

    container.querySelectorAll('[data-list-action="edit"]').forEach((button) => {
      button.addEventListener('click', () => {
        const connectionId = button.closest('[data-list-action]')?.dataset.id;
        const connection = viewState.personal.find((item) => item.id === connectionId);
        if (connection) {
          openConnectionModal(connection);
        }
      });
    });

    container.querySelectorAll('[data-list-action="delete"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const connectionId = button.closest('[data-list-action]')?.dataset.id;
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
      });
    });
  };

  render();
}
