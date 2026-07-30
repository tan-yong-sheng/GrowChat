/**
 * Main authentication bootstrap module.
 * @module auth-bootstrap
 * @description Core auth logic (login/register/health/bootstrap) with
 * forgot-password and reset-password modals extracted to separate modules.
 */
import { setAuthState } from '../shared/api.js';
import { updateSubmitButtonState as updateButtonState } from '../shared/form-validation.js';
import {
  form,
  nameWrap,
  nameInput,
  emailInput,
  passwordInput,
  err,
  toggleModeBtn,
  toggleText,
  authTitle,
  authSubmit,
  forgotPasswordBtn,
  forgotPasswordModal,
  resetPasswordModal,
} from './auth-dom.js';
import {
  openForgotPasswordModal,
  closeForgotPasswordModal,
  initForgotPasswordEvents,
} from './auth-forgot.js';
import {
  closeResetPasswordModal,
  initResetPasswordEvents,
  checkForResetToken,
} from './auth-reset.js';

let mode = 'login';
let isSubmitting = false;
let bootstrapReady = false;

/**
 * Shared mutable state object — passed to extracted modules so they can
 * read/write the `isSubmitting` flag.
 * @type {{ isSubmitting: boolean }}
 */
const sharedState = { isSubmitting };

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

function readHealthConfig(data) {
  return {
    initialized: data?.initialized === true,
    publicRegistration: data?.publicRegistrationEnabled !== false,
    authConfigured: data?.authConfigured === true,
    emailConfigured: data?.emailConfigured === true,
  };
}

function updateAuthConfigWarning(authConfigured) {
  if (!authConfigured) {
    document.getElementById('config-warning-text').textContent =
      'Authentication system not fully configured — JWT_SECRET is missing';
    document.getElementById('config-warning').classList.remove('hidden');
  } else {
    document.getElementById('config-warning').classList.add('hidden');
  }
}

function applyUninitializedMode() {
  setMode('register');
  setControlVisibility(forgotPasswordBtn, false);
  setControlVisibility(toggleText, false);
  setControlVisibility(toggleModeBtn, false);
}

function applyPublicRegistrationMode(emailConfigured) {
  setMode('login');
  setControlVisibility(forgotPasswordBtn, true);
  setControlVisibility(toggleText, true);
  setControlVisibility(toggleModeBtn, true);
  if (!emailConfigured) {
    setControlVisibility(forgotPasswordBtn, false);
  }
}

function applyRegistrationClosedMode(emailConfigured) {
  setMode('login');
  setControlVisibility(forgotPasswordBtn, emailConfigured);
  setControlVisibility(toggleText, false);
  setControlVisibility(toggleModeBtn, false);
}

function applyHealthAuthMode(initialized, publicRegistration, emailConfigured) {
  if (!initialized) return applyUninitializedMode();
  if (publicRegistration) return applyPublicRegistrationMode(emailConfigured);
  return applyRegistrationClosedMode(emailConfigured);
}

// Multi-branch health config
function applyHealthConfig(data) {
  const { initialized, publicRegistration, authConfigured, emailConfigured } =
    readHealthConfig(data);
  updateAuthConfigWarning(authConfigured);
  applyHealthAuthMode(initialized, publicRegistration, emailConfigured);
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

// Init extracted modal event listeners
initForgotPasswordEvents(sharedState);
initResetPasswordEvents(sharedState);

// Main event listeners
forgotPasswordBtn.addEventListener('click', (e) => {
  e.preventDefault();
  openForgotPasswordModal();
});

// Close on Escape via keydown
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
