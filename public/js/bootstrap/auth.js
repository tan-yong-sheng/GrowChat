import { setAuthState } from '../shared/api.js';
import { updateSubmitButtonState as updateButtonState } from '../shared/form-validation.js';

const form = document.getElementById('auth-form');
const nameWrap = document.getElementById('name-wrap');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const err = document.getElementById('auth-error');
const MODAL_DELAY_MS = 2000;
const MIN_PASSWORD_LENGTH = 8;
const toggleModeBtn = document.getElementById('toggle-mode');
const toggleText = document.getElementById('toggle-text');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const forgotPasswordBtn = document.getElementById('forgot-password');
// configWarning and configWarningText are resolved via inline document.getElementById

const forgotPasswordModal = document.getElementById('forgot-password-modal');
const forgotPasswordForm = document.getElementById('forgot-password-form');
const forgotEmailInput = document.getElementById('forgot-email');
const forgotSubmitBtn = document.getElementById('forgot-submit');
const modalCloseBtn = document.getElementById('modal-close');
const modalError = document.getElementById('modal-error');
const modalSuccess = document.getElementById('modal-success');

const resetPasswordModal = document.getElementById('reset-password-modal');
const resetPasswordForm = document.getElementById('reset-password-form');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const resetSubmitBtn = document.getElementById('reset-submit');
const resetError = document.getElementById('reset-error');
const resetSuccess = document.getElementById('reset-success');

let mode = 'login';
let isSubmitting = false;
let bootstrapReady = false;

function setControlVisibility(element, visible) {
  if (visible) {
    element.classList.remove('hidden');
    element.removeAttribute('aria-hidden');
    element.removeAttribute('tabindex');
  } else {
    element.classList.add('hidden');
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('tabindex', '-1');
  }
}

function updateSubmitAvailability() {
  const baseDisabled = !form.checkValidity() || isSubmitting || !bootstrapReady;
  authSubmit.disabled = baseDisabled;
}

function setMode(next) {
  mode = next;
  const isRegister = mode === 'register';

  nameWrap.classList.toggle('hidden', !isRegister);
  nameInput.required = isRegister;
  authTitle.textContent = isRegister ? 'Create an account' : 'Sign in to GrowChat';
  if (!isSubmitting) {
    authSubmit.textContent = isRegister ? 'Sign up' : 'Sign in';
  }
  toggleText.textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
  toggleModeBtn.textContent = isRegister ? 'Sign in' : 'Sign up';

  err.classList.add('hidden');
  updateSubmitAvailability();
}

function buildAuthPayload(currentMode) {
  const payload = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
  };
  if (currentMode === 'register') {
    payload.name = nameInput.value.trim();
  }
  return payload;
}

function getAuthEndpoint(currentMode) {
  return currentMode === 'register' ? '/api/auth/register' : '/api/auth/login';
}

function getAuthLabel(currentMode) {
  return currentMode === 'register' ? 'Signing up…' : 'Signing in…';
}

function setAuthSubmitting(label) {
  authSubmit.textContent = label;
  authSubmit.disabled = true;
  authSubmit.classList.add('opacity-60', 'cursor-not-allowed');
  toggleModeBtn.disabled = true;
}

function resetAuthSubmit(originalText) {
  isSubmitting = false;
  authSubmit.textContent = originalText;
  authSubmit.classList.remove('opacity-60', 'cursor-not-allowed');
  toggleModeBtn.disabled = false;
  updateButtonState(form, authSubmit, isSubmitting);
  updateSubmitAvailability();
}

function showAuthError(message) {
  err.textContent = message;
  err.classList.remove('hidden');
}

function showAuthPending(message) {
  err.textContent = message;
  err.classList.remove('hidden', 'text-red-600');
  err.classList.add('text-green-600');
}

function clearAuthError() {
  err.classList.add('hidden');
  err.classList.remove('text-green-600');
  err.classList.add('text-red-600');
}

function handleAuthResult(res, data, currentMode) {
  if (!res.ok) {
    showAuthError(data.error || 'Authentication failed');
    return false;
  }
  if (currentMode === 'register' && !data.access_token) {
    showAuthPending(data.message || 'Your account is pending approval.');
    return false;
  }
  setAuthState(data);
  window.location.href = '/';
  return true;
}

async function submit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  clearAuthError();

  const payload = buildAuthPayload(mode);
  const endpoint = getAuthEndpoint(mode);
  const label = getAuthLabel(mode);
  const originalText = authSubmit.textContent;

  isSubmitting = true;
  setAuthSubmitting(label);

  try {
    // fallow-ignore-next-line security-sink
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    handleAuthResult(res, data, mode);
  } catch {
    showAuthError('Network error. Please try again.');
  } finally {
    resetAuthSubmit(originalText);
  }
}

// eslint-disable-next-line max-statements -- Multi-branch health config
function applyHealthConfig(data) {
  const initialized = data?.initialized === true;
  const publicRegistration = data?.publicRegistrationEnabled !== false;
  const authConfigured = data?.authConfigured === true;
  const emailConfigured = data?.emailConfigured === true;

  if (!authConfigured) {
    document.getElementById('config-warning-text').textContent =
      'Authentication system not fully configured — JWT_SECRET is missing';
    document.getElementById('config-warning').classList.remove('hidden');
  } else {
    document.getElementById('config-warning').classList.add('hidden');
  }

  if (!initialized) {
    setMode('register');
    setControlVisibility(forgotPasswordBtn, false);
    setControlVisibility(toggleText, false);
    setControlVisibility(toggleModeBtn, false);
  } else if (publicRegistration) {
    setMode('login');
    setControlVisibility(forgotPasswordBtn, true);
    setControlVisibility(toggleText, true);
    setControlVisibility(toggleModeBtn, true);
    if (!emailConfigured) {
      setControlVisibility(forgotPasswordBtn, false);
    }
  } else {
    setMode('login');
    setControlVisibility(forgotPasswordBtn, emailConfigured);
    setControlVisibility(toggleText, false);
    setControlVisibility(toggleModeBtn, false);
  }
}

