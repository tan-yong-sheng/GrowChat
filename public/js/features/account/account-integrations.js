import {
  createUserMcpServer,
  deleteUserMcpServer,
  fetchUserMcpServers,
  testUserMcpServer,
  updateUserMcpServer,
} from '../../shared/api/resources.js';
import { createSettingsModalShell } from '../../shared/components/settings-modal-shell.js';
import { renderSectionHeader, renderSettingsPageLayout, renderSubsection, renderErrorBanner } from '../../shared/components/section-header.js';
import { renderSettingsShell } from '../../shared/components/settings-shell.js';

const AUTH_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'basic', label: 'Basic' },
  { value: 'oauth', label: 'OAuth 2.0 (PKCE)' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatHeadersValue(headers) {
  if (!headers) return '';
  if (typeof headers === 'string') return headers;
  if (typeof headers !== 'object' || Array.isArray(headers)) return '';
  try {
    return JSON.stringify(headers, null, 2);
  } catch {
    return '';
  }
}

function normalizeServer(server = {}) {
  const headers = server.headers && typeof server.headers === 'object' && !Array.isArray(server.headers)
    ? server.headers
    : server.headers || '';
  return {
    id: String(server.id || '').trim(),
    name: String(server.name || server.id || '').trim(),
    url: String(server.url || '').trim(),
    headers,
    enabled: server.enabled !== false,
    auth_type: String(server.auth_type || 'none').toLowerCase(),
    auth_bearer_token: String(server.auth_bearer_token || '').trim(),
    auth_basic_username: String(server.auth_basic_username || '').trim(),
    auth_basic_password: String(server.auth_basic_password || '').trim(),
    oauth_client_name: String(server.oauth_client_name || '').trim(),
    oauth_scope: String(server.oauth_scope || '').trim(),
    oauth_client_id: String(server.oauth_client_id || '').trim(),
    oauth_client_secret: String(server.oauth_client_secret || '').trim(),
    oauth_token_auth_method: String(server.oauth_token_auth_method || '').trim(),
    note: String(server.note || server.url || '').trim(),
    oauth_connected: Boolean(server.oauth_connected),
    oauth_connected_at: server.oauth_connected_at || null,
  };
}

function providerHint(authType) {
  switch (String(authType || 'none').toLowerCase()) {
    case 'bearer':
      return 'Bearer token';
    case 'basic':
      return 'Username and password';
    case 'oauth':
      return 'OAuth client details';
    default:
      return 'No auth';
  }
}

function shouldShowAuthField(authType, fieldType) {
  return String(authType || 'none').toLowerCase() === fieldType;
}

function renderSummaryPill(text, tone = 'gray') {
  const tones = {
    gray: 'border-gray-200 bg-gray-50 text-gray-500',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
  };
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone] || tones.gray}">${escapeHtml(text)}</span>`;
}

