import { broadcastConnectionsInvalidation } from '../../shared/utils/connection-sync.js';
import { broadcastModelsInvalidation } from '../../shared/utils/model-sync.js';
import {
  isResourceHidden,
  setResourceVisibility,
} from '../../shared/utils/user-resource-overrides.js';
import { clonePreferences } from './account-connections-helpers.js';
import { updateUserConnection } from '../../shared/api/resources.js';

/**
 * Handle a click on a connection-toggle button.
 *
 * Two scopes are supported:
 * - shared: toggles the hidden_for_user preference for an accessible connection.
 * - personal: toggles the enabled flag for an owned personal connection via API.
 *
 * @param {HTMLElement} toggleBtn - The clicked toggle button.
 * @param {Object} deps - Callbacks and shared state.
 * @param {Object} deps.viewState - The current viewState (mutation: personal/accessible).
 * @param {Object} deps.state - The component-level state.
 * @param {boolean} deps.canManageConnections - Whether the user can manage connections.
 * @param {Function} deps.render - Re-render function.
 * @param {Function} deps.persistPreferences - Preferences persistence function.
 * @param {Function} deps.showPageError - Page-level error display.
 * @returns {Promise<void>}
 */
export async function handleConnectionToggleClick(
  toggleBtn,
  { viewState, state, canManageConnections, render, persistPreferences, showPageError }
) {
  const id = toggleBtn.dataset.id;
  const scope = toggleBtn.dataset.toggleScope || 'personal';
  if (scope === 'shared') {
    await toggleSharedConnectionVisibility(id, {
      viewState,
      state,
      render,
      persistPreferences,
    });
    return;
  }
  if (!canManageConnections) return;
  await togglePersonalConnection(id, { viewState, render, showPageError });
}

async function toggleSharedConnectionVisibility(
  id,
  { viewState, state, render, persistPreferences }
) {
  const connection = viewState.accessible.find((item) => item.id === id);
  if (!connection) return;
  const previousPreferences = clonePreferences(state.settings?.preferences || {});
  const currentHidden = isResourceHidden(state.settings?.preferences || {}, 'connections', id);
  const nextPreferences = setResourceVisibility(
    state.settings?.preferences || {},
    'connections',
    id,
    currentHidden
  );
  state.settings = {
    ...(state.settings || {}),
    preferences: nextPreferences,
  };
  viewState.error = '';
  render();
  void persistPreferences({
    rollback: { preferences: previousPreferences },
  });
}

async function togglePersonalConnection(id, { viewState, render, showPageError }) {
  const connection = viewState.personal.find((item) => item.id === id);
  if (!connection) return;
  const previousEnabled = connection.enabled !== false;
  const nextEnabled = !previousEnabled;
  connection.enabled = nextEnabled;
  render();
  try {
    await updateUserConnection(connection.id, { enabled: nextEnabled });
    broadcastConnectionsInvalidation();
    broadcastModelsInvalidation();
  } catch (err) {
    connection.enabled = previousEnabled;
    showPageError(err?.message || 'Failed to update connection');
    render();
  }
}
