/**
 * Modal operation helpers for the connections settings view.
 *
 * Factory function that creates modal-related helpers bound to the
 * shared state and container.
 */

import { clearModalHash, setModalHash } from '../../../shared/utils/modal-hash.js';
import { updateToggleButton } from './acl-modal-shared.js';
import { getAdminModalPreset } from '../modal-shell.js';
import { createConnectionsModalForm } from './connections-modal-form.js';

export function createConnectionsModalOps(deps) {
  const { container, connectionsState } = deps;

  const STANDARD_MODAL_PRESET = getAdminModalPreset('standard');

  const setTestStatus = (status, message = '', scope = container) => {
    const messageEl = scope.querySelector('#connection-test-message');
    if (messageEl) {
      messageEl.textContent = message || '';
      messageEl.classList.toggle('hidden', !message);
      messageEl.classList.toggle('text-red-500', status === 'error');
      messageEl.classList.toggle('text-gray-900', status === 'success');
      messageEl.classList.toggle('text-gray-400', status === 'idle' || status === 'testing');
    }
  };

  const updateConnectionToggle = (btn, enabled) => updateToggleButton(btn, enabled);

  const showFeedback = (message, type = 'success') => {
    const feedback = container.querySelector('#connections-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    if (type === 'success') {
      feedback.className =
        'rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
    } else if (type === 'error') {
      feedback.className =
        'rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
    }
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  };

  const modalForm = createConnectionsModalForm({
    container,
    connectionsState,
    setTestStatus,
  });
  const {
    fillModalFields,
    renderModalModels,
    addManualModalModel,
    removeManualModalModel,
    loadModalModels,
    refreshModalModels,
    updateModalSaveButton,
  } = modalForm;

  const openModal = (connection) => {
    connectionsState.showModal = true;
    connectionsState.selectedConnection = connection || null;
    connectionsState.modalMode = connection ? 'update' : 'create';
    connectionsState.modalModelsQuery = '';
    // Reset the manual-model tombstone list so deletions from a prior
    // connection's modal don't leak into this one. The close and save
    // handlers also reset it; openModal is the missing third reset point.
    // Without this, two connections whose model ids collide (e.g. both
    // openai-typed connections share the same upstream model names) would
    // see the wrong models filtered out as "deleted" when the second
    // modal opens.
    connectionsState.deletedManualModelIds = [];
    const modal =
      container.querySelector('#edit-connection-modal') ||
      container.querySelector('#add-connection-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }
    setModalHash(connection ? 'edit-connection-modal' : 'add-connection-modal');
    fillModalFields(connection);
    loadModalModels(connection);
  };

  const closeModal = () => {
    connectionsState.showModal = false;
    connectionsState.modalMode = 'create';
    const modal = container.querySelector('#edit-connection-modal, #add-connection-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    clearModalHash('edit-connection-modal');
    clearModalHash('add-connection-modal');
  };

  return {
    setTestStatus,
    updateConnectionToggle,
    showFeedback,
    fillModalFields,
    renderModalModels,
    addManualModalModel,
    removeManualModalModel,
    loadModalModels,
    refreshModalModels,
    updateModalSaveButton,
    openModal,
    closeModal,
    STANDARD_MODAL_PRESET,
  };
}
