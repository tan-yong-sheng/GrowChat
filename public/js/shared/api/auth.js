import {
  readStoredJson,
  readStoredString,
  removeStoredValue,
  writeStoredJson,
} from '../utils/storage.js';

const STORAGE_KEY = 'growchat_auth';
const CLIENT_SESSION_KEY = 'growchat_client_session_id';

export function getAuthState() {
  return readStoredJson(localStorage, STORAGE_KEY, null);
}

export function setAuthState(state) {
  writeStoredJson(localStorage, STORAGE_KEY, state);
}

export function clearAuthState() {
  removeStoredValue(localStorage, STORAGE_KEY);
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isAccessTokenUsable(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return false;
  const exp = Number(payload.exp || 0);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}

export function getClientSessionId() {
  try {
    let id = readStoredString(sessionStorage, CLIENT_SESSION_KEY, '');
    if (id) return id;
    id = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
    sessionStorage.setItem(CLIENT_SESSION_KEY, id);
    return id;
  } catch {
    return `fallback-${crypto.randomUUID()}`;
  }
}

export async function refreshToken(refreshTokenValue, options = {}) {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshTokenValue }),
    signal: options.signal,
  });

  if (!res.ok) {
    clearAuthState();
    return null;
  }

  const data = await res.json();
  setAuthState(data);
  return data;
}