function buildFormMarkup(server = null) {
  const authType = String(server?.auth_type || 'none').toLowerCase();
  const headersValue = formatHeadersValue(server?.headers);
  const enabled = server?.enabled !== false;
  return `
    <form id="account-integration-form" class="space-y-4 p-5 sm:p-6">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Name</div>
          <input
            name="name"
            value="${escapeHtml(server?.name || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="Personal MCP"
            autocomplete="off"
            required
          />
        </label>
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">URL</div>
          <input
            name="url"
            value="${escapeHtml(server?.url || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="https://mcp.example.com"
            autocomplete="off"
            required
          />
        </label>
      </div>

      <label class="block">
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Auth Type</div>
        <select
          name="auth_type"
          class="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
        >
          ${AUTH_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" ${authType === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </label>

      <div data-account-integration-auth-bearer class="${shouldShowAuthField(authType, 'bearer') ? '' : 'hidden'} space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Bearer Token</div>
        <input
          name="auth_bearer_token"
          type="password"
          value="${escapeHtml(server?.auth_bearer_token || '')}"
          class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
          placeholder="Leave blank to keep current token"
          autocomplete="new-password"
        />
      </div>

      <div data-account-integration-auth-basic class="${shouldShowAuthField(authType, 'basic') ? '' : 'hidden'} grid gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:grid-cols-2">
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Username</div>
          <input
            name="auth_basic_username"
            value="${escapeHtml(server?.auth_basic_username || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="Username"
            autocomplete="off"
          />
        </label>
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Password</div>
          <input
            name="auth_basic_password"
            type="password"
            value="${escapeHtml(server?.auth_basic_password || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="Leave blank to keep current password"
            autocomplete="new-password"
          />
        </label>
      </div>

      <div data-account-integration-auth-oauth class="${shouldShowAuthField(authType, 'oauth') ? '' : 'hidden'} grid gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:grid-cols-2">
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Client Name</div>
          <input
            name="oauth_client_name"
            value="${escapeHtml(server?.oauth_client_name || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="GrowChat MCP Client"
            autocomplete="off"
          />
        </label>
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Scope</div>
          <input
            name="oauth_scope"
            value="${escapeHtml(server?.oauth_scope || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="optional"
            autocomplete="off"
          />
        </label>
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Client ID</div>
          <input
            name="oauth_client_id"
            value="${escapeHtml(server?.oauth_client_id || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="Leave blank to auto-register"
            autocomplete="off"
          />
        </label>
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Client Secret</div>
          <input
            name="oauth_client_secret"
            type="password"
            value="${escapeHtml(server?.oauth_client_secret || '')}"
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="Optional"
            autocomplete="new-password"
          />
        </label>
        <label class="block sm:col-span-2">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Token Auth Method</div>
          <select
            name="oauth_token_auth_method"
            class="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="">Auto</option>
            <option value="client_secret_basic" ${server?.oauth_token_auth_method === 'client_secret_basic' ? 'selected' : ''}>client_secret_basic</option>
            <option value="client_secret_post" ${server?.oauth_token_auth_method === 'client_secret_post' ? 'selected' : ''}>client_secret_post</option>
            <option value="none" ${server?.oauth_token_auth_method === 'none' ? 'selected' : ''}>none</option>
          </select>
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

      <label class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <input
          name="enabled"
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-300"
          ${enabled ? 'checked' : ''}
        />
        <span class="text-sm text-gray-700">Enabled</span>
      </label>

      <div data-account-integration-form-error class="hidden rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"></div>
    </form>
  `;
}

