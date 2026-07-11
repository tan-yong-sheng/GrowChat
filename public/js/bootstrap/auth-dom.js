/**
 * Shared DOM element references for auth bootstrap modules.
 * @module auth-dom
 * All elements are looked up once at module load time.
 */

export const MODAL_DELAY_MS = 2000;
export const MIN_PASSWORD_LENGTH = 8;

// --- Main auth form elements ---
export const form = document.getElementById('auth-form');
export const nameWrap = document.getElementById('name-wrap');
export const nameInput = document.getElementById('name');
export const emailInput = document.getElementById('email');
export const passwordInput = document.getElementById('password');
export const err = document.getElementById('auth-error');
export const toggleModeBtn = document.getElementById('toggle-mode');
export const toggleText = document.getElementById('toggle-text');
export const authTitle = document.getElementById('auth-title');
export const authSubmit = document.getElementById('auth-submit');
export const forgotPasswordBtn = document.getElementById('forgot-password');
// configWarning and configWarningText are resolved via inline document.getElementById

// --- Forgot-password modal elements ---
export const forgotPasswordModal = document.getElementById('forgot-password-modal');
export const forgotPasswordForm = document.getElementById('forgot-password-form');
export const forgotEmailInput = document.getElementById('forgot-email');
export const forgotSubmitBtn = document.getElementById('forgot-submit');
export const modalCloseBtn = document.getElementById('modal-close');
export const modalError = document.getElementById('modal-error');
export const modalSuccess = document.getElementById('modal-success');

// --- Reset-password modal elements ---
export const resetPasswordModal = document.getElementById('reset-password-modal');
export const resetPasswordForm = document.getElementById('reset-password-form');
export const newPasswordInput = document.getElementById('new-password');
export const confirmPasswordInput = document.getElementById('confirm-password');
export const resetSubmitBtn = document.getElementById('reset-submit');
export const resetError = document.getElementById('reset-error');
export const resetSuccess = document.getElementById('reset-success');
