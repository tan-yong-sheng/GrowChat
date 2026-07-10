/**
 * DOM event listener binding for the integrations settings view.
 */

import { apiFetch } from '../../../shared/api.js';
import { updateAdminToolServerAccess } from '../../../shared/admin-access.js';
import { broadcastToolServersInvalidation } from '../../../shared/utils/tool-server-sync.js';
import {
  readFormFieldValue,
  readOAuthFormFields,
} from '../../../shared/components/integrations-shared.js';

export function createIntegrationsEventHandlers(deps) {
  const {
    container,
    integrationsState,
    canManageAcls,
    loadIntegrations,
    updateServerRowState,
    updateToolRowState,
    showFeedback,
    setTestStatus,
    updateAuthFields,
    openModal,
    closeModal,
    openToolServerAccessModal,
    persistServersImmediate,
    runVerify,
    renderToolServersList,
  } = deps;

  const bindEvents = () => {
    container.querySelector('#add-tool-server')?.addEventListener('click', () => {
      openModal(null);
    });

    const list = container.querySelector('#tool-servers-list');
    list?.addEventListener('click', (e) => {
      const toolToggle = e.target.closest('.tool-toggle');
      if (toolToggle) {
        const id = toolToggle.dataset.serverId;
        const toolName = toolToggle.dataset.toolName;
        const server = findServerById(id);
        if (server && server.enabled !== false && Array.isArray(server.tools)) {
          const tool = server.tools.find((entry) => entry.name === toolName);
          if (tool) {
            const previousState = tool.enabled;
            tool.enabled = !tool.enabled;
            updateToolRowState(id, toolName);
            persistServersImmediate().catch((err) => {
              tool.enabled = previousState;
              updateToolRowState(id, toolName);
              showFeedback(err.message || 'Failed to update tool', 'error');
            });
          }
        }
        return;
      }
      const toggle = e.target.closest('.server-toggle');
      if (toggle) {
        const id = toggle.dataset.id;
        const server = findServerById(id);
        if (server) {
          const previousState = server.enabled;
          server.enabled = !server.enabled;
          updateServerRowState(id);
          persistServersImmediate().catch((err) => {
            server.enabled = previousState;
            updateServerRowState(id);
            showFeedback(err.message || 'Failed to update server', 'error');
          });
        }
        return;
      }
      const toolsToggle = e.target.closest('.tools-toggle');
      if (toolsToggle) {
        const id = toolsToggle.dataset.id;
        const server = findServerById(id);
        if (server) {
          server.toolsExpanded = !server.toolsExpanded;
          renderToolServersList();
        }
        return;
      }
      const descToggle = e.target.closest('.tool-desc-toggle');
      if (descToggle) {
        const serverId = descToggle.dataset.serverId;
        const toolName = descToggle.dataset.toolName;
        const server = findServerById(serverId);
        if (server && Array.isArray(server.tools)) {
          const tool = server.tools.find((t) => t.name === toolName);
          if (tool) {
            tool._expanded = !tool._expanded;
            renderToolServersList();
          }
        }
        return;
      }
      const editBtn = e.target.closest('.edit-server-btn');
      if (editBtn) {
        const id = editBtn.dataset.id;
        const server = findServerById(id);
        openModal(server || null);
        return;
      }
      const accessBtn = e.target.closest('.tool-access-btn');
      if (accessBtn) {
        if (!canManageAcls) return;
        const id = accessBtn.dataset.id;
        const server = findServerById(id);
        if (server) {
          void openToolServerAccessModal(server, {
            onApply: async (rules) => {
              try {
                await updateAdminToolServerAccess(id, rules);
                broadcastToolServersInvalidation();
                showFeedback('Access rules saved successfully');
              } catch (err) {
                showFeedback(err.message || 'Failed to save access rules', 'error');
              }
            },
          });
        }
        return;
      }
    });

    container.querySelector('#close-modal')?.addEventListener('click', () => {
      closeModal();
    });

    container.querySelector('#server-auth-type')?.addEventListener('change', (e) => {
      const authType = e.target.value;
      if (integrationsState.selectedServer) {
        integrationsState.selectedServer.auth_type = authType;
      }
      updateAuthFields(authType);
    });

    let testInFlight = false;
    container.querySelector('#test-server')?.addEventListener('click', async () => {
      if (testInFlight) return;
      const { url, headers, authType, bearerToken, basicUser, basicPass, serverId } =
        buildRunVerifyArgs();
      if (!url.trim()) {
        setTestStatus('error', 'URL is required');
        return;
      }
      testInFlight = true;
      setTestStatus('testing', 'Testing connection...');
      try {
        const result = await runVerify(buildRunVerifyArgs());
        setTestStatus('success', result.message);
        const server = findServerById(serverId);
        if (server) {
          server.tools = result.tools;
          server.toolsError = '';
          server.toolsExpanded = false;
        }
        renderToolServersList();
      } catch (err) {
        setTestStatus('error', err.message || 'Connection failed');
        handleServerVerifyError(serverId, err.message || 'Connection failed');
      } finally {
        testInFlight = false;
      }
    });

    container.querySelector('#save-modal')?.addEventListener('click', async () => {
      const name = container.querySelector('#server-name').value || 'Untitled Server';
      const { url, headers, authType, bearerToken, basicUser, basicPass, serverId } =
        buildRunVerifyArgs();
      const { oauthClientName, oauthScope, oauthClientId, oauthClientSecret, oauthTokenMethod } =
        readOAuthFormFields(container);

      if (integrationsState.selectedServer) {
        const index = integrationsState.toolServers.findIndex(
          (s) => s.id === integrationsState.selectedServer.id
        );
        if (index !== -1) {
          integrationsState.toolServers[index] = {
            ...integrationsState.toolServers[index],
            name,
            url,
            headers,
            auth_type: authType,
            auth_bearer_token: bearerToken,
            auth_basic_username: basicUser,
            auth_basic_password: basicPass,
            oauth_client_name: oauthClientName,
            oauth_scope: oauthScope,
            oauth_client_id: oauthClientId,
            oauth_client_secret: oauthClientSecret,
            oauth_token_auth_method: oauthTokenMethod,
          };
        } else {
          integrationsState.toolServers.push({
            id: serverId,
            name,
            url,
            headers,
            enabled: true,
            auth_type: authType,
            auth_bearer_token: bearerToken,
            auth_basic_username: basicUser,
            auth_basic_password: basicPass,
            oauth_client_name: oauthClientName,
            oauth_scope: oauthScope,
            oauth_client_id: oauthClientId,
            oauth_client_secret: oauthClientSecret,
            oauth_token_auth_method: oauthTokenMethod,
          });
        }
      } else {
        integrationsState.toolServers.push({
          id: Math.random().toString(36).substring(2, 11),
          name,
          url,
          headers,
          enabled: true,
          auth_type: authType,
          auth_bearer_token: bearerToken,
          auth_basic_username: basicUser,
          auth_basic_password: basicPass,
          oauth_client_name: oauthClientName,
          oauth_scope: oauthScope,
          oauth_client_id: oauthClientId,
          oauth_client_secret: oauthClientSecret,
          oauth_token_auth_method: oauthTokenMethod,
        });
      }

      try {
        await persistServersImmediate();
        showFeedback('Server saved successfully');
      } catch (err) {
        showFeedback(err.message || 'Failed to save server', 'error');
        return;
      }

      closeModal();
      renderToolServersList();

      if (!url.trim()) return;

      try {
        const verifyResult = await runVerify(buildRunVerifyArgs());
        const server = findServerById(serverId);
        if (server) {
          server.tools = verifyResult.tools;
          server.toolsError = '';
          server.toolsExpanded = false;
        }
        renderToolServersList();
      } catch (err) {
        handleServerVerifyError(serverId, err.message || 'Connection failed');
      }
    });

    container.querySelector('#delete-server')?.addEventListener('click', async () => {
      if (integrationsState.selectedServer) {
        const serverId = integrationsState.selectedServer.id;
        integrationsState.toolServers = integrationsState.toolServers.filter(
          (s) => s.id !== serverId
        );
        integrationsState.selectedServer = null;
        closeModal();
        renderToolServersList();
        try {
          await persistServersImmediate();
          showFeedback('Server deleted successfully');
        } catch (err) {
          showFeedback(err.message || 'Failed to delete server', 'error');
          integrationsState.loaded = false;
          loadIntegrations();
        }
      }
    });

    function togglePasswordVisibility(inputSelector, buttonSelector) {
      const input = container.querySelector(inputSelector);
      const button = container.querySelector(buttonSelector);
      if (!input || !button) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute(
        'aria-label',
        input.type === 'password' ? 'Show password' : 'Hide password'
      );
      const label = button.querySelector('[data-password-toggle-label]');
      if (label) label.textContent = input.type === 'password' ? 'Show' : 'Hide';
    }

    container.querySelector('#toggle-bearer-visibility')?.addEventListener('click', () => {
      togglePasswordVisibility('#server-auth-bearer', '#toggle-bearer-visibility');
    });

    container.querySelector('#toggle-basic-visibility')?.addEventListener('click', () => {
      togglePasswordVisibility('#server-auth-basic-password', '#toggle-basic-visibility');
    });

    container.querySelector('#connect-oauth')?.addEventListener('click', async () => {
      const serverId = integrationsState.selectedServer?.id || '';
      if (!serverId || integrationsState.modalMode !== 'update') {
        setTestStatus('error', 'Save the server before connecting OAuth');
        return;
      }
      try {
        const oauthFields = readOAuthFormFields(container);
        const res = await apiFetch('/api/admin/tool-servers/oauth/start', {
          method: 'POST',
          body: JSON.stringify({
            id: serverId,
            url: container.querySelector('#server-url')?.value || '',
            oauth_client_name: oauthFields.oauthClientName,
            oauth_scope: oauthFields.oauthScope,
            oauth_client_id: oauthFields.oauthClientId,
            oauth_client_secret: oauthFields.oauthClientSecret,
            oauth_token_auth_method: oauthFields.oauthTokenMethod,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || payload.message || 'OAuth start failed');
        }
        if (payload.authorization_url) {
          window.open(payload.authorization_url, '_blank', 'noopener,noreferrer');
          const status = container.querySelector('#oauth-status');
          if (status) status.textContent = 'Awaiting authorization...';
        }
      } catch (err) {
        setTestStatus('error', err.message || 'OAuth start failed');
      }
    });
  };

  /**
   * Build the common runVerify options object from current form state.
   */
  const buildRunVerifyArgs = () => ({
    serverId: integrationsState.selectedServer?.id || '',
    url: readFormFieldValue(container, '#server-url'),
    authType: readFormFieldValue(container, '#server-auth-type') || 'none',
    bearerToken: readFormFieldValue(container, '#server-auth-bearer'),
    basicUser: readFormFieldValue(container, '#server-auth-basic-username'),
    basicPass: readFormFieldValue(container, '#server-auth-basic-password'),
    headers: readFormFieldValue(container, '#server-headers'),
  });

  /**
   * Find a tool server by its id.
   */
  const findServerById = (id) => integrationsState.toolServers.find((s) => s.id === id);

  /**
   * Handle error state after a runVerify failure.
   */
  const handleServerVerifyError = (serverId, errorMessage) => {
    const server = findServerById(serverId);
    if (server) {
      server.toolsError = errorMessage;
      server.toolsExpanded = false;
    }
    renderToolServersList();
  };

  return { bindEvents };
}