async function bootstrapAuthMode() {
  setMode('login');
  updateButtonState(form, authSubmit, isSubmitting);
  updateSubmitAvailability();

  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    bootstrapReady = true;
    applyHealthConfig(data);
  } catch {
    bootstrapReady = true;
    setMode('login');
    setControlVisibility(forgotPasswordBtn, true);
    setControlVisibility(toggleText, true);
    setControlVisibility(toggleModeBtn, true);
  } finally {
    updateButtonState(form, authSubmit, isSubmitting);
    updateSubmitAvailability();
  }
}

function openForgotPasswordModal() {
  forgotPasswordModal.classList.remove('hidden');
  forgotEmailInput.focus();
  modalError.classList.add('hidden');
  modalSuccess.classList.add('hidden');
  forgotEmailInput.value = '';
}

function closeForgotPasswordModal() {
  forgotPasswordModal.classList.add('hidden');
  forgotEmailInput.value = '';
  modalError.classList.add('hidden');
  modalSuccess.classList.add('hidden');
}

function showForgotError(message) {
  modalError.textContent = message;
  modalError.classList.remove('hidden');
}

function clearForgotMessages() {
  modalError.classList.add('hidden');
  modalSuccess.classList.add('hidden');
}

function setForgotSubmitting() {
  isSubmitting = true;
  forgotSubmitBtn.disabled = true;
  forgotSubmitBtn.classList.add('opacity-60', 'cursor-not-allowed');
}

function resetForgotSubmit() {
  isSubmitting = false;
  forgotSubmitBtn.disabled = false;
  forgotSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
}

function handleForgotResult(res, data) {
  if (!res.ok) {
    showForgotError(data.error || 'Failed to send reset link');
    return;
  }
  modalSuccess.textContent = 'Check your email for a password reset link';
  modalSuccess.classList.remove('hidden');
  forgotEmailInput.value = '';
  setTimeout(() => closeForgotPasswordModal(), MODAL_DELAY_MS);
}

async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;

  const email = forgotEmailInput.value.trim();
  if (!email) {
    showForgotError('Please enter your email');
    return;
  }

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
    resetForgotSubmit();
  }
}

function openResetPasswordModal() {
  resetPasswordModal.classList.remove('hidden');
  newPasswordInput.focus();
  resetError.classList.add('hidden');
  resetSuccess.classList.add('hidden');
  newPasswordInput.value = '';
  confirmPasswordInput.value = '';
}

function closeResetPasswordModal() {
  resetPasswordModal.classList.add('hidden');
  newPasswordInput.value = '';
  confirmPasswordInput.value = '';
  resetError.classList.add('hidden');
  resetSuccess.classList.add('hidden');
}

function showResetError(message) {
  resetError.textContent = message;
  resetError.classList.remove('hidden');
}

function getUrlToken() {
  return new URLSearchParams(window.location.search).get('token');
}

function beginResetSubmit() {
  isSubmitting = true;
  resetSubmitBtn.disabled = true;
  resetSubmitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  resetError.classList.add('hidden');
  resetSuccess.classList.add('hidden');
}

function endResetSubmit() {
  isSubmitting = false;
  resetSubmitBtn.disabled = false;
  resetSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
}

function validateResetPassword(password, confirmPassword) {
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

function handleResetResult(res, data) {
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

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;

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
    endResetSubmit();
  }
}

function checkForResetToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    openResetPasswordModal();
  }
}

toggleModeBtn.addEventListener('click', () => {
  setMode(mode === 'login' ? 'register' : 'login');
});

forgotPasswordBtn.addEventListener('click', (e) => {
  e.preventDefault();
  openForgotPasswordModal();
});

modalCloseBtn.addEventListener('click', closeForgotPasswordModal);
forgotPasswordForm.addEventListener('submit', handleForgotPasswordSubmit);

resetPasswordForm.addEventListener('submit', handleResetPasswordSubmit);

forgotPasswordModal.addEventListener('click', (e) => {
  if (e.target === forgotPasswordModal) {
    closeForgotPasswordModal();
  }
});

resetPasswordModal.addEventListener('click', (e) => {
  if (e.target === resetPasswordModal) {
    closeResetPasswordModal();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!forgotPasswordModal.classList.contains('hidden')) {
      closeForgotPasswordModal();
    } else if (!resetPasswordModal.classList.contains('hidden')) {
      closeResetPasswordModal();
    }
  }
});

// Form validation listeners
emailInput.addEventListener('input', () => updateButtonState(form, authSubmit, isSubmitting));
passwordInput.addEventListener('input', () => updateButtonState(form, authSubmit, isSubmitting));
nameInput.addEventListener('input', () => updateButtonState(form, authSubmit, isSubmitting));

form.addEventListener('submit', submit);
bootstrapAuthMode();
checkForResetToken();
