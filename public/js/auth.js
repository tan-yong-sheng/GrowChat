import { setAuthState } from './api.js';

const form = document.getElementById('auth-form');
const nameWrap = document.getElementById('name-wrap');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const err = document.getElementById('auth-error');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const toggleModeBtn = document.getElementById('toggle-mode');
const toggleText = document.getElementById('toggle-text');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');

let mode = 'login';

function setMode(next) {
  mode = next;
  const isRegister = mode === 'register';
  nameWrap.classList.toggle('hidden', !isRegister);
  if (tabLogin && tabRegister) {
    tabLogin.className = `px-4 py-2 rounded ${isRegister ? 'bg-gray-200' : 'bg-gray-900 text-white'}`;
    tabRegister.className = `px-4 py-2 rounded ${isRegister ? 'bg-gray-900 text-white' : 'bg-gray-200'}`;
  }
  if (authTitle) authTitle.textContent = isRegister ? 'Create an account' : 'Sign in to GrowChat';
  if (authSubmit) authSubmit.textContent = isRegister ? 'Sign up' : 'Sign in';
  if (toggleText) toggleText.textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
  if (toggleModeBtn) toggleModeBtn.textContent = isRegister ? 'Sign in' : 'Sign up';
  err.classList.add('hidden');
}

async function submit(e) {
  e.preventDefault();
  err.classList.add('hidden');

  const payload = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
  };

  if (mode === 'register') {
    payload.name = nameInput.value.trim();
  }

  const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
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

  setAuthState(data);
  window.location.href = '/';
}

if (tabLogin) tabLogin.addEventListener('click', () => setMode('login'));
if (tabRegister) tabRegister.addEventListener('click', () => setMode('register'));
if (toggleModeBtn) {
  toggleModeBtn.addEventListener('click', () => {
    setMode(mode === 'login' ? 'register' : 'login');
  });
}
if (form) form.addEventListener('submit', submit);
setMode('login');
