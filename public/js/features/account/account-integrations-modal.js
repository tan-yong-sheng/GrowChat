/* eslint-disable complexity, max-lines-per-function, max-statements */
/**
 * Modal logic for the account integrations section.
 */
import {
  createUserMcpServer,
  deleteUserMcpServer,
  updateUserMcpServer,
  testUserMcpServer,
} from '../../shared/api/resources.js';
import { apiFetch } from '../../shared/api.js';
import { broadcastToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import { clearModalHash, setModalHash } from '../../shared/utils/modal-hash.js';
import { normalizeToolList, buildFormMarkup } from './account-integrations-helpers.js';
import {
  updateAuthFields as sharedUpdateAuthFields,
  readFormFieldValue,
  handleOAuthApiFetchResponse,
} from '../../shared/components/integrations-shared.js';

export function createIntegrationsModal(ctx) {
  const {
    container,
    sectionState,
    canManageToolServers,
    mergeSavedServer,
    removeServer,
    upsertServer,
  } = ctx;

  let activeModal = null;
  let activeModalHash = '';

  function closeModal() {
    activeModal?.remove();
    activeModal = null;
    clearModalHash(activeModalHash);
    activeModalHash = '';
  }

  function toggleButtonVisual(btn, saving) {
    if (!btn) return;
    btn.disabled = saving;
    btn.classList.toggle('opacity-60', saving);
    btn.classList.toggle('cursor-not-allowed', saving);
  }

  function setSaving(saving, saveBtn, deleteBtn) {
    sectionState.saving = saving;
    toggleButtonVisual(saveBtn, saving);
    if (saveBtn) {
      saveBtn.textContent = saving ? 'Saving...' : 'Save';
    }
    toggleButtonVisual(deleteBtn, saving);
  }

  function openModal(server = null) {
    if (!canManageToolServers) return;
    closeModal();
    const isEdit = Boolean(server?.id);
    const modalMarkup = buildFormMarkup(server, isEdit ? 'update' : 'create', canManageToolServers);
    const modalWrapper = document.createElement('div');
    modalWrapper.innerHTML = modalMarkup.trim();
    const modal = modalWrapper.firstElementChild;
    container.appendChild(modal);
    activeModalHash = isEdit ? 'edit-account-integration-modal' : 'add-account-integration-modal';
    setModalHash(activeModalHash);
    modal.setAttribute('data-trace-route', '/account/settings/integrations');
    modal.setAttribute('data-trace-scope', 'account');
    modal.setAttribute('data-trace-family', 'mcp-servers');
    modal.setAttribute('data-trace-owner', 'account effective truth');
    modal.setAttribute('data-trace-action', isEdit ? 'edit server' : 'add server');
    modal.setAttribute(
      'data-trace-read',
      '/api/users/me/settings | /api/users/me/resources/mcp-servers'
    );
    modal.setAttribute(
      'data-trace-write',
      '/api/users/me/resources/mcp-servers/:id | /api/users/me'
    );
    modal.setAttribute('data-trace-invalidation', 'account settings only');

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
    const basicPassInput = bodyEl?.querySelector('#server-auth-basic-password');
    const oauthStatus = bodyEl?.querySelector('#oauth-status');
    const oauthConnectBtn = bodyEl?.querySelector('#connect-oauth');
    const bearerToggleBtn = bodyEl?.querySelector('#toggle-bearer-visibility');
    const basicToggleBtn = bodyEl?.querySelector('#toggle-basic-visibility');

    const updateToggleLabel = (button, input) => {
      if (!button || !input) return;
      button.setAttribute(
        'aria-label',
        input.type === 'password' ? 'Show password' : 'Hide password'
      );
      const label = button.querySelector('[data-password-toggle-label]');
      if (label) label.textContent = input.type === 'password' ? 'Show' : 'Hide';
    };

    const setTestStatus = (status, message = '') => {
      const messageEl = bodyEl?.querySelector('#server-test-message');
      if (!messageEl) return;
      messageEl.textContent = message || '';
      messageEl.className = 'text-label-sm hidden';
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
      sharedUpdateAuthFields(bodyEl, authType);
    };

    const readFormFields = () => ({
      auth_bearer_token: readFormFieldValue(container, '#server-auth-bearer'),
      auth_basic_username: readFormFieldValue(container, '#server-auth-basic-username'),
      auth_basic_password: readFormFieldValue(container, '#server-auth-basic-password'),
      oauth_client_name: readFormFieldValue(container, '#server-auth-oauth-client-name'),
      oauth_scope: readFormFieldValue(container, '#server-auth-oauth-scope'),
      oauth_client_id: readFormFieldValue(container, '#server-auth-oauth-client-id'),
      oauth_client_secret: readFormFieldValue(container, '#server-auth-oauth-client-secret'),
      oauth_token_auth_method: readFormFieldValue(container, '#server-auth-oauth-token-method'),
    });

    const OPTIONAL_PAYLOAD_FIELDS = [
      'headers',
      'auth_bearer_token',
      'auth_basic_username',
      'auth_basic_password',
      'oauth_client_name',
      'oauth_scope',
      'oauth_client_id',
      'oauth_client_secret',
      'oauth_token_auth_method',
    ];

    function compactOptionalFields(payload) {
      for (const key of OPTIONAL_PAYLOAD_FIELDS) {
        if (!payload[key]) delete payload[key];
      }
      return payload;
    }

    const buildPayload = () => {
      const f = readFormFields();
      const payload = {
        name: String(nameInput?.value || '').trim(),
        url: String(urlInput?.value || '').trim(),
        headers: String(headersInput?.value || '').trim(),
        enabled: true,
        auth_type: String(authTypeSelect?.value || 'none')
          .trim()
          .toLowerCase(),
        auth_bearer_token: f.auth_bearer_token.trim(),
        auth_basic_username: f.auth_basic_username.trim(),
        auth_basic_password: f.auth_basic_password,
        oauth_client_name: f.oauth_client_name.trim(),
        oauth_scope: f.oauth_scope.trim(),
        oauth_client_id: f.oauth_client_id.trim(),
        oauth_client_secret: f.oauth_client_secret,
        oauth_token_auth_method: String(f.oauth_token_auth_method).trim(),
      };
      return compactOptionalFields(payload);
    };

    const saveServer = async () => {
      const payload = buildPayload();
      if (!payload.name) throw new Error('Name is required');
      if (!payload.url) throw new Error('URL is required');
      if (!/^https?:\/\//i.test(payload.url)) {
        throw new Error('URL must start with http:// or https://');
      }
      const verifiedTools = normalizeToolList((await testUserMcpServer(payload))?.tools);
      payload.tools = verifiedTools.length ? verifiedTools : normalizeToolList(server?.tools);
      if (isEdit) {
        return {
          payload,
          result: await updateUserMcpServer(server.id, payload),
        };
      }
      return {
        payload,
        result: await createUserMcpServer(payload),
      };
    };

    const testServer = async () => {
      const payload = buildPayload();
      if (!payload.url) throw new Error('URL is required');
      const result = await testUserMcpServer(payload);
      const discoveredTools = normalizeToolList(result?.tools);
      const message = Array.isArray(result?.tools)
        ? `Connection successful: ${discoveredTools.length} tools`
        : 'Connection successful';
      setTestStatus('success', message);
    };

    const finishAndRender = () => {
      closeModal();
      ctx.render();
    };

    const withSavingLock = async (fn, errorMsg) => {
      setSaving(true, saveBtn, deleteBtn);
      try {
        return await fn();
      } catch (err) {
        setTestStatus('error', err?.message || errorMsg);
      } finally {
        setSaving(false, saveBtn, deleteBtn);
      }
    };

    function resolveSavedServer(result) {
      const key = ['server', 'saved_server'].find((k) => result?.[k]);
      if (key) return result[key];
      return result?.data?.server || null;
    }

    function buildMergedServer(payload, result) {
      const savedServer = resolveSavedServer(result);
      if (!savedServer && !isEdit) return null;
      return mergeSavedServer(payload, savedServer, isEdit ? server : null);
    }

    saveBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      setTestStatus('idle', '');
      await withSavingLock(async () => {
        const { payload, result } = await saveServer();
        const mergedServer = buildMergedServer(payload, result);
        if (mergedServer) upsertServer(mergedServer);
        broadcastToolServersInvalidation();
        finishAndRender();
      }, 'Failed to save integration');
    });

    testBtn?.addEventListener('click', async () => {
      if (sectionState.saving) return;
      setTestStatus('idle', '');
      await withSavingLock(() => testServer(), 'Failed to test integration');
    });

    deleteBtn?.addEventListener('click', async () => {
      if (sectionState.saving || !isEdit) return;
      if (!window.confirm(`Delete integration ${server.name || server.id}? This cannot be undone.`))
        return;
      setTestStatus('idle', '');
      await withSavingLock(async () => {
        await deleteUserMcpServer(server.id);
        removeServer(server.id);
        broadcastToolServersInvalidation();
        finishAndRender();
      }, 'Failed to delete integration');
    });

    closeBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', closeModal);
    authTypeSelect?.addEventListener('change', (e) => {
      updateAuthFields(e.target.value);
    });
    bearerToggleBtn?.addEventListener('click', () => {
      if (!bearerInput) return;
      bearerInput.type = bearerInput.type === 'password' ? 'text' : 'password';
      updateToggleLabel(bearerToggleBtn, bearerInput);
    });
    basicToggleBtn?.addEventListener('click', () => {
      if (!basicPassInput) return;
      basicPassInput.type = basicPassInput.type === 'password' ? 'text' : 'password';
      updateToggleLabel(basicToggleBtn, basicPassInput);
    });
    updateToggleLabel(bearerToggleBtn, bearerInput);
    updateToggleLabel(basicToggleBtn, basicPassInput);
    function canStartOAuthConnection() {
      if (sectionState.saving) return false;
      return authTypeSelect?.value === 'oauth';
    }

    function requireServerIdForOAuth() {
      const serverId = server?.id || '';
      if (!serverId) {
        setTestStatus('error', 'Save the server before connecting OAuth');
      }
      return serverId;
    }

    function buildOAuthStartPayload(serverId, fields) {
      return {
        id: serverId,
        name: String(nameInput?.value || '').trim(),
        url: String(urlInput?.value || '').trim(),
        headers: String(headersInput?.value || '').trim(),
        enabled: true,
        auth_type: 'oauth',
        ...fields,
        auth_bearer_token: fields.auth_bearer_token.trim(),
        auth_basic_username: fields.auth_basic_username.trim(),
        auth_basic_password: fields.auth_basic_password,
        oauth_client_name: fields.oauth_client_name.trim(),
        oauth_scope: fields.oauth_scope.trim(),
        oauth_client_id: fields.oauth_client_id.trim(),
        oauth_client_secret: fields.oauth_client_secret.trim(),
        oauth_token_auth_method: fields.oauth_token_auth_method.trim(),
      };
    }

    function handleOAuthStartSuccess(payload) {
      if (!payload.authorization_url) return;
      if (oauthStatus) oauthStatus.textContent = 'Awaiting authorization...';
      setTestStatus('success', 'OAuth authorization started');
    }

    oauthConnectBtn?.addEventListener('click', async () => {
      if (!canStartOAuthConnection()) return;
      const serverId = requireServerIdForOAuth();
      if (!serverId) return;
      try {
        const fields = readFormFields();
        const res = await apiFetch('/api/users/me/resources/mcp-servers/oauth/start', {
          method: 'POST',
          body: JSON.stringify(buildOAuthStartPayload(serverId, fields)),
        });
        const payload = await handleOAuthApiFetchResponse(res);
        handleOAuthStartSuccess(payload);
      } catch (err) {
        setTestStatus('error', err?.message || 'OAuth start failed');
      }
    });
    updateAuthFields();
    return modal;
  }

  return { closeModal, setSaving, openModal };
}
