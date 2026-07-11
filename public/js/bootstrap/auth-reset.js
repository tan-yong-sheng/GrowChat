/**
 * Reset-password modal helpers — extracted from auth.js
 * @module auth-reset
 */
import {
  MODAL_DELAY_MS,
  MIN_PASSWORD_LENGTH,
  resetPasswordModal,
  resetPasswordForm,
  newPasswordInput,
  confirmPasswordInput,
  resetSubmitBtn,
  resetError,
  resetSuccess,
} from './auth-dom.js';

/**
 * Open the reset-password modal and set focus.
 */
export function openResetPasswordModal() {
  resetPasswordModal.classList.remove('hidden');
  newPasswordInput.focus();
  resetError.classList.add('hidden');
  resetSuccess.classList.add('hidden');
  newPasswordInput.value = '';
  confirmPasswordInput.value = '';
}

/**
 * Close the reset-password modal and clear state.
 */
export function closeResetPasswordModal() {
  resetPasswordModal.classList.add('hidden');
  newPasswordInput.value = '';
  confirmPasswordInput.value = '';
  resetError.classList.add('hidden');
  resetSuccess.classList.add('hidden');
}

/**
 * Show an error message inside the reset-password modal.
 * @param {string} message
 */
export function showResetError(message) {
  resetError.textContent = message;
  resetError.classList.remove('hidden');
}

/**
 * Clear all messages inside the reset-password modal.
 */
export function resetClearMessages() {
  resetError.classList.add('hidden');
  resetSuccess.classList.add('hidden');
}

/**
 * Get the reset token from the current URL query string.
 * @returns {string|null}
 */
export function getUrlToken() {
  return new URLSearchParams(window.location.search).get('token');
}

/**
 * Set the submitting state for the reset-password form.
 */
export function beginResetSubmit() {
  resetSubmitBtn.disabled = true;
  resetSubmitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  resetClearMessages();
}

/**
 * Reset the submitting state for the reset-password form.
 */
export function endResetSubmit() {
  resetSubmitBtn.disabled = false;
  resetSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
}

/**
 * Validate the new password and confirm password fields.
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {string|null} Error message or null if valid
 */
export function validateResetPassword(password, confirmPassword) {
  if (!password || !confirmPassword) {
    return 'Please fill in all fields';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'Password must be at least ' + MIN_PASSWORD_LENGTH + ' characters';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }
  return null;
}

/**
 * Handle the response from the reset-password API call.
 * @param {Response} res - The fetch response object
 * @param {object} data - The parsed response data
 */
export function handleResetResult(res, data) {
  if (!res.ok) {
    showResetError(data.error || 'Failed to reset password');
    return;
  }
  resetSuccess.textContent = 'Password reset successful. Redirecting to login...';
  resetSuccess.classList.remove('hidden');
  setTimeout(() => {
    window.location.href = '/auth.html';
  }, MODAL_DELAY_MS);
}

/**
 * Handle the reset-password form submit event.
 * @param {Event} e - The submit event
 * @param {object} sharedState - Shared state object with {isSubmitting}
 */
// eslint-disable-next-line max-statements -- multi-branch reset state
export async function handleResetPasswordSubmit(e, sharedState) {
  e.preventDefault();
  if (sharedState.isSubmitting) return;

  const password = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  const validationError = validateResetPassword(password, confirmPassword);
  if (validationError) {
    showResetError(validationError);
    return;
  }

  const token = getUrlToken();
  if (!token) {
    showResetError('Invalid reset link');
    return;
  }

  sharedState.isSubmitting = true;
  beginResetSubmit();

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    handleResetResult(res, data);
  } catch {
    showResetError('Network error. Please try again.');
  } finally {
    sharedState.isSubmitting = false;
    endResetSubmit();
  }
}

/**
 * Initialize reset-password event listeners.
 * @param {object} sharedState - shared {isSubmitting} state
 */
export function initResetPasswordEvents(sharedState) {
  resetPasswordForm.addEventListener('submit', (e) => handleResetPasswordSubmit(e, sharedState));
  resetPasswordModal.addEventListener('click', (e) => {
    if (e.target === resetPasswordModal) {
      closeResetPasswordModal();
    }
  });
}

/**
 * Check if there's a reset token in the URL and open the modal if so.
 */
export function checkForResetToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    openResetPasswordModal();
  }
}
