/**
 * Modal operation helpers for the integrations settings view.
 */

import { apiFetch } from '../../../shared/api.js';
import { broadcastToolServersInvalidation } from '../../../shared/utils/tool-server-sync.js';
import {
  mapSavedToolServers,
  sanitizeIntegrationsServers,
  shouldShowAuthField,
} from './integrations-helpers.js';
import { clearModalHash, setModalHash } from '../../../shared/utils/modal-hash.js';

export function createIntegrationsModalOps(deps) {
  const { container, integrationsState } = deps;

  const updateServerToggle = (btn, enabled) => {
    if (!btn) return;
    btn.classList.toggle('bg-black', enabled);
    btn.classList.toggle('bg-gray-200', !enabled);
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', enabled);
      knob.classList.toggle('translate-x-0', !enabled);
    }
  };

  const updateToolToggle = (btn, enabled, serverEnabled) => {
    if (!btn) return;
    btn.disabled = !serverEnabled;
    btn.classList.toggle('bg-black', enabled);
    btn.classList.toggle('bg-gray-200', !enabled);
    btn.classList.toggle('opacity-40', !serverEnabled);
    btn.classList.toggle('cursor-not-allowed', !serverEnabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.setAttribute('aria-disabled', serverEnabled ? 'false' : 'true');
    btn.title = serverEnabled
      ? enabled
        ? 'Disable tool'
        : 'Enable tool'
      : 'Enable the server to edit tools';
    const knob = btn.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', enabled);
      knob.classList.toggle('translate-x-0', !enabled);
    }
  };

  const sanitizeServers = () => sanitizeIntegrationsServers(integrationsState.toolServers);

  const renderLoadingSkeleton = () => `
    <div class="space-y-2">
      ${Array.from({ length: 4 })
        .map(
          () => `
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
      `
        )
        .join('')}
    </div>
  `;

  const showFeedback = (message, type = 'success') => {
    const feedback = container.querySelector('#integrations-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    const isError = type === 'error';
    feedback.className = isError
      ? 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
      : 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  };

  const persistServersImmediate = async () => {
    const sanitized = sanitizeServers();
    const res = await apiFetch('/api/admin/tool-servers', {
      method: 'PUT',
      body: JSON.stringify({ servers: sanitized }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Failed to save integrations');
    }
    const payload = await res.json().catch(() => ({}));
    integrationsState.toolServers = mapSavedToolServers(payload?.servers, sanitized);
    broadcastToolServersInvalidation();
  };

  const runVerify = async ({
    serverId,
    url,
    authType,
    bearerToken,
    basicUser,
    basicPass,
    headers,
  }) => {
    const res = await apiFetch('/api/admin/tool-servers/test', {
      method: 'POST',
      body: JSON.stringify({
        id: serverId,
        url,
        headers,
        auth_type: authType,
        auth_bearer_token: bearerToken,
        auth_basic_username: basicUser,
        auth_basic_password: basicPass,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        payload.details?.message || payload.message || payload.error || 'Connection failed'
      );
    }
    const tools = Array.isArray(payload.tools) ? payload.tools : [];
    return {
      tools,
      message: payload.message || 'Connection successful',
      verifiedAt: payload.tools_verified_at || null,
    };
  };

  const setTestStatus = (status, message = '') => {
    const messageEl = container.querySelector('#server-test-message');
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.classList.toggle('hidden', !message);
    messageEl.classList.toggle('text-red-500', status === 'error');
    messageEl.classList.toggle('text-gray-900', status === 'success');
    messageEl.classList.toggle('text-gray-400', status === 'idle' || status === 'testing');
  };

  const updateAuthFields = (authType) => {
    const bearer = container.querySelector('#auth-bearer-fields');
    const basic = container.querySelector('#auth-basic-fields');
    const oauth = container.querySelector('#auth-oauth-fields');
    if (bearer) bearer.classList.toggle('hidden', !shouldShowAuthField(authType, 'bearer'));
    if (basic) basic.classList.toggle('hidden', !shouldShowAuthField(authType, 'basic'));
    if (oauth) oauth.classList.toggle('hidden', !shouldShowAuthField(authType, 'oauth'));
  };

  const fillModalFields = (server) => {
    const nameInput = container.querySelector('#server-name');
    const urlInput = container.querySelector('#server-url');
    const headersInput = container.querySelector('#server-headers');
    const authTypeSelect = container.querySelector('#server-auth-type');
    const bearerInput = container.querySelector('#server-auth-bearer');
    const basicUserInput = container.querySelector('#server-auth-basic-username');
    const basicPassInput = container.querySelector('#server-auth-basic-password');
    const oauthClientNameInput = container.querySelector('#server-auth-oauth-client-name');
    const oauthScopeInput = container.querySelector('#server-auth-oauth-scope');
    const oauthClientIdInput = container.querySelector('#server-auth-oauth-client-id');
    const oauthClientSecretInput = container.querySelector('#server-auth-oauth-client-secret');
    const oauthTokenMethodSelect = container.querySelector('#server-auth-oauth-token-method');
    const oauthStatus = container.querySelector('#oauth-status');
    if (nameInput) nameInput.value = server?.name || '';
    if (urlInput) urlInput.value = server?.url || '';
    if (headersInput) headersInput.value = server?.headers || '';
    if (authTypeSelect) authTypeSelect.value = server?.auth_type || 'none';
    if (bearerInput) bearerInput.value = server?.auth_bearer_token || '';
    if (basicUserInput) basicUserInput.value = server?.auth_basic_username || '';
    if (basicPassInput) basicPassInput.value = server?.auth_basic_password || '';
    if (oauthClientNameInput) oauthClientNameInput.value = server?.oauth_client_name || '';
    if (oauthScopeInput) oauthScopeInput.value = server?.oauth_scope || '';
    if (oauthClientIdInput) oauthClientIdInput.value = server?.oauth_client_id || '';
    if (oauthClientSecretInput) oauthClientSecretInput.value = server?.oauth_client_secret || '';
    if (oauthTokenMethodSelect)
      oauthTokenMethodSelect.value = server?.oauth_token_auth_method || '';
    if (oauthStatus) {
      oauthStatus.textContent = server?.oauth_connected ? 'Connected' : 'Not connected';
    }
    const title = container.querySelector('#server-modal-title');
    if (title)
      title.textContent =
        integrationsState.modalMode === 'update' ? 'Edit MCP Server' : 'Add MCP Server';
    const deleteBtn = container.querySelector('#delete-server');
    if (deleteBtn) deleteBtn.classList.toggle('hidden', !server);
    setTestStatus('idle', '');
    updateAuthFields(server?.auth_type || 'none');
  };

  const openModal = (server) => {
    if (server) {
      integrationsState.modalMode = 'update';
      integrationsState.selectedServer = { ...server };
    } else {
      integrationsState.modalMode = 'create';
      integrationsState.selectedServer = {
        id: Math.random().toString(36).slice(2, 10),
        enabled: true,
        auth_type: 'none',
      };
    }
    integrationsState.showModal = true;
    const modal = container.querySelector('#edit-connection-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('data-trace-route', '/admin/settings/integrations');
      modal.setAttribute('data-trace-scope', 'admin');
      modal.setAttribute('data-trace-family', 'mcp-servers');
      modal.setAttribute('data-trace-owner', 'admin truth');
      modal.setAttribute(
        'data-trace-read',
        '/api/admin/tool-servers | /api/admin/tool-servers/access'
      );
      modal.setAttribute(
        'data-trace-write',
        '/api/admin/tool-servers | /api/admin/tool-servers/access'
      );
      modal.setAttribute('data-trace-invalidation', 'tool-server views only');
      modal.setAttribute(
        'data-trace-action',
        integrationsState.modalMode === 'update' ? 'edit server' : 'add server'
      );
    }
    setModalHash(
      integrationsState.modalMode === 'update' ? 'edit-connection-modal' : 'add-connection-modal'
    );
    fillModalFields(integrationsState.selectedServer);
  };

  const closeModal = () => {
    integrationsState.showModal = false;
    integrationsState.modalMode = 'create';
    clearModalHash('edit-connection-modal');
    clearModalHash('add-connection-modal');
    const modal = container.querySelector('#edit-connection-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  };

  return {
    updateServerToggle,
    updateToolToggle,
    sanitizeServers,
    renderLoadingSkeleton,
    showFeedback,
    persistServersImmediate,
    runVerify,
    setTestStatus,
    updateAuthFields,
    fillModalFields,
    openModal,
    closeModal,
  };
}
