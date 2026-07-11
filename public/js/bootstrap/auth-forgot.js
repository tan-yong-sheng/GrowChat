/**
 * Forgot-password modal helpers — extracted from auth.js
 * @module auth-forgot
 */
import {
  MODAL_DELAY_MS,
  forgotPasswordModal,
  forgotPasswordForm,
  forgotEmailInput,
  forgotSubmitBtn,
  modalError,
  modalSuccess,
  modalCloseBtn,
} from './auth-dom.js';

/**
 * Open the forgot-password modal and set focus.
 */
export function openForgotPasswordModal() {
  forgotPasswordModal.classList.remove('hidden');
  forgotEmailInput.focus();
  modalError.classList.add('hidden');
  modalSuccess.classList.add('hidden');
  forgotEmailInput.value = '';
}

/**
 * Close the forgot-password modal and clear state.
 */
export function closeForgotPasswordModal() {
  forgotPasswordModal.classList.add('hidden');
  forgotEmailInput.value = '';
  modalError.classList.add('hidden');
  modalSuccess.classList.add('hidden');
}

/**
 * Show an error message inside the forgot-password modal.
 * @param {string} message
 */
export function showForgotError(message) {
  modalError.textContent = message;
  modalError.classList.remove('hidden');
}

/**
 * Clear all messages inside the forgot-password modal.
 */
export function clearForgotMessages() {
  modalError.classList.add('hidden');
  modalSuccess.classList.add('hidden');
}

/**
 * Set the submitting state for the forgot-password form.
 */
export function setForgotSubmitting() {
  forgotSubmitBtn.disabled = true;
  forgotSubmitBtn.classList.add('opacity-60', 'cursor-not-allowed');
}

/**
 * Reset the submitting state for the forgot-password form.
 */
export function resetForgotSubmit() {
  forgotSubmitBtn.disabled = false;
  forgotSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
}

/**
 * Handle the response from the forgot-password API call.
 * @param {Response} res - The fetch response object
 * @param {object} data - The parsed response data
 */
export function handleForgotResult(res, data) {
  if (!res.ok) {
    showForgotError(data.error || 'Failed to send reset link');
    return;
  }
  modalSuccess.textContent = 'Check your email for a password reset link';
  modalSuccess.classList.remove('hidden');
  forgotEmailInput.value = '';
  setTimeout(() => closeForgotPasswordModal(), MODAL_DELAY_MS);
}

/**
 * Handle the forgot-password form submit event.
 * @param {Event} e - The submit event
 * @param {object} sharedState - Shared state object with {isSubmitting}
 */
export async function handleForgotPasswordSubmit(e, sharedState) {
  e.preventDefault();
  if (sharedState.isSubmitting) return;

  const email = forgotEmailInput.value.trim();
  if (!email) {
    showForgotError('Please enter your email');
    return;
  }

  sharedState.isSubmitting = true;
  setForgotSubmitting();
  clearForgotMessages();

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    handleForgotResult(res, data);
  } catch {
    showForgotError('Network error. Please try again.');
  } finally {
    sharedState.isSubmitting = false;
    resetForgotSubmit();
  }
}

/**
 * Initialize forgot-password event listeners.
 * @param {object} sharedState - shared {isSubmitting} state
 */
export function initForgotPasswordEvents(sharedState) {
  forgotPasswordForm.addEventListener('submit', (e) => handleForgotPasswordSubmit(e, sharedState));
  forgotPasswordModal.addEventListener('click', (e) => {
    if (e.target === forgotPasswordModal) {
      closeForgotPasswordModal();
    }
  });
  modalCloseBtn.addEventListener('click', closeForgotPasswordModal);
}
