import { verifyJWT } from '../shared/auth.js';
import { getJwtSecret } from '../shared/jwt-secret.js';
import { error } from '../utils/response.js';
import { loadPrimaryRole as loadPrimaryRoleFromDb } from '../utils/user-role.js';

export function getPath(req) {
  return new URL(req.url).pathname;
}

export function readBearer(req) {
  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }

  // FIX: Removed query parameter token support
  // Tokens in query parameters are exposed in:
  // - Server logs
  // - Browser history
  // - Referrer headers
  // Clients must use Authorization header instead

  return null;
}

export async function resolveAuthUser(req, env) {
  const token = readBearer(req);
  const jwtSecret = getJwtSecret(env, req);
  if (!token || !jwtSecret) return null;

  try {
    return await verifyJWT(token, jwtSecret);
  } catch {
    return null;
  }
}

export async function loadPrimaryRole(env, userId) {
  return loadPrimaryRoleFromDb(env?.DB, userId);
}

export async function loadUserAccountStatus(env, userId) {
  if (!userId) return null;
  try {
    const row = await env.DB.prepare('SELECT account_status FROM users WHERE id = ?').bind(userId).first();
    if (!row) return null;
    const normalized = String(row.account_status || 'active').trim().toLowerCase();
    return normalized === 'pending' ? 'pending' : 'active';
  } catch {
    return null;
  }
}

export async function touchLastActive(env, userId) {
  if (!userId || !env?.DB) return;
  try {
    await env.DB.prepare('UPDATE users SET last_active_at = unixepoch() WHERE id = ?').bind(userId).run();
  } catch (err) {
    if (/no such column:\s*last_active_at/i.test(String(err?.message || ''))) {
      return;
    }
    console.warn('last_active_at update skipped:', String(err?.message || err));
  }
}

function requireBinding(req, name, value) {
  if (value) return null;
  return error(req, `${name} binding missing`, 500);
}

export function validateRouteBindings(req, env, path) {
  if (req.method === 'POST' && path === '/api/files/upload') {
    return requireBinding(req, 'FILES', env.FILES);
  }
  if (path === '/api/realtime/stream') {
    return requireBinding(req, 'MESSAGE_QUEUE', env.MESSAGE_QUEUE);
  }
  return null;
}