function buildListCard(server) {
  const statusTone = server.enabled === false ? 'amber' : 'green';
  const statusText = server.enabled === false ? 'Disabled' : 'Enabled';
  const details = [
    server.url || 'No URL',
    providerHint(server.auth_type),
  ];
  if (server.oauth_connected) details.push('OAuth connected');
  return `
    <div class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2 border-b border-gray-50 last:border-0 ${server.enabled === false ? 'opacity-70' : ''}" data-list-action data-id="${escapeHtml(server.id)}">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <div class="truncate text-sm font-semibold text-gray-900">${escapeHtml(server.name || server.id || 'Integration')}</div>
          ${renderSummaryPill(statusText, statusTone)}
        </div>
        <div class="mt-1 truncate text-xs text-gray-500">${escapeHtml(details.join(' · '))}</div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
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

export function renderAccountIntegrationsSection(container, state = {}, { onRefresh } = {}) {
  const sectionState = {
    loading: false,
    saving: false,
    error: '',
    servers: Array.isArray(state.settings?.integrations?.servers)
      ? state.settings.integrations.servers.map(normalizeServer).filter(Boolean)
      : [],
  };

  let activeModal = null;

  const render = () => {
    const header = renderSectionHeader({
      label: 'ACCOUNT SETTINGS',
      title: 'Integrations',
      subtitle: 'Manage your MCP servers and integrations',
      actionButton: { label: 'Add Integration', key: 'add-integration' },
    });

    const serverMarkup = sectionState.servers.length
      ? sectionState.servers.map((server) => buildListCard(server)).join('')
      : '<div class="py-8 text-center text-sm text-gray-500">No personal integrations yet. Add one to connect a tool server.</div>';

    const content = `
      ${sectionState.error ? renderErrorBanner({ message: sectionState.error }) : ''}

      ${renderSubsection({
        label: 'MCP SERVERS',
        description: 'Your personal MCP server integrations',
        content: serverMarkup,
      })}
    `;

    const shellHtml = renderSettingsShell({
      contentHtml: renderSettingsPageLayout({
        header,
        content,
      }),
    });

    container.innerHTML = shellHtml;

    container.querySelector('[data-action="add-integration"]')?.addEventListener('click', () => {
      openModal(null);
    });

    container.querySelectorAll('[data-list-action="edit"]').forEach((button) => {
      button.addEventListener('click', () => {
        const serverId = button.closest('[data-list-action]')?.dataset.id;
        const server = sectionState.servers.find((item) => item.id === serverId);
        if (server) openModal(server);
      });
    });

    container.querySelectorAll('[data-list-action="delete"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const serverId = button.closest('[data-list-action]')?.dataset.id;
        const server = sectionState.servers.find((item) => item.id === serverId);
        if (!server) return;
        if (!window.confirm(`Delete integration ${server.name || server.id}? This cannot be undone.`)) return;
        sectionState.error = '';
        render();
        try {
          await deleteUserMcpServer(server.id);
          await refreshServers();
        } catch (err) {
          sectionState.error = err?.message || 'Failed to delete integration';
          render();
        }
      });
    });
  };

  const refreshServers = async () => {
    const nextState = typeof onRefresh === 'function' ? await onRefresh() : null;
    if (nextState?.settings?.integrations?.servers) {
      sectionState.servers = nextState.settings.integrations.servers.map(normalizeServer).filter(Boolean);
    } else {
      const payload = await fetchUserMcpServers({ cache: 'no-store' });
      sectionState.servers = Array.isArray(payload?.servers)
        ? payload.servers.map(normalizeServer).filter(Boolean)
        : [];
    }
    sectionState.error = '';
    render();
  };

  const closeModal = () => {
    activeModal?.remove();
    activeModal = null;
  };

  const setSaving = (saving, saveBtn, deleteBtn) => {
    sectionState.saving = saving;
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

  const openModal = (server = null) => {
    closeModal();
    const isEdit = Boolean(server?.id);
    const title = isEdit ? 'Edit Integration' : 'Add Integration';
    const subtitle = isEdit
      ? `${server.name || server.id || 'Integration'} · Personal MCP server`
      : 'Create a personal MCP server for your account.';
    const { modal, overlay, closeBtn, bodyEl } = createSettingsModalShell({
      rootId: 'account-integration-modal',
      title,
      subtitle,
      body: buildFormMarkup(server),
      footer: `
        <div class="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
          <div class="text-xs text-gray-400">
            ${isEdit ? 'Update the integration details and save changes.' : 'Create a new personal integration.'}
          </div>
          <div class="flex items-center gap-2">
            ${isEdit ? `
              <button type="button" data-account-integration-delete-modal class="rounded-full border border-red-100 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition">
                Delete
              </button>
            ` : ''}
            <button type="button" data-account-integration-cancel class="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="button" data-account-integration-test class="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
              Test
            </button>
            <button type="button" data-account-integration-save class="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition">
              Save
            </button>
          </div>
        </div>
      `,
    });

    activeModal = modal;
    const form = bodyEl?.querySelector('#account-integration-form');
    const errorEl = bodyEl?.querySelector('[data-account-integration-form-error]');
    const authTypeSelect = bodyEl?.querySelector('[name="auth_type"]');
    const saveBtn = modal.querySelector('[data-account-integration-save]');
    const deleteBtn = modal.querySelector('[data-account-integration-delete-modal]');
    const cancelBtn = modal.querySelector('[data-account-integration-cancel]');
    const testBtn = modal.querySelector('[data-account-integration-test]');

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

    const updateAuthFields = () => {
      const authType = String(authTypeSelect?.value || 'none').toLowerCase();
      const bearer = bodyEl?.querySelector('[data-account-integration-auth-bearer]');
      const basic = bodyEl?.querySelector('[data-account-integration-auth-basic]');
      const oauth = bodyEl?.querySelector('[data-account-integration-auth-oauth]');
      if (bearer) bearer.classList.toggle('hidden', !shouldShowAuthField(authType, 'bearer'));
      if (basic) basic.classList.toggle('hidden', !shouldShowAuthField(authType, 'basic'));
      if (oauth) oauth.classList.toggle('hidden', !shouldShowAuthField(authType, 'oauth'));
    };

    const buildPayload = () => {
      const formData = new FormData(form);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        url: String(formData.get('url') || '').trim(),
        headers: String(formData.get('headers') || '').trim(),
        enabled: formData.get('enabled') === 'on',
        auth_type: String(formData.get('auth_type') || 'none').trim().toLowerCase(),
        auth_bearer_token: String(formData.get('auth_bearer_token') || '').trim(),
        auth_basic_username: String(formData.get('auth_basic_username') || '').trim(),
        auth_basic_password: String(formData.get('auth_basic_password') || ''),
        oauth_client_name: String(formData.get('oauth_client_name') || '').trim(),
        oauth_scope: String(formData.get('oauth_scope') || '').trim(),
        oauth_client_id: String(formData.get('oauth_client_id') || '').trim(),
        oauth_client_secret: String(formData.get('oauth_client_secret') || ''),
        oauth_token_auth_method: String(formData.get('oauth_token_auth_method') || '').trim(),
      };
      if (!payload.headers) delete payload.headers;
      if (!payload.auth_bearer_token) delete payload.auth_bearer_token;
      if (!payload.auth_basic_username) delete payload.auth_basic_username;
      if (!payload.auth_basic_password) delete payload.auth_basic_password;
      if (!payload.oauth_client_name) delete payload.oauth_client_name;
      if (!payload.oauth_scope) delete payload.oauth_scope;
      if (!payload.oauth_client_id) delete payload.oauth_client_id;
      if (!payload.oauth_client_secret) delete payload.oauth_client_secret;
      if (!payload.oauth_token_auth_method) delete payload.oauth_token_auth_method;
      return payload;
    };

    const saveServer = async () => {
      if (!form) return;
      const payload = buildPayload();
      if (!payload.name) throw new Error('Name is required');
      if (!payload.url) throw new Error('URL is required');
      if (!/^https?:\/\//i.test(payload.url)) {
        throw new Error('URL must start with http:// or https://');
      }
      if (isEdit) {
        await updateUserMcpServer(server.id, payload);
      } else {
        await createUserMcpServer(payload);
      }
    };

    const testServer = async () => {
      const payload = buildPayload();
      if (!payload.url) throw new Error('URL is required');
      const result = await testUserMcpServer(payload);
      const message = Array.isArray(result?.tools)
        ? `Connection successful: ${result.tools.length} tools`
        : 'Connection successful';
      setError(message);
      errorEl?.classList.remove('border-red-100', 'bg-red-50', 'text-red-600');
      errorEl?.classList.add('border-emerald-100', 'bg-emerald-50', 'text-emerald-700');
      errorEl?.classList.remove('hidden');
    };

    const finishAndRefresh = async () => {
      closeModal();
      await refreshServers();
    };

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (sectionState.saving) return;
      setError('');
      setSaving(true, saveBtn, deleteBtn);
      try {
        await saveServer();
        await finishAndRefresh();
      } catch (err) {
        setError(err?.message || 'Failed to save integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    saveBtn?.addEventListener('click', () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    testBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      setError('');
      setSaving(true, saveBtn, deleteBtn);
      try {
        await testServer();
      } catch (err) {
        setError(err?.message || 'Failed to test integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (sectionState.saving || !isEdit) return;
      if (!window.confirm(`Delete integration ${server.name || server.id}? This cannot be undone.`)) return;
      setError('');
      setSaving(true, saveBtn, deleteBtn);
      try {
        await deleteUserMcpServer(server.id);
        await finishAndRefresh();
      } catch (err) {
        setError(err?.message || 'Failed to delete integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    cancelBtn?.addEventListener('click', closeModal);
    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);
    authTypeSelect?.addEventListener('change', updateAuthFields);
    updateAuthFields();

    document.body.appendChild(modal);
    return modal;
  };

  render();
}
