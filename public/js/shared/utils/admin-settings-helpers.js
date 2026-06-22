/**
 * Shared admin settings UI helpers
 *
 * Extracts common patterns from general.js and registration.js
 * to reduce duplication across admin settings panels.
 */

const FEEDBACK_HIDE_DELAY_MS = 3000;

/**
 * Show feedback message in a settings panel
 * @param {HTMLElement} container - Parent container with #settings-feedback
 * @param {string} message - Feedback message
 * @param {boolean} [isError=false] - Whether this is an error message
 */
export function showSettingsFeedback(container, message, isError = false) {
  const feedback = container.querySelector('#settings-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = isError
    ? 'rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
    : 'rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
  feedback.classList.remove('hidden');
  setTimeout(() => feedback.classList.add('hidden'), FEEDBACK_HIDE_DELAY_MS);
}

/**
 * Get toggle state metadata for a boolean setting
 * @param {boolean} isOn - Current toggle state
 * @returns {{ isOn: boolean, ariaPressed: string, statusText: string, toggleClass: string, knobClass: string }}
 */
export function getSettingsToggleState(isOn) {
  return {
    isOn: Boolean(isOn),
    ariaPressed: String(isOn),
    statusText: isOn ? 'On' : 'Off',
    toggleClass: isOn ? 'bg-black' : 'bg-gray-200',
    knobClass: isOn ? 'translate-x-4' : 'translate-x-0',
  };
}

/**
 * Update a toggle button's visual state
 * @param {Object} options
 * @param {HTMLElement} options.container - Parent container
 * @param {string} options.toggleId - Toggle button ID
 * @param {string} options.statusId - Status text element ID
 * @param {boolean} options.isOn - Current state
 * @param {Function} [options.updateVisibility] - Optional callback to update visibility
 */
export function updateSettingsToggle({ container, toggleId, statusId, isOn, updateVisibility }) {
  const toggle = container.querySelector(`#${toggleId}`);
  if (!toggle) return;
  const toggleState = getSettingsToggleState(isOn);
  toggle.setAttribute('aria-pressed', toggleState.ariaPressed);
  toggle.classList.toggle('bg-black', toggleState.isOn);
  toggle.classList.toggle('bg-gray-200', !toggleState.isOn);
  const knob = toggle.querySelector('span');
  if (knob) {
    knob.classList.toggle('translate-x-4', toggleState.isOn);
    knob.classList.toggle('translate-x-0', !toggleState.isOn);
  }
  const status = container.querySelector(`#${statusId}`);
  if (status) status.textContent = toggleState.statusText;
  if (updateVisibility) updateVisibility();
}

/**
 * Render a styled select box for settings
 * @param {string} id - Select element ID
 * @param {string} optionsHtml - Inner HTML for the <select>
 * @param {Object} [options]
 * @param {string} [options.ariaLabel] - ARIA label
 * @returns {string} HTML string
 */
export function renderSettingsSelectBox(id, optionsHtml, { ariaLabel } = {}) {
  return ` <div class="relative rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300"> <select id="${id}" aria-label="${ariaLabel || id}" class="w-full appearance-none bg-transparent pr-8 text-sm text-gray-900 outline-none"> ${optionsHtml} </select> <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" class="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-gray-500"> <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.942l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clip-rule="evenodd" /> </svg> </div> `;
}

function buildErrorMessage(errorPrefix, err) {
  return err?.error || err?.message || `Failed to update ${errorPrefix}`;
}

async function executeConfigUpdate(ctx) {
  const { apiFetch, endpoint, payload } = ctx;
  const res = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(buildErrorMessage(ctx.errorPrefix, err));
  }
  return res;
}

/**
 * Perform an admin config update with optimistic rollback
 * @param {Object} ctx
 * @param {Function} ctx.apiFetch - Fetch wrapper
 * @param {Object} ctx.payload - Config key-value pairs to update
 * @param {string} ctx.successMessage - Feedback on success
 * @param {string} ctx.errorPrefix - Prefix for error feedback
 * @param {Function} ctx.showFeedback - (message, isError) callback
 * @param {Function} [ctx.onOptimisticUpdate] - Called before request
 * @param {Function} [ctx.onRollback] - Called on failure
 * @param {Function} [ctx.onCommit] - Called on success
 */
export async function updateAdminConfig({
  apiFetch,
  endpoint = '/api/admin/config',
  payload,
  successMessage,
  errorPrefix,
  showFeedback,
  onOptimisticUpdate,
  onRollback,
  onCommit,
}) {
  if (onOptimisticUpdate) onOptimisticUpdate();
  try {
    await executeConfigUpdate({ apiFetch, endpoint, payload, errorPrefix });
    if (onCommit) onCommit();
    showFeedback(successMessage);
  } catch (err) {
    if (onRollback) onRollback();
    showFeedback(err?.message || `Failed to update ${errorPrefix}.`, true);
  }
}
