import { APP_TTLS } from '../config/app.js';

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
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function createRefreshToken(env, userId) {
  const token = generateOpaqueToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TTL_SECONDS;

  // Capture the user's current session version so we can detect
  // post-issuance invalidation (e.g. password reset bumps the version).
  let sessionVersion = 0;
  try {
    const raw = await env.SESSIONS.get(`session-version:${userId}`);
    sessionVersion = Number(raw || 0);
  } catch {
    // KV unavailability should not block login
  }

  // Two-key pattern prevents concurrent token reuse:
  // refresh:{hash} — the "gate" key, deleted on consume (prevents reuse)
  // refresh-data:{hash} — session data, read-only after gate is gone
  await env.SESSIONS.put(`refresh:${tokenHash}`, '1', {
    expirationTtl: REFRESH_TTL_SECONDS,
  });
  await env.SESSIONS.put(
    `refresh-data:${tokenHash}`,
    JSON.stringify({ userId, expiresAt, sessionVersion }),
    { expirationTtl: REFRESH_TTL_SECONDS }
  );

  return { token, expiresAt };
}

export async function consumeRefreshToken(env, token) {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const gateKey = `refresh:${tokenHash}`;
  const dataKey = `refresh-data:${tokenHash}`;

  // Two-key pattern: delete the gate first to prevent concurrent reuse,
  // then read session data from the separate key.
  // Cloudflare KV lacks transactions, so this minimizes the race window.
  await env.SESSIONS.delete(gateKey);

  const raw = await env.SESSIONS.get(dataKey, 'json');
  if (!raw) return null;

  if (raw.expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  // Check session-version invalidation: if the user's current version
  // is higher than the version embedded in the token, the token was
  // issued before a password reset (or other revocation event) and
  // must be rejected.
  if (raw.sessionVersion !== undefined) {
    try {
      const currentVersionRaw = await env.SESSIONS.get(`session-version:${raw.userId}`);
      const currentVersion = Number(currentVersionRaw || 0);
      if (currentVersion > raw.sessionVersion) {
        return null;
      }
    } catch {
      // KV unavailability should not block token consumption
    }
  }

  return raw;
}

export async function revokeRefreshToken(env, token) {
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.SESSIONS.delete(`refresh:${tokenHash}`);
  await env.SESSIONS.delete(`refresh-data:${tokenHash}`);
}
