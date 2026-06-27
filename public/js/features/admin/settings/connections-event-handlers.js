/**
 * DOM event listener binding for the connections settings view.
 *
 * Factory function that creates the bindEvents function and
 * related event handlers, bound to the shared state.
 */

import { apiFetch } from '../../../shared/api.js';
import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import { broadcastConnectionsInvalidation } from '../../../shared/utils/connection-sync.js';
import {
  normalizeConnectionManualModels,
  resolveModalUrl,
  normalizeProviderFamily,
  isCompatibleProviderType,
  connectionApiTypeDetails,
  providerDisplayLabel,
  resolveUrlLabel,
  providerUrlPlaceholder,
  resolveKeyLabel,
} from './connections-helpers.js';
import {
  buildSelectedConnectionModels,
  updateApiTypeDisplay,
  buildModalConnectionPayload,
  resolveConnectionModalSelectionMode,
} from './connections-helpers-modal-models.js';

export function createConnectionsEventHandlers(deps) {
  const {
    container,
    connectionsState,
    canManageAcls,
    loadConnections,
    openModal,
    closeModal,
    openConnectionAccessModal,
    updateConnectionToggle,
    renderModalModels,
    addManualModalModel,
    removeManualModalModel,
    showFeedback,
    setTestStatus,
    updateModalSaveButton,
    data,
  } = deps;

  const bindEvents = () => {
    container.querySelector('#add-connection')?.addEventListener('click', () => {
      openModal(null);
    });

    const list = container.querySelector('#connections-list');
    list?.addEventListener('click', (e) => {
      const toggle = e.target.closest('.connection-toggle');
      if (toggle) {
        const id = toggle.dataset.id;
        const connection = connectionsState.openai.connections.find((c) => c.id === id);
        if (connection) {
          const previousEnabled = connection.enabled !== false;
          const nextEnabled = !previousEnabled;
          connection.enabled = nextEnabled;
          const enabled = connection.enabled !== false;
          const row = toggle.closest('[data-connection-row]');
          updateConnectionToggle(toggle, enabled);
          if (row) {
            row.classList.toggle('opacity-70', !enabled);
            const badge = row.querySelector('[data-connection-disabled-badge]');
            if (badge) badge.classList.toggle('hidden', enabled);
            const aclBtn = row.querySelector('.connection-acl-btn');
            if (aclBtn) aclBtn.classList.toggle('hidden', !enabled || !canManageAcls);
          }
          (async () => {
            try {
              const manualConnections = connectionsState.openai.connections
                .filter((c) => !c.readOnly)
                .map((conn) => ({
                  ...conn,
                  manualModels: normalizeConnectionManualModels(conn.manualModels),
                }));
              const res = await apiFetch('/api/admin/openai/connections', {
                method: 'PUT',
                body: JSON.stringify({
                  enabled: connectionsState.openai.enabled,
                  connections: manualConnections,
                  model_updates: [],
                  access_updates: [],
                }),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || err.message || 'Failed to save connection');
              }
              broadcastModelsInvalidation();
              broadcastConnectionsInvalidation();
              if (data) data.modelsSettingsInvalidate = Date.now();
            } catch (err) {
              connection.enabled = previousEnabled;
              const revertedEnabled = connection.enabled !== false;
              updateConnectionToggle(toggle, revertedEnabled);
              if (row) {
                row.classList.toggle('opacity-70', !revertedEnabled);
                const badge = row.querySelector('[data-connection-disabled-badge]');
                if (badge) badge.classList.toggle('hidden', revertedEnabled);
                const aclBtn = row.querySelector('.connection-acl-btn');
                if (aclBtn) aclBtn.classList.toggle('hidden', !revertedEnabled || !canManageAcls);
              }
              showFeedback(err?.message || 'Failed to save connection', 'error');
            }
          })();
        }
      }

      const aclBtn = e.target.closest('.connection-acl-btn');
      if (aclBtn) {
        const id = aclBtn.dataset.id;
        const connection = connectionsState.openai.connections.find((c) => c.id === id);
        if (connection) openConnectionAccessModal(connection, { connectionsState });
      }

      const editBtn = e.target.closest('.edit-connection-btn');
      if (editBtn) {
        const id = editBtn.dataset.id;
        const connection = connectionsState.openai.connections.find((c) => c.id === id);
        if (connection) openModal(connection);
      }
    });

    container.querySelector('#openai-enabled')?.addEventListener('change', (e) => {
      connectionsState.openai.enabled = e.target.checked;
      (async () => {
        try {
          const manualConnections = connectionsState.openai.connections
            .filter((c) => !c.readOnly)
            .map((conn) => ({
              ...conn,
              manualModels: normalizeConnectionManualModels(conn.manualModels),
            }));
          const res = await apiFetch('/api/admin/openai/connections', {
            method: 'PUT',
            body: JSON.stringify({
              enabled: connectionsState.openai.enabled,
              connections: manualConnections,
              model_updates: [],
              access_updates: [],
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Failed to save');
          }
          broadcastConnectionsInvalidation();
        } catch (err) {
          showFeedback(err?.message || 'Failed to save', 'error');
        }
      })();
    });

    container.querySelector('#close-modal')?.addEventListener('click', () => {
      connectionsState.deletedManualModelIds = [];
      closeModal();
    });

    container.querySelector('#test-connection')?.addEventListener('click', async () => {
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      const payload = buildModalConnectionPayload(modalRoot, connectionsState.selectedConnection);
      const resolvedUrl = resolveModalUrl(payload.providerType, payload.url);
      if (!resolvedUrl) {
        setTestStatus('error', 'URL is required for compatible providers', modalRoot);
        return;
      }
      payload.url = resolvedUrl;
      setTestStatus('testing', 'Testing connection...', modalRoot);
      try {
        const res = await apiFetch('/api/admin/openai/connections/test', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            result.details?.message || result.message || result.error || 'Connection failed'
          );
        }
        setTestStatus('success', 'Connection successful', modalRoot);
      } catch (err) {
        setTestStatus('error', err.message || 'Connection failed', modalRoot);
      }
    });

    container.querySelector('#save-modal')?.addEventListener('click', async (event) => {
      event.preventDefault();
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      const name = modalRoot.querySelector('#modal-conn-name').value;
      const url = modalRoot.querySelector('#modal-conn-url').value;
      const keyValue = modalRoot.querySelector('#modal-conn-key').value;
      const headers = modalRoot.querySelector('#modal-conn-headers').value;
      const providerType = modalRoot.querySelector('#modal-conn-provider')?.value || 'openai';
      const providerFamily = normalizeProviderFamily(providerType);

      if (!name.trim()) {
        showFeedback('Name is required', 'error');
        return;
      }
      if (isCompatibleProviderType(providerType) && !url.trim()) {
        showFeedback('URL is required for compatible providers', 'error');
        return;
      }

      connectionsState.modalSaving = true;
      updateModalSaveButton(modalRoot);
      try {
        const resolvedUrl = resolveModalUrl(providerType, url);
        const newConnection = {
          id: connectionsState.selectedConnection?.id || `conn_${Date.now()}`,
          name: name.trim(),
          url: resolvedUrl,
          key: keyValue,
          headers,
          providerType,
          providerFamily,
          apiType: connectionApiTypeDetails(providerType).value,
          source: 'manual',
          enabled: connectionsState.selectedConnection?.enabled !== false,
          manualModels: (() => {
            const models = buildSelectedConnectionModels(
              connectionsState.modalModels || [],
              connectionsState.modalModelsSelection || new Set(),
              connectionsState.selectedConnection
            );
            const deleted = connectionsState.deletedManualModelIds || [];
            if (!deleted.length) return models;
            return models.filter((m) => !deleted.includes(m.modelId));
          })(),
          manualModelsMode: resolveConnectionModalSelectionMode(
            connectionsState.modalModels || [],
            connectionsState.modalModelsSelection || new Set()
          ),
        };
        const modelUpdates = (connectionsState.modalModels || []).map((m) => ({
          id: m.id || m.modelId,
          enabled: (connectionsState.modalModelsSelection || new Set()).has(m.id || m.modelId),
        }));
        const accessUpdates = [];
        const manualConnections = connectionsState.openai.connections
          .filter((c) => !c.readOnly)
          .map((conn) => ({
            ...conn,
            manualModels: normalizeConnectionManualModels(conn.manualModels),
          }));
        if (connectionsState.modalMode === 'update') {
          const idx = manualConnections.findIndex((c) => c.id === newConnection.id);
          if (idx !== -1) manualConnections[idx] = newConnection;
        } else {
          manualConnections.push(newConnection);
          connectionsState.openai.connections.push(newConnection);
        }
        const res = await apiFetch('/api/admin/openai/connections', {
          method: 'PUT',
          body: JSON.stringify({
            enabled: connectionsState.openai.enabled,
            connections: manualConnections,
            model_updates: modelUpdates,
            access_updates: accessUpdates,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to save connection');
        }
        broadcastModelsInvalidation();
        broadcastConnectionsInvalidation();
        if (data) data.modelsSettingsInvalidate = Date.now();
        // connectionsState.loaded = false; // removed: optimistic save
        connectionsState.deletedManualModelIds = [];
        closeModal();
        loadConnections();
      } catch (err) {
        showFeedback(err?.message || 'Failed to save connection', 'error');
      } finally {
        connectionsState.modalSaving = false;
        updateModalSaveButton(modalRoot);
      }
    });

    container.querySelector('#modal-models-select-all')?.addEventListener('click', () => {
      if (!connectionsState.modalModels) return;
      connectionsState.modalModelsSelection = new Set(
        connectionsState.modalModels.map((m) => m.id)
      );
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-select-none')?.addEventListener('click', () => {
      connectionsState.modalModelsSelection = new Set();
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-list')?.addEventListener('change', (e) => {
      const checkbox = e.target.closest('input[type="checkbox"]');
      if (!checkbox) return;
      const modelId = checkbox.dataset.modelId;
      if (!modelId) return;
      const next = new Set(connectionsState.modalModelsSelection || []);
      if (checkbox.checked) next.add(modelId);
      else next.delete(modelId);
      connectionsState.modalModelsSelection = next;
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-models-search')?.addEventListener('input', (e) => {
      connectionsState.modalModelsQuery = e.target.value || '';
      renderModalModels(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-manual-model-add')?.addEventListener('click', () => {
      addManualModalModel(container.querySelector('#edit-connection-modal') || container);
    });

    container.querySelector('#modal-manual-model-id')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addManualModalModel(container.querySelector('#edit-connection-modal') || container);
      }
    });

    container.querySelector('#modal-models-list')?.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-model-id]');
      if (!deleteBtn) return;
      e.preventDefault();
      e.stopPropagation();
      const modelId = deleteBtn.getAttribute('data-delete-model-id');
      if (modelId) {
        removeManualModalModel(
          modelId,
          container.querySelector('#edit-connection-modal') || container
        );
      }
    });

    container.querySelector('#modal-conn-provider')?.addEventListener('change', (e) => {
      const modalRoot = container.querySelector('#edit-connection-modal') || container;
      const hint = modalRoot.querySelector('#modal-conn-provider-hint');
      if (hint) hint.textContent = providerDisplayLabel(e.target.value);
      const urlLabel = modalRoot.querySelector('#modal-conn-url-label');
      if (urlLabel) urlLabel.textContent = resolveUrlLabel(e.target.value);
      const urlInput = modalRoot.querySelector('#modal-conn-url');
      if (urlInput) {
        const defaultUrl = providerUrlPlaceholder(e.target.value);
        urlInput.placeholder = defaultUrl;
        const nameInput = modalRoot.querySelector('#modal-conn-name');
        if (nameInput) nameInput.placeholder = `e.g. ${providerDisplayLabel(e.target.value)}`;
      }
      const keyLabel = modalRoot.querySelector('#modal-conn-key-label');
      if (keyLabel) keyLabel.textContent = resolveKeyLabel();
      updateApiTypeDisplay(modalRoot, e.target.value);
    });

    container.querySelector('#delete-connection')?.addEventListener('click', async () => {
      if (!connectionsState.selectedConnection) return;
      if (!confirm('Delete this connection? This cannot be undone.')) return;
      try {
        const manualConnections = connectionsState.openai.connections
          .filter((c) => !c.readOnly && c.id !== connectionsState.selectedConnection.id)
          .map((conn) => ({
            ...conn,
            manualModels: normalizeConnectionManualModels(conn.manualModels),
          }));
        const res = await apiFetch('/api/admin/openai/connections', {
          method: 'PUT',
          body: JSON.stringify({
            enabled: connectionsState.openai.enabled,
            connections: manualConnections,
            model_updates: [],
            access_updates: [],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to delete connection');
        }
        broadcastModelsInvalidation();
        broadcastConnectionsInvalidation();
        if (data) data.modelsSettingsInvalidate = Date.now();
        connectionsState.loaded = false;
        closeModal();
        loadConnections();
      } catch (err) {
        showFeedback(err?.message || 'Failed to delete connection', 'error');
      }
    });

    container.querySelector('#toggle-key-visibility')?.addEventListener('click', () => {
      const input = container.querySelector('#modal-conn-key');
      const button = container.querySelector('#toggle-key-visibility');
      if (!input || !button) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute('aria-label', input.type === 'password' ? 'Show key' : 'Hide key');
      const label = button.querySelector('[data-password-toggle-label]');
      if (label) label.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
  };

  return { bindEvents };
}
