import { setAuthState } from './api.js';

const form = document.getElementById('auth-form');
const nameWrap = document.getElementById('name-wrap');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const err = document.getElementById('auth-error');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

let mode = 'login';

function setMode(next) {
  mode = next;
  const isRegister = mode === 'register';
  nameWrap.classList.toggle('hidden', !isRegister);
  tabLogin.className = `px-4 py-2 rounded ${isRegister ? 'bg-gray-200' : 'bg-gray-900 text-white'}`;
  tabRegister.className = `px-4 py-2 rounded ${isRegister ? 'bg-gray-900 text-white' : 'bg-gray-200'}`;
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

tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));
form.addEventListener('submit', submit);
setMode('login');
