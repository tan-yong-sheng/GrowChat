import {
  createUserConnection,
  createUserMcpServer,
  deleteUserConnection,
  deleteUserMcpServer,
  fetchToolServers,
  fetchUserConnections,
  fetchUserMcpServers,
  testUserMcpServer,
  updateUserConnection,
  updateUserMcpServer,
} from '../../shared/api.js';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const PROVIDER_OPTIONS = [
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'gemini-compatible', label: 'Gemini Compatible' },
  { value: 'claude-compatible', label: 'Claude Compatible' },
  { value: 'openai', label: 'OpenAI' },
];

const AUTH_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'basic', label: 'Basic' },
];

function badgeClass(kind = 'neutral') {
  if (kind === 'personal') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (kind === 'shared') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (kind === 'admin') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (kind === 'mcp') return 'bg-violet-100 text-violet-700 border-violet-200';
  if (kind === 'connection') return 'bg-cyan-100 text-cyan-700 border-cyan-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function renderBadge(label, kind = 'neutral') {
  return `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(kind)}">${escapeHtml(label)}</span>`;
}

function resourceCardBase() {
  return 'rounded-3xl border border-gray-200 bg-white shadow-sm';
}

function renderEmptyState(title, subtitle) {
  return `
    <div class="rounded-3xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-6 text-center">
      <div class="text-sm font-semibold text-gray-900">${escapeHtml(title)}</div>
      <div class="mt-1 text-sm text-gray-500">${escapeHtml(subtitle)}</div>
    </div>
  `;
}

function normalizeHeadersText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '{}';
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Headers must be a JSON object');
    }
    return JSON.stringify(parsed);
  } catch {
    throw new Error('Headers must be valid JSON');
  }
}

function renderSectionHeader(title, description, actionLabel, actionId) {
  return `
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="text-lg font-semibold text-gray-900">${escapeHtml(title)}</div>
        <div class="mt-1 text-sm text-gray-500">${escapeHtml(description)}</div>
      </div>
      ${actionLabel ? `
        <button data-action="${escapeHtml(actionId)}" class="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition">
          ${escapeHtml(actionLabel)}
        </button>
      ` : ''}
    </div>
  `;
}

function renderResourceRow({
  title,
  note,
  badges = [],
  actions = '',
}) {
  return `
    <div class="flex items-start justify-between gap-4 rounded-3xl border border-gray-200 bg-white px-4 py-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(title)}</div>
          ${badges.join('')}
        </div>
        <div class="mt-1 text-xs text-gray-500 break-all">${escapeHtml(note)}</div>
      </div>
      ${actions}
    </div>
  `;
}

function getAccessBadge(value) {
  const label = String(value || '').trim() || 'Admin';
  const kind = label.toLowerCase();
  return renderBadge(label, kind);
}

function getTypeBadge(value) {
  return renderBadge(String(value || '').trim() || 'Resource', 'neutral');
}

function buildConnectionPayload(form) {
  return {
    name: form.querySelector('[name="name"]').value.trim(),
    provider_type: form.querySelector('[name="provider_type"]').value,
    base_url: form.querySelector('[name="base_url"]').value.trim(),
    key: form.querySelector('[name="key"]').value,
    headers: normalizeHeadersText(form.querySelector('[name="headers"]').value),
    enabled: form.querySelector('[name="enabled"]').checked,
  };
}

function buildMcpPayload(form) {
  const authType = form.querySelector('[name="auth_type"]').value;
  return {
    name: form.querySelector('[name="name"]').value.trim(),
    url: form.querySelector('[name="url"]').value.trim(),
    headers: normalizeHeadersText(form.querySelector('[name="headers"]').value),
    auth_type: authType,
    auth_bearer_token: form.querySelector('[name="auth_bearer_token"]').value,
    auth_basic_username: form.querySelector('[name="auth_basic_username"]').value,
    auth_basic_password: form.querySelector('[name="auth_basic_password"]').value,
    enabled: form.querySelector('[name="enabled"]').checked,
  };
}

