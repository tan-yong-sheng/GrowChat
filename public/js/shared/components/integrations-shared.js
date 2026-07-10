/**
 * Shared integration-related DOM utilities for updating server row state.
 * Used by both the account integrations (account-integrations-events.js)
 * and admin integrations (integrations.js) views to avoid duplicating
 * the row-level DOM update pattern.
 *
 * Also consolidates cross-file form-field reading patterns from
 * account-integrations-modal.js, integrations-modal-ops.js, and
 * integrations-event-handlers.js.
 */
import { updateToolToggle } from './tool-toggle.js';

/**
 * Update auth field visibility based on the selected auth type.
 * Toggles visibility of bearer/basic/oauth field groups.
 *
 * @param {Element} container - The container element to scope queries
 * @param {string} authType - The auth type to show fields for
 */
export function updateAuthFields(container, authType) {
  const bearer = container.querySelector('#auth-bearer-fields');
  const basic = container.querySelector('#auth-basic-fields');
  const oauth = container.querySelector('#auth-oauth-fields');
  if (bearer) bearer.classList.toggle('hidden', authType !== 'bearer');
  if (basic) basic.classList.toggle('hidden', authType !== 'basic');
  if (oauth) oauth.classList.toggle('hidden', authType !== 'oauth');
}

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

/**
 * Read a form field value from a container element.
 * Replaces the repeated `container.querySelector(selector)?.value || ''` pattern
 * across integration modal files.
 *
 * @param {Element} container - The container or parent element to scope queries
 * @param {string} selector - CSS selector for the input/field element
 * @returns {string} Field value, or empty string
 */
export function readFormFieldValue(container, selector) {
  return container?.querySelector(selector)?.value || '';
}

/**
 * Read all OAuth form fields from a container and return them as a
 * typed object. Replaces the inline `readOAuthFormFields()` pattern
 * duplicated across integration modal files.
 *
 * @param {Element|Document} container - The container to scope queries
 * @returns {object} { oauthClientName, oauthScope, oauthClientId, oauthClientSecret, oauthTokenMethod }
 */
export function readOAuthFormFields(container) {
  return {
    oauthClientName: readFormFieldValue(container, '#server-auth-oauth-client-name'),
    oauthScope: readFormFieldValue(container, '#server-auth-oauth-scope'),
    oauthClientId: readFormFieldValue(container, '#server-auth-oauth-client-id'),
    oauthClientSecret: readFormFieldValue(container, '#server-auth-oauth-client-secret'),
    oauthTokenMethod: readFormFieldValue(container, '#server-auth-oauth-token-method'),
  };
}

/**
 * Parse an OAuth apiFetch response and handle common error/redirect patterns.
 * Consolidates the `res.json().catch(() => ({})); if (!res.ok) {...}; if (payload.authorization_url) {...}`
 * pattern duplicated across integration modal files.
 *
 * @param {Response} res - The fetch Response object
 * @returns {Promise<object>} Parsed JSON payload (or empty object on parse failure)
 * @throws {Error} When the response indicates a server error
 */
export async function handleOAuthApiFetchResponse(res) {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || payload.message || 'OAuth start failed');
  }
  if (payload.authorization_url) {
    window.open(payload.authorization_url, '_blank', 'noopener,noreferrer');
  }
  return payload;
}
