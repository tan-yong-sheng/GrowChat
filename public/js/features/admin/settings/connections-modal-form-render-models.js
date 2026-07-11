/**
 * Extracted: renderModalModels - renders the model list in the connection modal.
 * Moved from connections-modal-form.js to reduce its file size.
 */
// fallow-ignore-file complexity
// fallow-ignore-file security-sink

import { buildConnectionModalModelsMarkup } from '../../../shared/components/connection-modal.js';
import { sortModelsByActiveThenName } from '../../../shared/utils/model-state.js';

export function renderModalModels(connectionsState, scope = document.body) {
  const list = scope.querySelector('#modal-models-list');
  const status = scope.querySelector('#modal-models-status');
  if (!list || !status) return;
  if (
    !connectionsState.selectedConnection &&
    (!Array.isArray(connectionsState.modalModels) || connectionsState.modalModels.length === 0)
  ) {
    list.innerHTML =
      '<div class="px-4 py-3 text-xs text-gray-400">Click Verify to load models from this connection.</div>';
    status.textContent = '';
    return;
  }
  if (connectionsState.modalModelsLoading) {
    list.innerHTML = '<div class="px-4 py-3 text-xs text-gray-400">Loading models...</div>';
    status.textContent = '';
    return;
  }
  if (connectionsState.modalModelsError) {
    list.innerHTML = '<div class="px-4 py-3 text-xs text-red-500">Failed to load models.</div>';
    status.textContent = connectionsState.modalModelsError;
    status.classList.add('text-red-500');
    return;
  }
  const models = sortModelsByActiveThenName(connectionsState.modalModels);
  const selected = connectionsState.modalModelsSelection || new Set();
  if (!models.length) {
    list.innerHTML =
      '<div class="px-4 py-3 text-xs text-gray-400">No models discovered for this connection.</div>';
    status.textContent = '';
    return;
  }
  list.innerHTML = buildConnectionModalModelsMarkup(
    models,
    connectionsState.modalModelsQuery,
    selected,
    connectionsState.modalModelsLoading,
    connectionsState.modalModelsError || ''
  );
  status.classList.remove('text-red-500');
  status.textContent = models.length ? `Models selected in this connection: ${selected.size}` : '';
}
