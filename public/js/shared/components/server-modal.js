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
  canManage = true,
  rootAttrs = '',
} = {}) {
  const authType = String(server?.auth_type || 'none').toLowerCase();
  const headersValue = formatHeadersValue(server?.headers);
  const hiddenClass = isVisible ? '' : ' hidden';
  const disabledAttr = canManage ? '' : ' disabled aria-disabled="true"';
  const disabledControlClass = canManage ? '' : ' opacity-50 cursor-not-allowed';
  const rootAttrsMarkup = rootAttrs ? ` ${rootAttrs}` : '';

  return `
    <div id="${escapeHtml(rootId)}" class="${STANDARD_MODAL_PRESET.outerClass}${hiddenClass}" style="z-index: ${STANDARD_MODAL_PRESET.zIndex};"${rootAttrsMarkup}>
      <div class="${STANDARD_MODAL_PRESET.overlayClass}"></div>
      <div class="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="px-6 pt-6 pb-4 flex justify-between items-center">
          <h3 id="server-modal-title" class="text-lg font-medium text-gray-900">${modalMode === 'update' ? 'Edit MCP Server' : 'Add MCP Server'}</h3>
          <button id="close-modal" class="p-1 text-gray-600 hover:text-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Server Name</label>
            <input id="server-name" type="text" value="${escapeHtml(server?.name || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="e.g. Default Tool Server" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Server Name"${disabledAttr}>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">URL</label>
            <div class="flex items-center gap-2">
              <input id="server-url" type="text" value="${escapeHtml(server?.url || '')}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="http://localhost:5000/mcp" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Server URL"${disabledAttr}>
              <button id="test-server" class="p-1 text-gray-600 hover:text-gray-700${disabledControlClass}" title="Test server"${disabledAttr}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>
                </svg>
              </button>
            </div>
            <div id="server-test-message" class="text-[11px] text-gray-600 hidden"></div>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Auth Type</label>
            <select id="server-auth-type" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}" aria-label="Auth Type"${disabledAttr}>
              ${AUTH_TYPE_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}"${authType === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </div>

          <div id="auth-bearer-fields" class="space-y-1${shouldShowAuthField(authType, 'bearer') ? '' : ' hidden'}">
            <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Bearer Token</label>
            <div class="flex items-center gap-3">
              <div class="flex-1 relative">
                <input id="server-auth-bearer" type="password" value="${escapeHtml(server?.auth_bearer_token || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="Bearer token" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Bearer Token"${disabledAttr}>
                <button id="toggle-bearer-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 hover:text-gray-700${disabledControlClass}" aria-label="Show bearer token"${disabledAttr}>
                  <span data-password-toggle-label>Show</span>
                </button>
              </div>
            </div>
          </div>

          <div id="auth-basic-fields" class="space-y-3${shouldShowAuthField(authType, 'basic') ? '' : ' hidden'}">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Username</label>
              <input id="server-auth-basic-username" type="text" value="${escapeHtml(server?.auth_basic_username || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="Username" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Username"${disabledAttr}>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Password</label>
              <div class="flex items-center gap-3">
                <div class="flex-1 relative">
                  <input id="server-auth-basic-password" type="password" value="${escapeHtml(server?.auth_basic_password || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="Password" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Password"${disabledAttr}>
                  <button id="toggle-basic-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 hover:text-gray-700${disabledControlClass}" aria-label="Show password"${disabledAttr}>
                    <span data-password-toggle-label>Show</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div id="auth-oauth-fields" class="space-y-3${shouldShowAuthField(authType, 'oauth') ? '' : ' hidden'}">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Client Name</label>
              <input id="server-auth-oauth-client-name" type="text" value="${escapeHtml(server?.oauth_client_name || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="GrowChat MCP Client" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Client Name"${disabledAttr}>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Scope</label>
              <input id="server-auth-oauth-scope" type="text" value="${escapeHtml(server?.oauth_scope || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="optional" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Scope"${disabledAttr}>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Client ID</label>
              <input id="server-auth-oauth-client-id" type="text" value="${escapeHtml(server?.oauth_client_id || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="Leave blank to auto-register" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Client ID"${disabledAttr}>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Client Secret</label>
              <input id="server-auth-oauth-client-secret" type="password" value="${escapeHtml(server?.oauth_client_secret || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="Optional" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Client Secret"${disabledAttr}>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Token Auth Method</label>
              <select id="server-auth-oauth-token-method" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}" aria-label="Token Auth Method"${disabledAttr}>
                <option value="">Auto</option>
                <option value="client_secret_basic"${server?.oauth_token_auth_method === 'client_secret_basic' ? ' selected' : ''}>client_secret_basic</option>
                <option value="client_secret_post"${server?.oauth_token_auth_method === 'client_secret_post' ? ' selected' : ''}>client_secret_post</option>
                <option value="none"${server?.oauth_token_auth_method === 'none' ? ' selected' : ''}>none</option>
              </select>
            </div>
            <div class="flex items-center gap-3">
              <button id="connect-oauth" class="px-4 py-1.5 text-xs font-medium text-white bg-black hover:bg-gray-900 transition rounded-full${disabledControlClass}"${disabledAttr}>Connect OAuth</button>
              <div id="oauth-status" class="text-[11px] text-gray-600">${server?.oauth_connected ? 'Connected' : 'Not connected'}</div>
            </div>
            <div class="text-[11px] text-gray-600">OAuth requires saving the server first.</div>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Headers</label>
            <textarea id="server-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none${disabledControlClass}" placeholder="Enter additional headers in JSON format" aria-label="Headers"${disabledAttr}>${escapeHtml(headersValue)}</textarea>
          </div>
        </div>

        <div class="px-6 py-6 flex justify-end gap-3">
          <button id="delete-server" class="px-5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition rounded-full${server ? '' : ' hidden'}${disabledControlClass}"${canManage ? '' : ' disabled'}>Delete</button>
          <button id="save-modal" class="px-5 py-1.5 text-sm font-medium text-white bg-black hover:bg-gray-900 transition rounded-full${disabledControlClass}"${canManage ? '' : ' disabled'}>Save</button>
        </div>
      </div>
    </div>
  `;
}
