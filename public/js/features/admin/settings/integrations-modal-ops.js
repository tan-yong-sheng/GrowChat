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
import { renderLoadingSkeleton, updateToggleButton } from './acl-modal-shared.js';
import { updateToolToggle } from '../../../shared/components/tool-toggle.js';
import { updateAuthFields as sharedUpdateAuthFields } from '../../../shared/components/integrations-shared.js';

export function createIntegrationsModalOps(deps) {
  const { container, integrationsState } = deps;

  const updateServerToggle = (btn, enabled) => updateToggleButton(btn, enabled);

  const sanitizeServers = () => sanitizeIntegrationsServers(integrationsState.toolServers);

  const showFeedback = (message, type = 'success') => {
    const feedback = container.querySelector('#integrations-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    const isError = type === 'error';
    feedback.className = isError
      ? 'rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
      : 'rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
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
    sharedUpdateAuthFields(container, authType);
  };

  const queryIntegrationModalRefs = () => ({
    nameInput: container.querySelector('#server-name'),
    urlInput: container.querySelector('#server-url'),
    headersInput: container.querySelector('#server-headers'),
    authTypeSelect: container.querySelector('#server-auth-type'),
    bearerInput: container.querySelector('#server-auth-bearer'),
    basicUserInput: container.querySelector('#server-auth-basic-username'),
    basicPassInput: container.querySelector('#server-auth-basic-password'),
    oauthClientNameInput: container.querySelector('#server-auth-oauth-client-name'),
    oauthScopeInput: container.querySelector('#server-auth-oauth-scope'),
    oauthClientIdInput: container.querySelector('#server-auth-oauth-client-id'),
    oauthClientSecretInput: container.querySelector('#server-auth-oauth-client-secret'),
    oauthTokenMethodSelect: container.querySelector('#server-auth-oauth-token-method'),
    oauthStatus: container.querySelector('#oauth-status'),
    title: container.querySelector('#server-modal-title'),
    deleteBtn: container.querySelector('#delete-server'),
  });

  const setElementValue = (el, value) => {
    if (el) el.value = value;
  };

  const setElementText = (el, text) => {
    if (el) el.textContent = text;
  };

  const toggleElementClass = (el, className, force) => {
    if (el) el.classList.toggle(className, force);
  };

  const fillBasicServerFields = (refs, server) => {
    setElementValue(refs.nameInput, server?.name || '');
    setElementValue(refs.urlInput, server?.url || '');
    setElementValue(refs.headersInput, server?.headers || '');
    setElementValue(refs.authTypeSelect, server?.auth_type || 'none');
  };

  const fillBearerAuthField = (refs, server) => {
    setElementValue(refs.bearerInput, server?.auth_bearer_token || '');
  };

  const fillBasicAuthFields = (refs, server) => {
    setElementValue(refs.basicUserInput, server?.auth_basic_username || '');
    setElementValue(refs.basicPassInput, server?.auth_basic_password || '');
  };

  const fillOAuthClientNameField = (refs, server) => {
    setElementValue(refs.oauthClientNameInput, server?.oauth_client_name || '');
  };

  const fillOAuthScopeField = (refs, server) => {
    setElementValue(refs.oauthScopeInput, server?.oauth_scope || '');
  };

  const fillOAuthClientIdField = (refs, server) => {
    setElementValue(refs.oauthClientIdInput, server?.oauth_client_id || '');
  };

  const fillOAuthClientSecretField = (refs, server) => {
    setElementValue(refs.oauthClientSecretInput, server?.oauth_client_secret || '');
  };

  const fillOAuthTokenMethodField = (refs, server) => {
    setElementValue(refs.oauthTokenMethodSelect, server?.oauth_token_auth_method || '');
  };

  const fillOAuthStatus = (refs, server) => {
    setElementText(refs.oauthStatus, server?.oauth_connected ? 'Connected' : 'Not connected');
  };

  const INTEGRATION_MODAL_TITLES = {
    update: 'Edit MCP Server',
    default: 'Add MCP Server',
  };

  const resolveIntegrationModalTitle = (modalMode) =>
    modalMode === 'update' ? INTEGRATION_MODAL_TITLES.update : INTEGRATION_MODAL_TITLES.default;

  const fillModalFields = (server) => {
    const refs = queryIntegrationModalRefs();
    fillBasicServerFields(refs, server);
    fillBearerAuthField(refs, server);
    fillBasicAuthFields(refs, server);
    fillOAuthClientNameField(refs, server);
    fillOAuthScopeField(refs, server);
    fillOAuthClientIdField(refs, server);
    fillOAuthClientSecretField(refs, server);
    fillOAuthTokenMethodField(refs, server);
    fillOAuthStatus(refs, server);
    setElementText(refs.title, resolveIntegrationModalTitle(integrationsState.modalMode));
    toggleElementClass(refs.deleteBtn, 'hidden', !server);
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
