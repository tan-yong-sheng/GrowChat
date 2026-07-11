import { broadcastConnectionsInvalidation } from '../../shared/utils/connection-sync.js';
import { broadcastModelsInvalidation } from '../../shared/utils/model-sync.js';
import {
  createUserConnection,
  updateUserConnection,
  deleteUserConnection,
} from '../../shared/api/resources.js';

/**
 * Handle save click on the connection modal.
 * Builds payload, calls API, merges saved result, refreshes, then closes.
 *
 * @param {Event} event - The click event.
 * @param {Object} deps - Callbacks and state.
 * @returns {Promise<void>}
 */
export async function handleConnectionModalSave(event, deps) {
  if (deps.viewState.saving) return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  deps.setError('');
  deps.setSaving(true);
  try {
    const { payload, result } = await deps.saveConnection();
    applySaveResult(payload, result, deps);
    broadcastConnectionsInvalidation();
    broadcastModelsInvalidation();
    deps.finishAndRender();
  } catch (err) {
    deps.setError(err?.message || 'Failed to save connection');
  } finally {
    deps.setSaving(false);
  }
}

function applySaveResult(payload, result, deps) {
  const savedConnection = extractSavedConnection(result);
  if (!savedConnection && !deps.isEdit) return;
  deps.upsertPersonalConnection(
    deps.mergeSavedConnection(payload, savedConnection, deps.isEdit ? deps.connection : null)
  );
}

function extractSavedConnection(result) {
  return result?.connection || result?.saved_connection || result?.data?.connection || null;
}

/**
 * Handle delete click on the connection modal.
 * Confirms, calls delete API, removes from list, then closes.
 *
 * @param {Event} _event - The click event (unused).
 * @param {Object} deps - Callbacks and state.
 * @returns {Promise<void>}
 */
export async function handleConnectionModalDelete(_event, deps) {
  if (deps.viewState.saving || !deps.isEdit) return;
  if (
    !window.confirm(
      `Delete connection ${deps.connection.name || deps.connection.id}? This cannot be undone.`
    )
  )
    return;
  deps.setError('');
  deps.setSaving(true);
  try {
    await deleteUserConnection(deps.connection.id);
    deps.removePersonalConnection(deps.connection.id);
    broadcastConnectionsInvalidation();
    broadcastModelsInvalidation();
    deps.finishAndRender();
  } catch (err) {
    deps.setError(err?.message || 'Failed to delete connection');
  } finally {
    deps.setSaving(false);
  }
}

/**
 * Dispatch save or create based on isEdit flag.
 *
 * @param {Object} payload - The payload to save.
 * @param {boolean} isEdit - Whether editing an existing connection.
 * @param {string} connectionId - The existing connection id when editing.
 * @returns {Promise<{payload: Object, result: Object}>}
 */
export async function persistConnectionPayload(payload, isEdit, connectionId) {
  const result = isEdit
    ? await updateUserConnection(connectionId, payload)
    : await createUserConnection(payload);
  return { payload, result };
}
