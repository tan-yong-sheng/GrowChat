import { getAdminModalPreset } from '../../features/admin/modal-shell.js';

const STANDARD_MODAL_PRESET = getAdminModalPreset('standard');

const AUTH_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
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

function shouldShowAuthField(authType, fieldType) {
  return String(authType || 'none').toLowerCase() === fieldType;
}

export function buildMcpServerModalMarkup({
  rootId = 'edit-connection-modal',
  server = null,
  isVisible = true,
  modalMode = 'create',
} = {}) {
  const authType = String(server?.auth_type || 'none').toLowerCase();
  const headersValue = formatHeadersValue(server?.headers);
  const hiddenClass = isVisible ? '' : ' hidden';
  return `
    <div id="${escapeHtml(rootId)}" class="${STANDARD_MODAL_PRESET.outerClass}${hiddenClass}" style="z-index: ${STANDARD_MODAL_PRESET.zIndex};">
      <div class="${STANDARD_MODAL_PRESET.overlayClass}"></div>
      <div class="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="px-6 pt-6 pb-4 flex justify-between items-center">
          <h3 id="server-modal-title" class="text-lg font-medium text-gray-900">${modalMode === 'update' ? 'Edit MCP Server' : 'Add MCP Server'}</h3>
          <button id="close-modal" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Server Name</label>
            <input id="server-name" type="text" value="${escapeHtml(server?.name || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="e.g. Default Tool Server" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">URL</label>
            <div class="flex items-center gap-2">
              <input id="server-url" type="text" value="${escapeHtml(server?.url || '')}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="http://localhost:5000/mcp" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
              <button id="test-server" class="p-1 text-gray-400 hover:text-gray-600" title="Test server">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>
                </svg>
              </button>
            </div>
            <div id="server-test-message" class="text-[11px] text-gray-400 hidden"></div>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Auth Type</label>
            <select id="server-auth-type" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900">
              ${AUTH_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${authType === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </div>

          <div id="auth-bearer-fields" class="space-y-1${shouldShowAuthField(authType, 'bearer') ? '' : ' hidden'}">
            <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bearer Token</label>
            <div class="flex items-center gap-3">
              <div class="flex-1 relative">
                <input id="server-auth-bearer" type="password" value="${escapeHtml(server?.auth_bearer_token || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8" placeholder="Bearer token" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
                <button id="toggle-bearer-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c3.41 0 6.446 1.315 8.613 3.447 1.12 1.101 2.04 2.484 2.747 4.033a1.015 1.012 0 0 1 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12.013a3 3 0 1 1-6 0 3 0 0 1 6 0Z"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div id="auth-basic-fields" class="space-y-3${shouldShowAuthField(authType, 'basic') ? '' : ' hidden'}">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Username</label>
              <input id="server-auth-basic-username" type="text" value="${escapeHtml(server?.auth_basic_username || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="Username" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Password</label>
              <div class="flex items-center gap-3">
                <div class="flex-1 relative">
                  <input id="server-auth-basic-password" type="password" value="${escapeHtml(server?.auth_basic_password || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8" placeholder="Password" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
                  <button id="toggle-basic-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c3.41 0 6.446 1.315 8.613 3.447 1.12 1.101 2.04 2.484 2.747 4.033a1.015 1.012 0 0 1 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12.013a3 3 0 1 1-6 0 3 0 0 1 6 0Z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div id="auth-oauth-fields" class="space-y-3${shouldShowAuthField(authType, 'oauth') ? '' : ' hidden'}">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Client Name</label>
              <input id="server-auth-oauth-client-name" type="text" value="${escapeHtml(server?.oauth_client_name || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="GrowChat MCP Client" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Scope</label>
              <input id="server-auth-oauth-scope" type="text" value="${escapeHtml(server?.oauth_scope || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="optional" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Client ID</label>
              <input id="server-auth-oauth-client-id" type="text" value="${escapeHtml(server?.oauth_client_id || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="Leave blank to auto-register" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Client Secret</label>
              <input id="server-auth-oauth-client-secret" type="password" value="${escapeHtml(server?.oauth_client_secret || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400" placeholder="Optional" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Token Auth Method</label>
              <select id="server-auth-oauth-token-method" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900">
                <option value="">Auto</option>
                <option value="client_secret_basic"${server?.oauth_token_auth_method === 'client_secret_basic' ? ' selected' : ''}>client_secret_basic</option>
                <option value="client_secret_post"${server?.oauth_token_auth_method === 'client_secret_post' ? ' selected' : ''}>client_secret_post</option>
                <option value="none"${server?.oauth_token_auth_method === 'none' ? ' selected' : ''}>none</option>
              </select>
            </div>
            <div class="flex items-center gap-3">
              <button id="connect-oauth" class="px-4 py-1.5 text-xs font-medium text-white bg-black hover:bg-gray-900 transition rounded-full">Connect OAuth</button>
              <div id="oauth-status" class="text-[11px] text-gray-500">${server?.oauth_connected ? 'Connected' : 'Not connected'}</div>
            </div>
            <div class="text-[11px] text-gray-400">OAuth requires saving the server first.</div>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Headers</label>
            <textarea id="server-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none" placeholder="Enter additional headers in JSON format">${escapeHtml(headersValue)}</textarea>
          </div>
        </div>

        <div class="px-6 py-6 flex justify-end gap-3">
          <button id="delete-server" class="px-5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition rounded-full ${server ? '' : 'hidden'}">Delete</button>
          <button id="save-modal" class="px-5 py-1.5 text-sm font-medium text-white bg-black hover:bg-gray-900 transition rounded-full">Save</button>
        </div>
      </div>
    </div>
  `;
}
