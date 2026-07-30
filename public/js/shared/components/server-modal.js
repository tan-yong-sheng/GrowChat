import { escapeHtml } from '../utils/dom-escape.js';
import { renderButton } from './button.js';

const STANDARD_MODAL_PRESET = {
  outerClass: 'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4',
  overlayClass: 'absolute inset-0 bg-primary/25 backdrop-blur-sm z-0',
  zIndex: 150,
};

const AUTH_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'oauth', label: 'OAuth 2.0 (PKCE)' },
];

const OAUTH_TOKEN_METHOD_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'client_secret_basic', label: 'client_secret_basic' },
  { value: 'client_secret_post', label: 'client_secret_post' },
  { value: 'none', label: 'none' },
];

const CLOSE_ICON_SVG = `
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
              </svg>`;

const TEST_SERVER_ICON_SVG = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>
                </svg>`;

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

function resolveVisibilityClass(isVisible) {
  return isVisible ? '' : ' hidden';
}

function resolveDisabledAttrs(canManage) {
  return canManage ? '' : ' disabled aria-disabled="true"';
}

function resolveDisabledControlClass(canManage) {
  return canManage ? '' : ' opacity-50 cursor-not-allowed';
}

function resolveRootAttrsMarkup(rootAttrs) {
  return rootAttrs ? ` ${rootAttrs}` : '';
}

function resolveModalTitle(modalMode) {
  return modalMode === 'update' ? 'Edit MCP Server' : 'Add MCP Server';
}

function renderAuthTypeOptions(authType) {
  return AUTH_TYPE_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option.value)}"${authType === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
  ).join('');
}

function renderTokenMethodOptions(server) {
  return OAUTH_TOKEN_METHOD_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option.value)}"${server?.oauth_token_auth_method === option.value ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
  ).join('');
}

function renderHiddenClass(show) {
  return show ? '' : ' hidden';
}

function renderServerHeader({ modalMode }) {
  return `
        <div class="px-6 pt-6 pb-4 flex justify-between items-center">
          <h3 id="server-modal-title" class="text-lg font-medium text-gray-900">${resolveModalTitle(modalMode)}</h3>
          <button id="close-modal" class="p-1 text-gray-600 hover:text-gray-700 transition-colors">
            ${CLOSE_ICON_SVG}
          </button>
        </div>`;
}

function renderServerNameField({ server, disabledAttr, disabledControlClass }) {
  return `
          <div class="space-y-1">
            <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Server Name</label>
            <input id="server-name" type="text" value="${escapeHtml(server?.name || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="e.g. Default Tool Server" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Server Name"${disabledAttr}>
          </div>`;
}

function renderServerUrlField({ server, disabledAttr, disabledControlClass }) {
  return `
          <div class="space-y-1">
            <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">URL</label>
            <div class="flex items-center gap-2">
              <input id="server-url" type="text" value="${escapeHtml(server?.url || '')}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="http://localhost:5000/mcp" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Server URL"${disabledAttr}>
              <button id="test-server" class="p-1 text-gray-600 hover:text-gray-700${disabledControlClass}" title="Test server"${disabledAttr}>
                ${TEST_SERVER_ICON_SVG}
              </button>
            </div>
            <div id="server-test-message" class="text-label-sm text-gray-600 hidden"></div>
          </div>`;
}

function renderAuthTypeField({ authType, disabledAttr, disabledControlClass }) {
  return `
          <div class="space-y-1">
            <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Auth Type</label>
            <select id="server-auth-type" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}" aria-label="Auth Type"${disabledAttr}>
              ${renderAuthTypeOptions(authType)}
            </select>
          </div>`;
}

function renderBearerAuthFields({ server, authType, disabledAttr, disabledControlClass }) {
  return `
          <div id="auth-bearer-fields" class="space-y-1${renderHiddenClass(shouldShowAuthField(authType, 'bearer'))}">
            <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Bearer Token</label>
            <div class="flex items-center gap-3">
              <div class="flex-1 relative">
                <input id="server-auth-bearer" type="password" value="${escapeHtml(server?.auth_bearer_token || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="Bearer token" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Bearer Token"${disabledAttr}>
                <button id="toggle-bearer-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-0.5 text-label-sm font-medium uppercase tracking-wide text-gray-600 hover:text-gray-700${disabledControlClass}" aria-label="Show bearer token"${disabledAttr}>
                  <span data-password-toggle-label>Show</span>
                </button>
              </div>
            </div>
          </div>`;
}

function renderBasicAuthFields({ server, authType, disabledAttr, disabledControlClass }) {
  return `
          <div id="auth-basic-fields" class="space-y-3${renderHiddenClass(shouldShowAuthField(authType, 'basic'))}">
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Username</label>
              <input id="server-auth-basic-username" type="text" value="${escapeHtml(server?.auth_basic_username || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="Username" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Username"${disabledAttr}>
            </div>
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Password</label>
              <div class="flex items-center gap-3">
                <div class="flex-1 relative">
                  <input id="server-auth-basic-password" type="password" value="${escapeHtml(server?.auth_basic_password || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="Password" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Password"${disabledAttr}>
                  <button id="toggle-basic-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-0.5 text-label-sm font-medium uppercase tracking-wide text-gray-600 hover:text-gray-700${disabledControlClass}" aria-label="Show password"${disabledAttr}>
                    <span data-password-toggle-label>Show</span>
                  </button>
                </div>
              </div>
            </div>
          </div>`;
}

function renderOAuthClientNameField({ server, disabledAttr, disabledControlClass }) {
  return `
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Client Name</label>
              <input id="server-auth-oauth-client-name" type="text" value="${escapeHtml(server?.oauth_client_name || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="GrowChat MCP Client" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Client Name"${disabledAttr}>
            </div>`;
}

function renderOAuthScopeField({ server, disabledAttr, disabledControlClass }) {
  return `
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Scope</label>
              <input id="server-auth-oauth-scope" type="text" value="${escapeHtml(server?.oauth_scope || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="optional" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Scope"${disabledAttr}>
            </div>`;
}

function renderOAuthClientIdField({ server, disabledAttr, disabledControlClass }) {
  return `
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Client ID</label>
              <input id="server-auth-oauth-client-id" type="text" value="${escapeHtml(server?.oauth_client_id || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="Leave blank to auto-register" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Client ID"${disabledAttr}>
            </div>`;
}

function renderOAuthClientSecretField({ server, disabledAttr, disabledControlClass }) {
  return `
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Client Secret</label>
              <input id="server-auth-oauth-client-secret" type="password" value="${escapeHtml(server?.oauth_client_secret || '')}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="Optional" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Client Secret"${disabledAttr}>
            </div>`;
}

function renderOAuthTokenMethodField({ server, disabledAttr, disabledControlClass }) {
  return `
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Token Auth Method</label>
              <select id="server-auth-oauth-token-method" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}" aria-label="Token Auth Method"${disabledAttr}>
                ${renderTokenMethodOptions(server)}
              </select>
            </div>`;
}

function resolveOAuthStatusText(server) {
  return server?.oauth_connected ? 'Connected' : 'Not connected';
}

function renderOAuthConnectRow({ server, disabledControlClass, canManage }) {
  return `
            <div class="flex items-center gap-3">
              ${renderButton({ label: 'Connect OAuth', variant: 'primary', id: 'connect-oauth', className: `px-4 py-1.5 text-xs font-medium${disabledControlClass}`, disabled: !canManage })}
              <div id="oauth-status" class="text-label-sm text-gray-600">${resolveOAuthStatusText(server)}</div>
            </div>
            <div class="text-label-sm text-gray-600">OAuth requires saving the server first.</div>`;
}

function renderOAuthAuthFields({
  server,
  authType,
  disabledAttr,
  disabledControlClass,
  canManage,
}) {
  return `
          <div id="auth-oauth-fields" class="space-y-3${renderHiddenClass(shouldShowAuthField(authType, 'oauth'))}">
            ${renderOAuthClientNameField({ server, disabledAttr, disabledControlClass })}
            ${renderOAuthScopeField({ server, disabledAttr, disabledControlClass })}
            ${renderOAuthClientIdField({ server, disabledAttr, disabledControlClass })}
            ${renderOAuthClientSecretField({ server, disabledAttr, disabledControlClass })}
            ${renderOAuthTokenMethodField({ server, disabledAttr, disabledControlClass })}
            ${renderOAuthConnectRow({ server, disabledControlClass, canManage })}
          </div>`;
}

function renderHeadersField({ headersValue, disabledAttr, disabledControlClass }) {
  return `
          <div class="space-y-1">
            <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Headers</label>
            <textarea id="server-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none${disabledControlClass}" placeholder="Enter additional headers in JSON format" aria-label="Headers"${disabledAttr}>${escapeHtml(headersValue)}</textarea>
          </div>`;
}

function renderModalFooter({ server, disabledControlClass, canManage }) {
  return `
        <div class="px-6 py-6 flex justify-end gap-3">
          ${renderButton({ label: 'Delete', variant: 'ghost', id: 'delete-server', className: `px-5 py-1.5${server ? '' : ' hidden'}${disabledControlClass}`, disabled: !canManage })}
          ${renderButton({ label: 'Save', variant: 'primary', id: 'save-modal', className: `px-5 py-1.5${disabledControlClass}`, disabled: !canManage })}
        </div>`;
}

function renderModalBody(ctx) {
  return `
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        ${renderServerHeader(ctx)}
        <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
          ${renderServerNameField(ctx)}
          ${renderServerUrlField(ctx)}
          ${renderAuthTypeField(ctx)}
          ${renderBearerAuthFields(ctx)}
          ${renderBasicAuthFields(ctx)}
          ${renderOAuthAuthFields(ctx)}
          ${renderHeadersField(ctx)}
        </div>
        ${renderModalFooter(ctx)}
      </div>`;
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
  const ctx = {
    rootId,
    server,
    authType,
    headersValue,
    isVisible,
    modalMode,
    canManage,
    rootAttrs,
    hiddenClass: resolveVisibilityClass(isVisible),
    disabledAttr: resolveDisabledAttrs(canManage),
    disabledControlClass: resolveDisabledControlClass(canManage),
    rootAttrsMarkup: resolveRootAttrsMarkup(rootAttrs),
  };

  return `
    <div id="${escapeHtml(rootId)}" class="${STANDARD_MODAL_PRESET.outerClass}${ctx.hiddenClass}" style="z-index: ${STANDARD_MODAL_PRESET.zIndex};"${ctx.rootAttrsMarkup}>
      <div class="${STANDARD_MODAL_PRESET.overlayClass}"></div>
      ${renderModalBody(ctx)}
    </div>
  `;
}
