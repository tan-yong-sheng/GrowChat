import {
  createUserMcpServer,
  deleteUserMcpServer,
  fetchUserMcpServers,
  testUserMcpServer,
  updateUserMcpServer,
} from '../../shared/api/resources.js';
import { apiFetch } from '../../shared/api.js';
import { buildMcpServerModalMarkup } from '../../shared/components/server-modal.js';
import { renderSettingsActionFooter } from '../../shared/components/settings-action-footer.js';
import { renderErrorBanner } from '../../shared/components/section-header.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeTool(tool = {}) {
  const name = String(tool.name || tool.id || tool.title || '').trim();
  if (!name) return null;
  return {
    name,
    title: String(tool.title || tool.name || name).trim(),
    description: String(tool.description || '').trim(),
    enabled: tool.enabled !== false,
    _expanded: Boolean(tool._expanded),
  };
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
    tools: Array.isArray(server.tools) ? server.tools.map(normalizeTool).filter(Boolean) : [],
    toolsExpanded: Boolean(server.toolsExpanded),
    toolsError: String(server.toolsError || '').trim(),
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

function renderLoadingSkeleton() {
  return `
    <div class="space-y-2">
      ${Array.from({ length: 4 }).map(() => `
        <div class="border-b border-gray-50 last:border-0">
          <div class="py-2.5 flex items-center justify-between pr-2 animate-pulse">
            <div class="flex flex-col min-w-0 flex-1 space-y-2">
              <div class="h-3.5 w-40 bg-gray-200 rounded-full"></div>
              <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
              <div class="h-2.5 w-56 bg-gray-100 rounded-full"></div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="h-6 w-12 rounded-full bg-gray-100 border border-gray-200"></div>
              <div class="h-6 w-6 rounded-full bg-gray-100 border border-gray-200"></div>
              <div class="h-5 w-9 rounded-full bg-gray-100 border border-gray-200"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildFormMarkup(server = null, modalMode = 'create') {
  return buildMcpServerModalMarkup({
    rootId: 'account-integration-modal',
    server,
    isVisible: true,
    modalMode,
  });
}

function buildListCard(server) {
  const serverEnabled = server.enabled !== false;
  const tools = Array.isArray(server.tools) ? server.tools : [];
  const enabledCount = tools.filter((tool) => tool.enabled !== false).length;
  const totalCount = tools.length;
  return `
    <div data-tool-server-row="${escapeHtml(server.id)}" data-id="${escapeHtml(server.id)}" class="border-b border-gray-50 last:border-0 ${serverEnabled ? '' : 'opacity-70'}">
      <div class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2">
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-xs font-medium text-gray-900">${escapeHtml(server.name || server.id || 'Integration')}</div>
            <span data-server-disabled-badge class="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500 ${serverEnabled ? 'hidden' : ''}">Disabled</span>
          </div>
          <div class="text-[10px] text-gray-400 font-mono">${escapeHtml(server.url || '')}</div>
          <div class="text-[10px] text-gray-400 mt-1">
            Tools: <span class="text-gray-900">${enabledCount}</span> / <span class="text-gray-900">${totalCount}</span> enabled
            ${server.toolsError ? '<span class="text-red-500 ml-2">Last verify failed</span>' : ''}
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 self-end sm:self-auto flex-wrap">
          <button
            type="button"
            data-list-action="edit"
            data-account-integration-edit="${escapeHtml(server.id)}"
            class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          <button data-id="${escapeHtml(server.id)}" class="server-toggle relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${serverEnabled ? 'bg-black' : 'bg-gray-200'}">
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${serverEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
          ${tools.length ? `
            <button data-id="${escapeHtml(server.id)}" class="tools-toggle p-1 text-gray-400 hover:text-gray-600 transition-colors ml-1" title="Toggle tools">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4 ${server.toolsExpanded ? 'rotate-180' : ''}">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      ${tools.length ? `
        <div class="px-2 pb-3 ${server.toolsExpanded ? '' : 'hidden'}">
          ${server.toolsError ? `<div class="text-[11px] text-red-500 mb-2">${escapeHtml(server.toolsError)}</div>` : ''}
          <div class="space-y-2">
            ${tools.map((tool) => {
              const description = String(tool.description || '');
              const maxLen = 160;
              const isExpanded = Boolean(tool._expanded);
              const hasMore = description.length > maxLen;
              const preview = hasMore && !isExpanded
                ? `${description.slice(0, maxLen).trimEnd()}…`
                : description;
              const toolEnabled = tool.enabled !== false;
              return `
                <div class="rounded-xl border border-gray-100 px-3 py-2 ${serverEnabled ? '' : 'bg-gray-50/70'}">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-xs font-medium text-gray-900">${escapeHtml(tool.title || tool.name || 'Tool')}</div>
                      <div class="text-[10px] text-gray-400 font-mono">${escapeHtml(tool.name || '')}</div>
                    </div>
                    <button
                      data-server-id="${escapeHtml(server.id)}"
                      data-tool-name="${escapeHtml(tool.name || '')}"
                      class="tool-toggle relative inline-flex h-5 w-9 items-center shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${toolEnabled ? 'bg-black' : 'bg-gray-200'} ${serverEnabled ? '' : 'opacity-40 cursor-not-allowed'}"
                      ${serverEnabled ? '' : 'disabled'}
                      aria-pressed="${toolEnabled ? 'true' : 'false'}"
                      aria-disabled="${serverEnabled ? 'false' : 'true'}"
                      title="${serverEnabled ? (toolEnabled ? 'Disable tool' : 'Enable tool') : 'Enable the server to edit tools'}"
                    >
                      <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toolEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
                    </button>
                  </div>
                  ${description ? `
                    <div class="text-[11px] text-gray-500 mt-1">${escapeHtml(preview)}</div>
                    ${hasMore ? `<button data-server-id="${escapeHtml(server.id)}" data-tool-name="${escapeHtml(tool.name || '')}" class="tool-desc-toggle text-[10px] text-gray-400 hover:text-gray-600 mt-1">${isExpanded ? 'Less' : 'More'}</button>` : ''}
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderAccountIntegrationsSection(container, state = {}, { onRefresh, footerHost } = {}) {
  const sectionState = {
    loading: false,
    saving: false,
    error: '',
    servers: Array.isArray(state.settings?.integrations?.servers)
      ? state.settings.integrations.servers.map(normalizeServer).filter(Boolean)
      : [],
  };

  let activeModal = null;

  const loadServers = async () => {
    sectionState.loading = true;
    sectionState.error = '';
    render();
    try {
      const payload = await fetchUserMcpServers({ cache: 'no-store' });
      sectionState.servers = Array.isArray(payload?.servers)
        ? payload.servers.map(normalizeServer).filter(Boolean)
        : [];
    } catch (err) {
      sectionState.error = err?.message || 'Failed to load integrations';
    } finally {
      sectionState.loading = false;
      render();
    }
  };

  const render = () => {
    const serverMarkup = sectionState.loading
      ? renderLoadingSkeleton()
      : sectionState.servers.length
        ? sectionState.servers.map((server) => buildListCard(server)).join('')
        : '<div class="py-10 text-center text-sm text-gray-400">No tool servers configured. Click + to add one.</div>';

    container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 animate-in fade-in duration-300 w-full">
        ${sectionState.error ? renderErrorBanner({ message: sectionState.error }) : ''}
        <div class="pt-0.5 pb-6 sticky top-0 z-10 bg-white">
          <div class="max-w-2xl mx-auto w-full flex justify-between items-center">
            <div class="flex items-center text-xl font-medium px-0.5 gap-2">
              <div class="flex-shrink-0 text-gray-900">Integrations</div>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto">
          <div class="max-w-2xl mx-auto w-full space-y-3 pb-6">
            <section class="space-y-1">
              <div class="flex items-center justify-between px-0.5">
                <div class="text-base font-medium text-gray-900">Manage MCP Servers</div>
                <button id="add-tool-server" data-account-integration-add class="p-1 text-gray-400 hover:text-gray-600 transition-colors" title="Add MCP Server" aria-label="Add MCP Server">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
              <hr class="border-gray-100/30 my-2" />

              <div id="tool-servers-list" class="space-y-2">
                ${serverMarkup}
              </div>
            </section>

            <div id="integrations-feedback" class="hidden mt-4 rounded-xl border px-4 py-3 text-sm"></div>
          </div>
        </div>
      </div>
    `;

    if (footerHost) {
      footerHost.innerHTML = renderSettingsActionFooter({
        footerId: 'integrations-action-footer',
        dirtyId: 'integrations-dirty',
        saveId: 'save-integrations',
      });
    }

    container.querySelector('[data-action="add-integration"], #add-tool-server, [data-account-integration-add]')?.addEventListener('click', () => {
      openModal(null);
    });

    container.querySelectorAll('[data-list-action="edit"]').forEach((button) => {
      button.addEventListener('click', () => {
        const serverId = button.dataset.accountIntegrationEdit || button.closest('[data-tool-server-row]')?.dataset.toolServerRow || button.closest('[data-id]')?.dataset.id;
        const server = sectionState.servers.find((item) => item.id === serverId);
        if (server) openModal(server);
      });
    });

    container.querySelectorAll('.server-toggle').forEach((toggle) => {
      toggle.addEventListener('click', async () => {
        const serverId = toggle.dataset.id || toggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
        const server = sectionState.servers.find((item) => item.id === serverId);
        if (!server) return;
        const nextEnabled = server.enabled === false;
        server.enabled = nextEnabled;
        updateServerToggle(toggle, nextEnabled);
        const row = toggle.closest('[data-tool-server-row]');
        if (row) {
          row.classList.toggle('opacity-70', !nextEnabled);
          const badge = row.querySelector('[data-server-disabled-badge]');
          if (badge) badge.classList.toggle('hidden', nextEnabled);
        }
        try {
          await updateUserMcpServer(server.id, { enabled: nextEnabled });
        } catch (err) {
          sectionState.error = err?.message || 'Failed to update integration';
          render();
          return;
        }
        await refreshServers();
      });
    });

    container.querySelectorAll('.tools-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const serverId = toggle.dataset.id || toggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
        const server = sectionState.servers.find((item) => item.id === serverId);
        if (!server) return;
        server.toolsExpanded = !server.toolsExpanded;
        render();
      });
    });

    container.querySelectorAll('.tool-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const serverId = button.dataset.serverId || button.closest('[data-tool-server-row]')?.dataset.toolServerRow;
        const toolName = button.dataset.toolName;
        const server = sectionState.servers.find((item) => item.id === serverId);
        if (!server || !Array.isArray(server.tools)) return;
        const tool = server.tools.find((item) => item.name === toolName);
        if (!tool) return;
        tool.enabled = tool.enabled === false;
        render();
      });
    });

    container.querySelectorAll('.tool-desc-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const serverId = button.dataset.serverId || button.closest('[data-tool-server-row]')?.dataset.toolServerRow;
        const toolName = button.dataset.toolName;
        const server = sectionState.servers.find((item) => item.id === serverId);
        if (!server || !Array.isArray(server.tools)) return;
        const tool = server.tools.find((item) => item.name === toolName);
        if (!tool) return;
        tool._expanded = !tool._expanded;
        render();
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
    const modalMarkup = buildFormMarkup(server, isEdit ? 'update' : 'create');
    const modalWrapper = document.createElement('div');
    modalWrapper.innerHTML = modalMarkup.trim();
    const modal = modalWrapper.firstElementChild;
    container.appendChild(modal);

    activeModal = modal;
    const bodyEl = modal;
    const overlay = modal.querySelector('.absolute.inset-0');
    const authTypeSelect = bodyEl?.querySelector('#server-auth-type');
    const saveBtn = modal.querySelector('#save-modal');
    const deleteBtn = modal.querySelector('#delete-server');
    const closeBtn = modal.querySelector('#close-modal');
    const testBtn = modal.querySelector('#test-server');
    const nameInput = bodyEl?.querySelector('#server-name');
    const urlInput = bodyEl?.querySelector('#server-url');
    const headersInput = bodyEl?.querySelector('#server-headers');
    const bearerInput = bodyEl?.querySelector('#server-auth-bearer');
    const basicUserInput = bodyEl?.querySelector('#server-auth-basic-username');
    const basicPassInput = bodyEl?.querySelector('#server-auth-basic-password');
    const oauthClientNameInput = bodyEl?.querySelector('#server-auth-oauth-client-name');
    const oauthScopeInput = bodyEl?.querySelector('#server-auth-oauth-scope');
    const oauthClientIdInput = bodyEl?.querySelector('#server-auth-oauth-client-id');
    const oauthClientSecretInput = bodyEl?.querySelector('#server-auth-oauth-client-secret');
    const oauthTokenMethodSelect = bodyEl?.querySelector('#server-auth-oauth-token-method');
    const oauthStatus = bodyEl?.querySelector('#oauth-status');
    const oauthConnectBtn = bodyEl?.querySelector('#connect-oauth');

    const setTestStatus = (status, message = '') => {
      const messageEl = bodyEl?.querySelector('#server-test-message');
      if (!messageEl) return;
      messageEl.textContent = message || '';
      messageEl.className = 'text-[11px] hidden';
      if (!message) {
        return;
      }
      messageEl.classList.remove('hidden');
      messageEl.classList.add(
        status === 'success'
          ? 'text-gray-900'
          : status === 'testing'
            ? 'text-gray-400'
            : 'text-red-500'
      );
    };

    const updateAuthFields = (authType = authTypeSelect?.value || 'none') => {
      const bearer = bodyEl?.querySelector('#auth-bearer-fields');
      const basic = bodyEl?.querySelector('#auth-basic-fields');
      const oauth = bodyEl?.querySelector('#auth-oauth-fields');
      if (bearer) bearer.classList.toggle('hidden', !shouldShowAuthField(authType, 'bearer'));
      if (basic) basic.classList.toggle('hidden', !shouldShowAuthField(authType, 'basic'));
      if (oauth) oauth.classList.toggle('hidden', !shouldShowAuthField(authType, 'oauth'));
    };

    const buildPayload = () => {
      const payload = {
        name: String(nameInput?.value || '').trim(),
        url: String(urlInput?.value || '').trim(),
        headers: String(headersInput?.value || '').trim(),
        enabled: true,
        auth_type: String(authTypeSelect?.value || 'none').trim().toLowerCase(),
        auth_bearer_token: String(bearerInput?.value || '').trim(),
        auth_basic_username: String(basicUserInput?.value || '').trim(),
        auth_basic_password: String(basicPassInput?.value || ''),
        oauth_client_name: String(oauthClientNameInput?.value || '').trim(),
        oauth_scope: String(oauthScopeInput?.value || '').trim(),
        oauth_client_id: String(oauthClientIdInput?.value || '').trim(),
        oauth_client_secret: String(oauthClientSecretInput?.value || ''),
        oauth_token_auth_method: String(oauthTokenMethodSelect?.value || '').trim(),
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
      setTestStatus('success', message);
    };

    const finishAndRefresh = async () => {
      closeModal();
      await refreshServers();
    };

    saveBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      setTestStatus('idle', '');
      setSaving(true, saveBtn, deleteBtn);
      try {
        await saveServer();
        await finishAndRefresh();
      } catch (err) {
        setTestStatus('error', err?.message || 'Failed to save integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    testBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      setTestStatus('idle', '');
      setSaving(true, saveBtn, deleteBtn);
      try {
        await testServer();
      } catch (err) {
        setTestStatus('error', err?.message || 'Failed to test integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (sectionState.saving || !isEdit) return;
      if (!window.confirm(`Delete integration ${server.name || server.id}? This cannot be undone.`)) return;
      setTestStatus('idle', '');
      setSaving(true, saveBtn, deleteBtn);
      try {
        await deleteUserMcpServer(server.id);
        await finishAndRefresh();
      } catch (err) {
        setTestStatus('error', err?.message || 'Failed to delete integration');
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    });

    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);
    authTypeSelect?.addEventListener('change', (e) => {
      updateAuthFields(e.target.value);
    });
    oauthConnectBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      if (authTypeSelect?.value !== 'oauth') return;
      const serverId = server?.id || '';
      if (!serverId) {
        setTestStatus('error', 'Save the server before connecting OAuth');
        return;
      }
      try {
        const res = await apiFetch('/api/users/me/resources/mcp-servers/oauth/start', {
          method: 'POST',
          body: JSON.stringify({
            id: serverId,
            name: String(nameInput?.value || '').trim(),
            url: String(urlInput?.value || '').trim(),
            headers: String(headersInput?.value || '').trim(),
            enabled: true,
            auth_type: 'oauth',
            auth_bearer_token: String(bearerInput?.value || '').trim(),
            auth_basic_username: String(basicUserInput?.value || '').trim(),
            auth_basic_password: String(basicPassInput?.value || ''),
            oauth_client_name: String(oauthClientNameInput?.value || '').trim(),
            oauth_scope: String(oauthScopeInput?.value || '').trim(),
            oauth_client_id: String(oauthClientIdInput?.value || '').trim(),
            oauth_client_secret: String(oauthClientSecretInput?.value || '').trim(),
            oauth_token_auth_method: String(oauthTokenMethodSelect?.value || '').trim(),
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || payload.message || 'OAuth start failed');
        }
        if (payload.authorization_url) {
          window.open(payload.authorization_url, '_blank', 'noopener,noreferrer');
          if (oauthStatus) oauthStatus.textContent = 'Awaiting authorization...';
          setTestStatus('success', 'OAuth authorization started');
        }
      } catch (err) {
        setTestStatus('error', err?.message || 'OAuth start failed');
      }
    });
    updateAuthFields();
    return modal;
  };

  render();
  loadServers();
}