function openModal({ title, subtitle, body, footer, widthClass = 'max-w-2xl' }) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/25 backdrop-blur-sm"></div>
    <div class="relative w-full ${widthClass} bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]">
      <div class="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 shrink-0">
        <div>
          <div class="text-lg font-semibold">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="text-[11px] text-gray-500 mt-1">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <button type="button" class="p-2 rounded-full hover:bg-gray-100 transition" data-close-modal aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0">
        ${body}
      </div>
      <div class="px-5 py-3 border-t border-gray-200 bg-white flex items-center justify-between shrink-0">
        <div class="text-sm text-red-600" data-modal-error></div>
        <div class="flex items-center gap-2">
          ${footer}
        </div>
      </div>
    </div>
  `;

  const close = () => modal.remove();
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-close-modal]')) {
      close();
    }
  });

  document.body.appendChild(modal);
  return { modal, close };
}

function connectionModalMarkup(connection = null) {
  const providerType = connection?.provider_type || connection?.providerType || 'openai-compatible';
  const name = connection?.name || '';
  const baseUrl = connection?.base_url || connection?.baseUrl || '';
  const key = connection?.key || '';
  const headers = typeof connection?.headers === 'string'
    ? connection.headers
    : JSON.stringify(connection?.headers || {}, null, 2);
  const enabled = connection?.enabled !== false;
  return `
    <form class="space-y-4" data-resource-form="connection">
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Name</span>
        <input name="name" value="${escapeHtml(name)}" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400" placeholder="My Connection">
      </label>
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Provider</span>
        <select name="provider_type" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400">
          ${PROVIDER_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === providerType ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </label>
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Base URL</span>
        <input name="base_url" value="${escapeHtml(baseUrl)}" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400" placeholder="https://api.openai.com/v1">
      </label>
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">API Key</span>
        <input name="key" value="${escapeHtml(key)}" type="password" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400" placeholder="sk-...">
      </label>
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Headers JSON</span>
        <textarea name="headers" rows="4" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400 resize-none font-mono">${escapeHtml(headers)}</textarea>
      </label>
      <label class="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400">
        <span class="text-sm text-gray-700">Enabled</span>
      </label>
    </form>
  `;
}

function mcpModalMarkup(server = null) {
  const authType = server?.auth_type || server?.authType || 'none';
  const headers = typeof server?.headers === 'string'
    ? server.headers
    : JSON.stringify(server?.headers || {}, null, 2);
  const enabled = server?.enabled !== false;
  return `
    <form class="space-y-4" data-resource-form="mcp">
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Name</span>
        <input name="name" value="${escapeHtml(server?.name || '')}" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400" placeholder="My MCP Server">
      </label>
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">URL</span>
        <input name="url" value="${escapeHtml(server?.url || '')}" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400" placeholder="https://example.com/mcp">
      </label>
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Auth Type</span>
        <select name="auth_type" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400">
          ${AUTH_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === authType ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </label>
      <div data-auth-section="bearer" class="${authType === 'bearer' ? '' : 'hidden'} space-y-2">
        <label class="block space-y-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Bearer Token</span>
          <input name="auth_bearer_token" value="${escapeHtml(server?.auth_bearer_token || '')}" type="password" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400" placeholder="Bearer token">
        </label>
      </div>
      <div data-auth-section="basic" class="${authType === 'basic' ? '' : 'hidden'} space-y-2">
        <label class="block space-y-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Basic Username</span>
          <input name="auth_basic_username" value="${escapeHtml(server?.auth_basic_username || '')}" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400" placeholder="username">
        </label>
        <label class="block space-y-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Basic Password</span>
          <input name="auth_basic_password" value="${escapeHtml(server?.auth_basic_password || '')}" type="password" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400" placeholder="password">
        </label>
      </div>
      <label class="block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Headers JSON</span>
        <textarea name="headers" rows="4" class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-gray-400 resize-none font-mono">${escapeHtml(headers)}</textarea>
      </label>
      <label class="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400">
        <span class="text-sm text-gray-700">Enabled</span>
      </label>
      <div class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        Personal MCP servers are owned by you. Admin resources stay read-only here.
      </div>
    </form>
  `;
}

export async function renderUserResources(container) {
  if (!container) return;
  if (typeof container.__cleanup === 'function') {
    container.__cleanup();
  }

  const state = {
    loading: true,
    error: null,
    myConnections: [],
    accessibleConnections: [],
    myMcpServers: [],
    accessibleMcpServers: [],
  };

  container.dataset.view = 'user-settings';

  const render = () => {
    const loading = state.loading;
    const error = state.error;
    const accessibleItems = [
      ...state.accessibleConnections.map((item) => ({
        kind: 'Connection',
        title: item.name || item.id,
        note: item.note || item.base_url || item.baseUrl || '',
        accessLabel: item.access_label || 'Admin',
        accessVariant: item.access_variant || 'admin',
      })),
      ...state.accessibleMcpServers
        .filter((item) => item.access_variant !== 'personal')
        .map((item) => ({
          kind: 'MCP Server',
          title: item.name || item.id,
          note: item.note || item.url || '',
          accessLabel: item.access_label || 'Admin',
          accessVariant: item.access_variant || 'admin',
        })),
    ];

    container.innerHTML = `
      <div class="min-h-screen bg-[#fafafa] text-gray-900">
        <div class="max-w-6xl mx-auto px-4 py-6 space-y-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="text-2xl font-semibold tracking-tight">Resources</div>
              <div class="mt-1 text-sm text-gray-500 max-w-2xl">
                Manage your personal connections and MCP servers. Shared and platform resources are shown read-only in one accessible list.
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button data-action="back" class="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">Back</button>
              <button data-action="refresh" class="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition">Refresh</button>
            </div>
          </div>

          ${error ? `
            <div class="rounded-3xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">${escapeHtml(error)}</div>
          ` : ''}

          <div class="grid gap-4 xl:grid-cols-2">
            <section class="${resourceCardBase()} p-5 space-y-4">
              ${renderSectionHeader('My Connections', 'Personal connection configs you own. They are usable in chat and can be edited or removed by you.', 'Add Connection', 'add-connection')}
              <div class="space-y-3">
                ${loading ? `
                  <div class="space-y-3 animate-pulse">
                    <div class="h-20 rounded-3xl bg-gray-100"></div>
                    <div class="h-20 rounded-3xl bg-gray-100"></div>
                  </div>
                ` : (
                  state.myConnections.length
                    ? state.myConnections.map((item) => `
                        <div class="flex items-start justify-between gap-4 rounded-3xl border border-gray-200 bg-white px-4 py-3">
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                              <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(item.name || 'Connection')}</div>
                              ${renderBadge('Personal', 'personal')}
                              ${renderBadge(item.provider_type || item.providerType || 'openai-compatible', 'connection')}
                            </div>
                            <div class="mt-1 text-xs text-gray-500 break-all">${escapeHtml(item.base_url || item.baseUrl || '')}</div>
                          </div>
                          <div class="flex items-center gap-2 shrink-0">
                            <button data-action="edit-connection" data-id="${escapeHtml(item.id)}" class="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition">Edit</button>
                            <button data-action="delete-connection" data-id="${escapeHtml(item.id)}" class="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition">Delete</button>
                          </div>
                        </div>
                      `).join('')
                    : renderEmptyState('No personal connections yet', 'Create one to connect a provider for your own use.')
                )}
              </div>
            </section>

            <section class="${resourceCardBase()} p-5 space-y-4">
              ${renderSectionHeader('My MCP Servers', 'Personal MCP servers you own. You can test, edit, or remove them.', 'Add MCP Server', 'add-mcp')}
              <div class="space-y-3">
                ${loading ? `
                  <div class="space-y-3 animate-pulse">
                    <div class="h-20 rounded-3xl bg-gray-100"></div>
                    <div class="h-20 rounded-3xl bg-gray-100"></div>
                  </div>
                ` : (
                  state.myMcpServers.length
                    ? state.myMcpServers.map((item) => `
                        <div class="flex items-start justify-between gap-4 rounded-3xl border border-gray-200 bg-white px-4 py-3">
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                              <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(item.name || 'MCP Server')}</div>
                              ${renderBadge('Personal', 'personal')}
                              ${renderBadge('MCP', 'mcp')}
                            </div>
                            <div class="mt-1 text-xs text-gray-500 break-all">${escapeHtml(item.url || '')}</div>
                          </div>
                          <div class="flex items-center gap-2 shrink-0">
                            <button data-action="edit-mcp" data-id="${escapeHtml(item.id)}" class="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition">Edit</button>
                            <button data-action="delete-mcp" data-id="${escapeHtml(item.id)}" class="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition">Delete</button>
                          </div>
                        </div>
                      `).join('')
                    : renderEmptyState('No personal MCP servers yet', 'Add one to make your own tools available in chat.')
                )}
              </div>
            </section>
          </div>

          <section class="${resourceCardBase()} p-5 space-y-4">
            ${renderSectionHeader('Accessible Resources', 'Resources you can use but do not own. Shared items are granted by ACL, while platform items are admin-owned.', '', '')}
            <div class="space-y-3">
              ${loading ? `
                <div class="space-y-3 animate-pulse">
                  <div class="h-16 rounded-3xl bg-gray-100"></div>
                  <div class="h-16 rounded-3xl bg-gray-100"></div>
                </div>
              ` : (
                accessibleItems.length
                  ? accessibleItems.map((item) => renderResourceRow({
                      title: item.title,
                      note: item.note,
                      badges: [
                        getTypeBadge(item.kind),
                        getAccessBadge(item.accessLabel),
                      ],
                    })).join('')
                  : renderEmptyState('No accessible resources yet', 'Shared and admin-owned resources will appear here after access is granted.')
              )}
            </div>
          </section>
        </div>
      </div>
    `;
  };

  const openConnectionEditor = async (connection = null) => {
    let currentConnection = connection;
    const { modal, close } = openModal({
      title: currentConnection ? 'Edit Connection' : 'Add Connection',
      subtitle: 'Personal connection settings',
      body: connectionModalMarkup(currentConnection),
      footer: `
        <button type="button" data-close-modal class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        <button type="button" data-save-connection class="px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800">Save</button>
      `,
      widthClass: 'max-w-2xl',
    });

    const form = modal.querySelector('[data-resource-form="connection"]');
    const providerSelect = form.querySelector('[name="provider_type"]');
    const saveBtn = modal.querySelector('[data-save-connection]');
    form.addEventListener('submit', (event) => event.preventDefault());

    providerSelect.addEventListener('change', () => {
      const baseUrl = form.querySelector('[name="base_url"]');
      if (!baseUrl.value.trim()) {
        const selected = PROVIDER_OPTIONS.find((option) => option.value === providerSelect.value);
        baseUrl.placeholder = selected?.value === 'gemini-compatible'
          ? 'https://generativelanguage.googleapis.com/v1beta'
          : (selected?.value === 'claude-compatible'
            ? 'https://api.anthropic.com/v1'
            : 'https://api.openai.com/v1');
      }
    });

    saveBtn.addEventListener('click', async () => {
      const errorEl = modal.querySelector('[data-modal-error]');
      errorEl.textContent = '';
      try {
        const payload = buildConnectionPayload(form);
        if (!payload.name) throw new Error('Name is required');
        if (!payload.base_url) throw new Error('Base URL is required');

        if (currentConnection?.id) {
          const res = await updateUserConnection(currentConnection.id, payload);
          currentConnection = res?.connection || currentConnection;
        } else {
          await createUserConnection(payload);
        }
        close();
        await load();
      } catch (err) {
        errorEl.textContent = err?.message || 'Failed to save connection';
      }
    });
  };

  const openMcpEditor = async (server = null) => {
    let currentServer = server;
    const { modal, close } = openModal({
      title: currentServer ? 'Edit MCP Server' : 'Add MCP Server',
      subtitle: 'Personal MCP server settings',
      body: `
        ${mcpModalMarkup(currentServer)}
        <div class="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500" data-test-result>
          Use Test to verify the endpoint before saving.
        </div>
      `,
      footer: `
        <button type="button" data-close-modal class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        <button type="button" data-test-mcp class="px-4 py-2 text-sm font-semibold rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">Test</button>
        <button type="button" data-save-mcp class="px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800">Save</button>
      `,
      widthClass: 'max-w-2xl',
    });

    const form = modal.querySelector('[data-resource-form="mcp"]');
    const authTypeSelect = form.querySelector('[name="auth_type"]');
    const bearerSection = form.querySelector('[data-auth-section="bearer"]');
    const basicSection = form.querySelector('[data-auth-section="basic"]');
    const testResult = modal.querySelector('[data-test-result]');
    form.addEventListener('submit', (event) => event.preventDefault());

    const syncAuthSections = () => {
      bearerSection.classList.toggle('hidden', authTypeSelect.value !== 'bearer');
      basicSection.classList.toggle('hidden', authTypeSelect.value !== 'basic');
    };

    authTypeSelect.addEventListener('change', syncAuthSections);
    syncAuthSections();

    modal.querySelector('[data-test-mcp]').addEventListener('click', async () => {
      try {
        const payload = buildMcpPayload(form);
        if (!payload.name) throw new Error('Name is required');
        if (!payload.url) throw new Error('URL is required');
        testResult.textContent = 'Testing...';
        const result = await testUserMcpServer(payload);
        const count = Array.isArray(result?.tools) ? result.tools.length : 0;
        testResult.textContent = `Test succeeded. ${count} tool${count === 1 ? '' : 's'} detected.`;
      } catch (err) {
        testResult.textContent = err?.message || 'Test failed';
      }
    });

    modal.querySelector('[data-save-mcp]').addEventListener('click', async () => {
      const errorEl = modal.querySelector('[data-modal-error]');
      errorEl.textContent = '';
      try {
        const payload = buildMcpPayload(form);
        if (!payload.name) throw new Error('Name is required');
        if (!payload.url) throw new Error('URL is required');
        if (currentServer?.id) {
          const res = await updateUserMcpServer(currentServer.id, payload);
          currentServer = res?.server || currentServer;
        } else {
          await createUserMcpServer(payload);
        }
        close();
        await load();
      } catch (err) {
        errorEl.textContent = err?.message || 'Failed to save MCP server';
      }
    });
  };

  const load = async () => {
    state.loading = true;
    state.error = null;
    render();
    try {
      const [connectionsData, mcpData, toolServerData] = await Promise.all([
        fetchUserConnections(),
        fetchUserMcpServers(),
        fetchToolServers(),
      ]);
      state.myConnections = Array.isArray(connectionsData?.my_connections) ? connectionsData.my_connections : [];
      state.accessibleConnections = Array.isArray(connectionsData?.connections) ? connectionsData.connections : [];
      state.myMcpServers = Array.isArray(mcpData?.servers) ? mcpData.servers : [];
      state.accessibleMcpServers = Array.isArray(toolServerData?.servers)
        ? toolServerData.servers.filter((item) => item.access_variant !== 'personal')
        : [];
    } catch (err) {
      state.error = err?.message || 'Failed to load resources';
    } finally {
      state.loading = false;
      render();
    }
  };

  const onClick = async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'back') {
      window.history.back();
      return;
    }

    if (action === 'refresh') {
      await load();
      return;
    }

    if (action === 'add-connection') {
      await openConnectionEditor();
      return;
    }

    if (action === 'add-mcp') {
      await openMcpEditor();
      return;
    }

    if (action === 'edit-connection') {
      const connection = state.myConnections.find((item) => String(item.id) === String(button.dataset.id));
      if (connection) await openConnectionEditor(connection);
      return;
    }

    if (action === 'delete-connection') {
      const connection = state.myConnections.find((item) => String(item.id) === String(button.dataset.id));
      if (!connection) return;
      if (!window.confirm(`Delete connection "${connection.name || connection.id}"?`)) return;
      try {
        await deleteUserConnection(connection.id);
        await load();
      } catch (err) {
        state.error = err?.message || 'Failed to delete connection';
        render();
      }
      return;
    }

    if (action === 'edit-mcp') {
      const server = state.myMcpServers.find((item) => String(item.id) === String(button.dataset.id));
      if (server) await openMcpEditor(server);
      return;
    }

    if (action === 'delete-mcp') {
      const server = state.myMcpServers.find((item) => String(item.id) === String(button.dataset.id));
      if (!server) return;
      if (!window.confirm(`Delete MCP server "${server.name || server.id}"?`)) return;
      try {
        await deleteUserMcpServer(server.id);
        await load();
      } catch (err) {
        state.error = err?.message || 'Failed to delete MCP server';
        render();
      }
    }
  };

  container.addEventListener('click', onClick);
  container.__cleanup = () => {
    container.removeEventListener('click', onClick);
  };

  render();
  await load();
}
