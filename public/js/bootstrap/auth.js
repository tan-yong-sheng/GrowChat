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

let mode = 'login';
let isSubmitting = false;

function setMode(next) {
  mode = next;
  const isRegister = mode === 'register';

  nameWrap.classList.toggle('hidden', !isRegister);
  authTitle.textContent = isRegister ? 'Create an account' : 'Sign in to GrowChat';
  if (!isSubmitting) {
    authSubmit.textContent = isRegister ? 'Sign up' : 'Sign in';
  }
  toggleText.textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
  toggleModeBtn.textContent = isRegister ? 'Sign in' : 'Sign up';

  err.classList.add('hidden');
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
  } catch {
    err.textContent = 'Network error. Please try again.';
    err.classList.remove('hidden');
  } finally {
    isSubmitting = false;
    authSubmit.textContent = originalText;
    authSubmit.classList.remove('opacity-60', 'cursor-not-allowed');
    toggleModeBtn.disabled = false;
    updateButtonState(form, authSubmit, isSubmitting);
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
  } catch {
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
  } catch {
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

// Form validation listeners
emailInput.addEventListener('input', () => {
  err.classList.add('hidden');
  updateButtonState(form, authSubmit, isSubmitting);
});
passwordInput.addEventListener('input', () => {
  err.classList.add('hidden');
  updateButtonState(form, authSubmit, isSubmitting);
});
nameInput.addEventListener('input', () => {
  err.classList.add('hidden');
  updateButtonState(form, authSubmit, isSubmitting);
});

form.addEventListener('submit', submit);
setMode('login');
updateButtonState(form, authSubmit, isSubmitting);
checkForResetToken();
