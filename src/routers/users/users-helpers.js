import { loadUserToolServers } from '../../admin/tool-servers-user.js';
import { createRootLogger } from '../../utils/logger.js';
const rootLogger = createRootLogger({});

export function normalizeAccountStatus(value, fallback = 'active') {
  const status = String(value || fallback)
    .trim()
    .toLowerCase();
  return status === 'pending' ? 'pending' : 'active';
}

export function normalizeRole(value) {
  return String(value || '').trim();
}

export async function resolveRequestedRole(db, requestedRole) {
  const roleName = normalizeRole(requestedRole);
  if (!roleName) return null;

  try {
    const role = await db.first('SELECT name FROM roles WHERE LOWER(name) = LOWER(?)', [roleName]);
    if (role?.name) return String(role.name).trim();
  } catch (err) {
    if (/no such table:\s*roles/i.test(String(err?.message || ''))) {
      const fallbackRole = roleName.toLowerCase();
      return ['member', 'admin'].includes(fallbackRole) ? fallbackRole : null;
    }
    throw err;
  }

  const fallbackRole = roleName.toLowerCase();
  return ['member', 'admin'].includes(fallbackRole) ? fallbackRole : null;
}

export async function syncGlobalRoleBinding(db, userId, role, accountStatus, _logger = rootLogger) {
  try {
    await db.run('DELETE FROM user_roles WHERE user_id = ?', [userId]);

    if (normalizeAccountStatus(accountStatus) !== 'active') return;
    const mappedRole = normalizeRole(role);
    if (!mappedRole) return;
    await db.run(
      `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, created_at)
       SELECT ?, ?, r.id, unixepoch()
       FROM roles r
       WHERE LOWER(r.name) = LOWER(?)`,
      [crypto.randomUUID(), userId, mappedRole]
    );
  } catch (err) {
    if (/no such table:\s*(user_roles|roles)/i.test(String(err?.message || ''))) {
      rootLogger.warn('RBAC role binding skipped: run migrations/001_initial.sql');
      return;
    }
    throw err;
  }
}

export async function loadModelEnabledMap(db, _logger = rootLogger) {
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS model_access (
        model_id TEXT PRIMARY KEY,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    );
    const rows = await db.all('SELECT model_id, is_enabled FROM model_access');
    return new Map(
      (Array.isArray(rows) ? rows : []).map((row) => [
        String(row.model_id || ''),
        row.is_enabled === 1,
      ])
    );
  } catch (err) {
    rootLogger.warn('Failed to read model access map', { error: err?.message || err });
    return new Map();
  }
}

export function parseJsonObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveUserToolServerJson(db, userId, serverId, server) {
  await db.run(
    `UPDATE user_tool_servers
     SET server_json = ?, updated_at = unixepoch()
     WHERE user_id = ? AND id = ?`,
    [JSON.stringify(server), userId, serverId]
  );
}

export async function findUserToolServerByOauthState(db, state) {
  if (!db || !state) return null;
  await loadUserToolServers(db, '__oauth__');
  const rows = await db.all('SELECT id, user_id, server_json FROM user_tool_servers');
  for (const row of Array.isArray(rows) ? rows : []) {
    const server = parseJsonObject(row.server_json);
    if (server?.oauth_state !== state) continue;
    return {
      ...server,
      id: row.id,
      user_id: row.user_id,
    };
  }
  return null;
}

export function parseSettings(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
