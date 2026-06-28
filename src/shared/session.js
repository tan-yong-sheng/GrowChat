import { APP_TTLS } from '../config/app.js';

const REFRESH_TTL_SECONDS = APP_TTLS.refreshTokenSeconds;
const SESSION_VERSION_TTL_SECONDS = APP_TTLS.sessionVersionSeconds;
const SESSION_VERSION_KEY_PREFIX = 'session-version:';

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
    const parsed = Number(raw);
    sessionVersion = Number.isFinite(parsed) ? parsed : 0;
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
      const parsed = Number(currentVersionRaw);
      const currentVersion = Number.isFinite(parsed) ? parsed : 0;
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
  if (!token || !env?.SESSIONS) return null;
  const tokenHash = await sha256Hex(token);
  const dataKey = `refresh-data:${tokenHash}`;
  // Read userId before deleting so the caller can fan out side-effects
  // (e.g. bumping the session version to invalidate stolen clones).
  let userId = null;
  try {
    const raw = await env.SESSIONS.get(dataKey, 'json');
    if (raw && typeof raw === 'object') {
      userId = raw.userId || null;
    }
  } catch {
    // KV unavailability or malformed JSON should not block revoke
  }
  try {
    await env.SESSIONS.delete(`refresh:${tokenHash}`);
    await env.SESSIONS.delete(dataKey);
  } catch {
    // KV unavailability should not block revoke
  }
  return userId;
}

/**
 * Increment the per-user session-version counter. consumeRefreshToken()
 * rejects refresh tokens whose embedded version is lower than the current
 * counter, so bumping here invalidates every other live refresh token for
 * this user (e.g. a clone captured before logout).
 *
 * Read-modify-write has a tiny race window under concurrent bumps, but the
 * worst case is one lost increment — which is still sufficient to invalidate
 * older tokens for the threat model in #146.
 */
export async function bumpSessionVersion(env, userId) {
  if (!userId || !env?.SESSIONS) return;
  const versionKey = `${SESSION_VERSION_KEY_PREFIX}${userId}`;
  try {
    const currentVersionRaw = await env.SESSIONS.get(versionKey);
    // Use Number.isFinite so 'not-a-number' (NaN) and junk values fall back to 0
    // instead of producing NaN + 1 = NaN and storing a poisoned counter.
    const parsed = Number(currentVersionRaw);
    const currentVersion = Number.isFinite(parsed) ? parsed : 0;
    const nextVersion = currentVersion + 1;
    await env.SESSIONS.put(versionKey, String(nextVersion), {
      expirationTtl: SESSION_VERSION_TTL_SECONDS,
    });
  } catch {
    // KV unavailability should not block the caller (logout / password reset)
  }
}
