import {
  readStoredJson,
  readStoredString,
  removeStoredValue,
  writeStoredJson,
} from '../utils/storage.js';

const STORAGE_KEY = 'growchat_auth';
const CLIENT_SESSION_KEY = 'growchat_client_session_id';
const PER_USER_LOCAL_KEYS = new Set([
  'drafts',
  'defaultModelId',
  'toolSelectionsByChat',
  'sidebarCollapsed',
  'sidebarWidth',
  'newChatDraft',
  'remove-me',
]);

export function getAuthState() {
  return readStoredJson(localStorage, STORAGE_KEY, null);
}

export function setAuthState(state) {
  writeStoredJson(localStorage, STORAGE_KEY, state);
}

export function clearAuthState() {
  removeStoredValue(localStorage, STORAGE_KEY);
  removeStoredValue(sessionStorage, CLIENT_SESSION_KEY);
}

export function clearPerUserLocalState() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith('growchat_') || PER_USER_LOCAL_KEYS.has(key)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    removeStoredValue(localStorage, key);
  }
  removeStoredValue(sessionStorage, CLIENT_SESSION_KEY);
}

export function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  // Base64 block size
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
    // toString(36) is a standard radix
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

export async function logout() {
  const auth = getAuthState();
  const refreshTokenValue = auth?.refresh_token;

  // Always wipe local session state first so a network-broken logout
  // cannot leave a JWT behind for the next user of this device.
  clearAuthState();
  clearPerUserLocalState();

  if (!refreshTokenValue) {
    return { ok: true, serverNotified: false };
  }

  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshTokenValue }),
    });
    return { ok: res.ok, serverNotified: res.ok };
  } catch {
    return { ok: false, serverNotified: false };
  }
}
