import { apiFetch } from '../../../shared/api.js';

/**
 * Shared helpers for admin settings forms (security, email-delivery).
 * Extracted from duplicated cross-file clusters.
 */

/**
 * Duration to show feedback messages before hiding them (ms).
 */
const FEEDBACK_TIMEOUT_MS = 3000;

/**
 * Escape HTML special characters to prevent XSS in rendered content.
 * @param {string} text - Raw text to escape
 * @returns {string} HTML-escaped text
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Show a timed feedback message in the #settings-feedback area.
 * Automatically hides after 3 seconds.
 * @param {HTMLElement} container - The settings panel container element
 * @param {string} message - Feedback message text
 * @param {boolean} [isError=false] - Whether to show error styling
 */
export function showFeedback(container, message, isError = false) {
  let feedback = container.querySelector('#settings-feedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'settings-feedback';
    const feedbackContainer = container.querySelector('.space-y-3');
    if (feedbackContainer) feedbackContainer.appendChild(feedback);
    else container.appendChild(feedback);
  }
  feedback.textContent = message;
  feedback.className = isError
    ? 'rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'
    : 'rounded-md border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600';
  feedback.classList.remove('hidden');
  setTimeout(() => feedback.classList.add('hidden'), FEEDBACK_TIMEOUT_MS);
}

function getEmailElements(container) {
  return {
    sendTestBtn: container.querySelector('#send-test-email'),
    testEmailInput: container.querySelector('#test-email'),
  };
}

function setSendingState(elements, sending) {
  if (elements.sendTestBtn) {
    elements.sendTestBtn.disabled = sending;
    elements.sendTestBtn.textContent = sending ? 'Sending...' : 'Send Test';
  }
  if (elements.testEmailInput) {
    elements.testEmailInput.disabled = sending;
  }
}

async function postTestEmail(email) {
  const res = await apiFetch('/api/admin/email-config/test', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || err?.message || 'Failed to send test email');
  }
}

let sendingTestEmail = false;

/**
 * Send a test email via the configured email provider.
 * Uses the /api/admin/email-config/test endpoint.
 * Reuses the same sendingTestEmail guard across both settings forms.
 * @param {HTMLElement} container - The settings panel container element
 * @param {string} email - Email address to send test to
 */
export async function sendTestEmail(container, email) {
  if (sendingTestEmail) return;
  if (!isValidEmailInput(email)) {
    showFeedback(container, 'Please enter a valid email address.', true);
    return;
  }
  const elements = getEmailElements(container);
  sendingTestEmail = true;
  setSendingState(elements, true);
  await runSendTestEmail(container, email);
  sendingTestEmail = false;
  setSendingState(elements, false);
}

async function runSendTestEmail(container, email) {
  try {
    await postTestEmail(email);
    showFeedback(container, 'Test email sent successfully.');
  } catch (err) {
    showFeedback(container, err?.message || 'Failed to send test email.', true);
  }
}

function isValidEmailInput(email) {
  return Boolean(email && email.trim());
}
