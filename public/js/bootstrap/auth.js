import { setAuthState } from '../shared/api.js';
import { updateSubmitButtonState as updateButtonState } from '../shared/form-validation.js';

const form = document.getElementById('auth-form');
const nameWrap = document.getElementById('name-wrap');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const err = document.getElementById('auth-error');
const toggleModeBtn = document.getElementById('toggle-mode');
const toggleText = document.getElementById('toggle-text');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const forgotPasswordBtn = document.getElementById('forgot-password');
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

// Google OAuth elements
const googleOAuthWrap = document.getElementById('google-oauth-wrap');
const googleSigninBtn = document.getElementById('google-signin-btn');

let mode = 'login';
let isSubmitting = false;
let bootstrapReady = false;

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

/**
 * Handle OAuth callback tokens delivered via URL hash fragment.
 * The server redirects to /auth.html#access_token=...&refresh_token=...
 * Hash fragments are NOT sent to the server — more secure than query params.
 */
function handleOAuthCallback() {
  if (!window.location.hash) return false;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn = params.get('expires_in');

  if (!accessToken || !refreshToken) return false;

  // Clear the hash so tokens don't linger in the URL
  history.replaceState(null, '', window.location.pathname);

  // Use the same auth state mechanism as local login
  setAuthState({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: parseInt(expiresIn, 10) || 900,
  });

  window.location.href = '/';
  return true;
}

/**
 * Handle OAuth error parameters from the server redirect.
 * e.g. /auth.html?oauth_error=access_denied
 */
function handleOAuthError() {
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get('oauth_error');
  if (!oauthError) return;

  // Clean up the URL
  const cleanUrl = new URL(window.location);
  cleanUrl.searchParams.delete('oauth_error');
  history.replaceState(null, '', cleanUrl.pathname);

  const errorMessages = {
    access_denied: 'Google sign-in was cancelled or denied.',
    invalid_state:
      'Security verification failed. This may happen if you wait too long — please try again.',
    rate_limited: 'Too many sign-in attempts. Please wait and try again.',
    exchange_failed: 'Failed to connect to Google. Please try again.',
    missing_info: 'Google did not provide enough information. Please try again.',
    no_account: 'Could not create or find your account. Please contact support.',
    pending_account: 'Your account is pending approval.',
  };

  err.textContent = errorMessages[oauthError] || 'Google sign-in failed. Please try again.';
  err.classList.remove('hidden', 'text-green-600');
  err.classList.add('text-red-600');
}

async function submit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  err.classList.add('hidden');
  err.classList.remove('text-green-600');
  err.classList.add('text-red-600');

  const payload = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
  };

  if (mode === 'register') {
    payload.name = nameInput.value.trim();
  }

  const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const label = mode === 'register' ? 'Signing up…' : 'Signing in…';
  const originalText = authSubmit.textContent;

  isSubmitting = true;
  authSubmit.textContent = label;
  authSubmit.disabled = true;
  authSubmit.classList.add('opacity-60', 'cursor-not-allowed');
  toggleModeBtn.disabled = true;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      err.textContent = data.error || 'Authentication failed';
      err.classList.remove('hidden');
      return;
    }
    if (mode === 'register' && !data.access_token) {
      err.textContent = data.message || 'Your account is pending approval.';
      err.classList.remove('hidden', 'text-red-600');
      err.classList.add('text-green-600');
      return;
    }
    setAuthState(data);
    window.location.href = '/';
  } catch (error) {
    err.textContent = 'Network error. Please try again.';
    err.classList.remove('hidden');
  } finally {
    isSubmitting = false;
    authSubmit.textContent = originalText;
    authSubmit.classList.remove('opacity-60', 'cursor-not-allowed');
    toggleModeBtn.disabled = false;
    updateButtonState(form, authSubmit, isSubmitting);
    updateSubmitAvailability();
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
    if (data?.initialized === false) {
      setMode('register');
    } else {
      setMode('login');
    }
    // Show Google OAuth button if configured
    if (data?.google_oauth && googleOAuthWrap) {
      googleOAuthWrap.classList.remove('hidden');
    }
  } catch (error) {
    bootstrapReady = true;
    setMode('login');
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

async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  const email = forgotEmailInput.value.trim();
  if (!email) {
    modalError.textContent = 'Please enter your email';
    modalError.classList.remove('hidden');
    return;
  }
  isSubmitting = true;
  forgotSubmitBtn.disabled = true;
  forgotSubmitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  modalError.classList.add('hidden');
  modalSuccess.classList.add('hidden');
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      modalError.textContent = data.error || 'Failed to send reset link';
      modalError.classList.remove('hidden');
      return;
    }
    modalSuccess.textContent = 'Check your email for a password reset link';
    modalSuccess.classList.remove('hidden');
    forgotEmailInput.value = '';
    setTimeout(() => closeForgotPasswordModal(), 2000);
  } catch (error) {
    modalError.textContent = 'Network error. Please try again.';
    modalError.classList.remove('hidden');
  } finally {
    isSubmitting = false;
    forgotSubmitBtn.disabled = false;
    forgotSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
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

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  const password = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  if (!password || !confirmPassword) {
    resetError.textContent = 'Please fill in all fields';
    resetError.classList.remove('hidden');
    return;
  }
  if (password.length < 8) {
    resetError.textContent = 'Password must be at least 8 characters';
    resetError.classList.remove('hidden');
    return;
  }
  if (password !== confirmPassword) {
    resetError.textContent = 'Passwords do not match';
    resetError.classList.remove('hidden');
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    resetError.textContent = 'Invalid reset link';
    resetError.classList.remove('hidden');
    return;
  }
  isSubmitting = true;
  resetSubmitBtn.disabled = true;
  resetSubmitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  resetError.classList.add('hidden');
  resetSuccess.classList.add('hidden');
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      resetError.textContent = data.error || 'Failed to reset password';
      resetError.classList.remove('hidden');
      return;
    }
    resetSuccess.textContent = 'Password reset successful. Redirecting to login...';
    resetSuccess.classList.remove('hidden');
    setTimeout(() => {
      window.location.href = '/auth.html';
    }, 2000);
  } catch (error) {
    resetError.textContent = 'Network error. Please try again.';
    resetError.classList.remove('hidden');
  } finally {
    isSubmitting = false;
    resetSubmitBtn.disabled = false;
    resetSubmitBtn.classList.remove('opacity-60', 'cursor-not-allowed');
  }
}

function checkForResetToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    openResetPasswordModal();
  }
}

// --- Event listeners ---

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

// Google OAuth: redirect to /api/auth/google which initiates the OAuth flow
if (googleSigninBtn) {
  googleSigninBtn.addEventListener('click', () => {
    window.location.href = '/api/auth/google';
  });
}

// Form validation listeners
emailInput.addEventListener('input', () => updateButtonState(form, authSubmit, isSubmitting));
passwordInput.addEventListener('input', () => updateButtonState(form, authSubmit, isSubmitting));
nameInput.addEventListener('input', () => updateButtonState(form, authSubmit, isSubmitting));

form.addEventListener('submit', submit);

// Check for OAuth callback tokens FIRST (before bootstrap so we can auto-login)
if (handleOAuthCallback()) {
  // Token found in hash — the function already redirects to /
} else {
  // Show any OAuth errors from the query params
  handleOAuthError();
  // Normal bootstrap
  bootstrapAuthMode();
  checkForResetToken();
}
