import { createModalUi } from './account-connections-modal-ui.js';
/**
 * Modal logic for the account connections section.
 */
import { deleteUserConnection } from '../../shared/api/resources.js';
import { buildConnectionModalMarkup } from '../../shared/components/connection-modal.js';
import { broadcastConnectionsInvalidation } from '../../shared/utils/connection-sync.js';
import { broadcastModelsInvalidation } from '../../shared/utils/model-sync.js';
import { normalizeConnectionModelSelectionMode } from '../../shared/utils/connection-model-selection.js';
import { clearModalHash, setModalHash } from '../../shared/utils/modal-hash.js';
import {
  normalizeConnectionManualModels,
  normalizeModelRecord,
} from '../../shared/utils/connection-helpers.js';
import { formatHeadersValue } from './account-connections-helpers.js';
export function createConnectionModal(ctx) {
  const {
    container,
    viewState,
    canManageConnections,
    upsertPersonalConnection,
    mergeSavedConnection,
    removePersonalConnection,
  } = ctx;
  let activeModal = null;
  let activeModalHash = '';
  const closeModal = () => {
    activeModal?.remove();
    activeModal = null;
    clearModalHash(activeModalHash);
    activeModalHash = '';
  };
  const openConnectionModal = (connection = null) => {
    if (!canManageConnections) return;
    closeModal();
    const isEdit = Boolean(connection?.id);
    const title = isEdit ? 'Edit Connection' : 'Add Connection';
    const initialModels = normalizeConnectionManualModels(
      connection?.manual_models || connection?.manualModels
    )
      .map((model) =>
        normalizeModelRecord({
          id: model.modelId,
          name: model.name || model.modelId,
          manual: true,
          manualModelId: model.modelId,
        })
      )
      .filter(Boolean);
    const modalState = {
      models: initialModels,
      selection: new Set(initialModels.map((model) => model.id)),
      query: '',
      loadingModels: false,
      modelsError: '',
      manualModelsMode:
        normalizeConnectionModelSelectionMode(
          connection?.manual_models_mode || connection?.manualModelsMode
        ) || (initialModels.length > 0 ? 'some' : 'all'),
    };
    const modalMarkup = buildConnectionModalMarkup({
      rootId: 'account-connection-modal',
      title,
      canManage: canManageConnections,
      connection: connection
        ? {
            ...connection,
            url: String(connection.base_url || connection.baseUrl || connection.url || '').trim(),
            providerType:
              String(connection.provider_type || connection.providerType || 'openai')
                .trim()
                .toLowerCase() || 'openai',
            headers: formatHeadersValue(connection.headers),
            key: String(connection.key || connection.keyMasked || '').trim(),
            has_key: Boolean(
              connection.has_key || String(connection.key || connection.keyMasked || '').trim()
            ),
            enabled: connection.enabled !== false,
            manualModelsMode: modalState.manualModelsMode,
          }
        : null,
      isVisible: true,
      showAccountHooks: true,
      isEnvConnection: Boolean(connection?.readOnly),
      modalState,
    });
    const modalWrapper = document.createElement('div');
    modalWrapper.innerHTML = modalMarkup.trim();
    const modal = modalWrapper.firstElementChild;
    container.appendChild(modal);
    activeModalHash = isEdit ? 'edit-account-connection-modal' : 'add-account-connection-modal';
    setModalHash(activeModalHash);
    activeModal = modal;
    const bodyEl = modal;
    const overlay = modal.querySelector('.absolute.inset-0');
    const providerSelect = bodyEl?.querySelector('#modal-conn-provider');
    const baseUrlInput = bodyEl?.querySelector('#modal-conn-url');
    const keyInput = bodyEl?.querySelector('#modal-conn-key');
    const headersInput = bodyEl?.querySelector('#modal-conn-headers');
    const nameInput = bodyEl?.querySelector('#modal-conn-name');
    const testBtn = bodyEl?.querySelector('[data-account-connection-test], #test-connection');
    const testMessage = bodyEl?.querySelector(
      '[data-account-connection-test-message], #connection-test-message'
    );
    const modelsList = bodyEl?.querySelector('#modal-models-list');
    const modelsStatus = bodyEl?.querySelector('#modal-models-status');
    const searchInput = bodyEl?.querySelector('#modal-models-search');
    const manualInput = bodyEl?.querySelector('#modal-manual-model-id');
    const manualAddBtn = bodyEl?.querySelector('#modal-manual-model-add');
    const selectAllBtn = bodyEl?.querySelector('#modal-models-select-all');
    const selectNoneBtn = bodyEl?.querySelector('#modal-models-select-none');
    const saveBtn = modal.querySelector('[data-account-connection-save], #save-modal');
    const deleteBtn = modal.querySelector(
      '[data-account-connection-delete-modal], #delete-connection'
    );
    const closeBtn = modal.querySelector('#close-modal');
    const toggleKeyBtn = modal.querySelector('#toggle-key-visibility');

    const ui = createModalUi({
      toggleKeyBtn,
      keyInput,
      saveBtn,
      deleteBtn,
      testMessage,
      viewState,
      providerSelect,
      baseUrlInput,
      bodyEl,
      nameInput,
      modalState,
      isEdit,
      connection,
      searchInput,
      modelsList,
      modelsStatus,
      manualInput,
      manualAddBtn,
      selectNoneBtn,
      selectAllBtn,
      closeModal,
      render: ctx.render,
      upsertPersonalConnection,
      mergeSavedConnection,
      canManageConnections,
      container,
      headersInput,
      closeBtn,
      overlay,
      testBtn,
      removePersonalConnection,
    });
    const {
      updateToggleLabel,
      setError,
      setSaving,
      setTestMessage,
      syncProviderUi,
      renderModels,
      buildPayload,
      testConnection,
      saveConnection,
      finishAndRender,
    } = ui;

    renderModels();
    if (isEdit) {
      window.setTimeout(() => {
        if (!modal?.isConnected) return;
        void testConnection();
      }, 0);
    }
    return modal;
  };

  window.__accountConnectionsHandlers = {
    openAdd: () => openConnectionModal(null),
    openEdit: (connectionId) => {
      const connection = viewState.personal.find((item) => item.id === connectionId);
      if (connection) openConnectionModal(connection);
    },
    deleteConnection: async (connectionId) => {
      const connection = viewState.personal.find((item) => item.id === connectionId);
      if (!connection) return;
      if (
        !window.confirm(
          `Delete connection ${connection.name || connection.id}? This cannot be undone.`
        )
      )
        return;
      viewState.error = '';
      try {
        await deleteUserConnection(connection.id);
        removePersonalConnection(connection.id);
        broadcastConnectionsInvalidation();
        broadcastModelsInvalidation();
        ctx.render();
      } catch (err) {
        viewState.error = err?.message || 'Failed to delete connection';
      }
    },
  };

  return { closeModal, openConnectionModal };
}
