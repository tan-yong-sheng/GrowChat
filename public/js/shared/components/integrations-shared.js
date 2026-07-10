/**
 * Shared integration-related DOM utilities for updating server row state.
 * Used by both the account integrations (account-integrations-events.js)
 * and admin integrations (integrations.js) views to avoid duplicating
 * the row-level DOM update pattern.
 */
import { updateToolToggle } from './tool-toggle.js';

/**
 * Update a server row's disabled-badge and access-button visibility.
 *
 * @param {Element} row - The server row element (`[data-tool-server-row]`)
 * @param {boolean} serverEnabled - Whether the server is enabled
 * @param {boolean} canManageAcls - Whether the user can manage ACLs
 */
export function updateServerRowVisibility(row, serverEnabled, canManageAcls) {
  const badge = row.querySelector('[data-server-disabled-badge]');
  if (badge) badge.classList.toggle('hidden', serverEnabled);
  row.classList.toggle('opacity-70', !serverEnabled);

  const accessBtn = row.querySelector('.tool-access-btn');
  if (accessBtn) {
    accessBtn.classList.toggle('hidden', !serverEnabled || !canManageAcls);
  }
}

/**
 * Update all tool-toggle buttons in a server row to reflect each tool's state.
 * This is the common iter-pattern shared across integration view files.
 *
 * @param {Element} row - The server row element
 * @param {object} server - The server data object with a `tools` array
 * @param {boolean} serverEnabled - Whether the server is enabled
 */
export function updateAllToolToggles(row, server, serverEnabled) {
  row.querySelectorAll('.tool-toggle').forEach((toggle) => {
    const toolName = toggle.dataset.toolName;
    const tool = Array.isArray(server.tools)
      ? server.tools.find((entry) => entry.name === toolName)
      : null;
    const toolEnabled = tool ? tool.enabled !== false : false;
    updateToolToggle(toggle, toolEnabled, serverEnabled);
  });
}

/**
 * Update a single server-toggle button's visual state.
 *
 * @param {Element} serverToggle - The toggle button element
 * @param {boolean} enabled - Whether the server/toggle should be on
 */
export function updateServerToggleUI(serverToggle, enabled) {
  serverToggle.classList.toggle('bg-primary', enabled);
  serverToggle.classList.toggle('bg-gray-200', !enabled);
  serverToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  const knob = serverToggle.querySelector('span');
  if (knob) {
    knob.classList.toggle('translate-x-4', enabled);
    knob.classList.toggle('translate-x-0', !enabled);
  }
}
