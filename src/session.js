import { APP_TTLS } from './config/app.js';

const REFRESH_TTL_SECONDS = APP_TTLS.refreshTokenSeconds;

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

export function generateOpaqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createRefreshToken(env, userId) {
  const token = generateOpaqueToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TTL_SECONDS;

  await env.SESSIONS.put(
    `refresh:${tokenHash}`,
    JSON.stringify({ userId, expiresAt }),
    { expirationTtl: REFRESH_TTL_SECONDS }
  );

  return {
    token,
    expiresAt,
  };
}

export async function consumeRefreshToken(env, token) {
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const key = `refresh:${tokenHash}`;
  const raw = await env.SESSIONS.get(key, 'json');
  if (!raw) return null;

  await env.SESSIONS.delete(key);

  if (raw.expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return raw;
}

export async function revokeRefreshToken(env, token) {
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.SESSIONS.delete(`refresh:${tokenHash}`);
}
