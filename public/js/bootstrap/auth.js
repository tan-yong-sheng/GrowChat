import { setAuthState } from '../shared/api.js';

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

let mode = 'login';
let isSubmitting = false;

function setMode(next) {
  mode = next;
  const isRegister = mode === 'register';
  
  // Toggle visibility of name field
  nameWrap.classList.toggle('hidden', !isRegister);
  
  // Update text content based on mode
  authTitle.textContent = isRegister ? 'Create an account' : 'Sign in to GrowChat';
  if (!isSubmitting) {
    authSubmit.textContent = isRegister ? 'Sign up' : 'Sign in';
  }
  toggleText.textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
  toggleModeBtn.textContent = isRegister ? 'Sign in' : 'Sign up';
  
  // Reset error message
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
  } catch (error) {
    err.textContent = 'Network error. Please try again.';
    err.classList.remove('hidden');
  } finally {
    isSubmitting = false;
    authSubmit.textContent = originalText;
    authSubmit.disabled = false;
    authSubmit.classList.remove('opacity-60', 'cursor-not-allowed');
    toggleModeBtn.disabled = false;
  }
}

toggleModeBtn.addEventListener('click', () => {
  setMode(mode === 'login' ? 'register' : 'login');
});

form.addEventListener('submit', submit);
setMode('login');
