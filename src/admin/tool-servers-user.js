import { isValidHttpUrl, mergeToolServer } from './tool-servers-utils.js';
import { parseJsonObject } from '../utils/json.js';

async function ensureUserToolServersTable(db) {
  await db.run(
    `CREATE TABLE IF NOT EXISTS user_tool_servers (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			server_json TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
			UNIQUE(user_id, id)
		)`
  );
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_user_tool_servers_user_id ON user_tool_servers(user_id)'
  );
}

function normalizeUserToolServerRecord(raw, userId = '') {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  const merged = mergeToolServer(null, parsed);
  if (!merged.url) return null;
  return {
    ...merged,
    source: 'user',
    owner_user_id: userId || raw?.user_id || null,
    personal: true,
  };
}

export async function loadUserToolServers(db, userId) {
  if (!db || !userId) return [];
  await ensureUserToolServersTable(db);
  const rows = await db.all(
    `SELECT id, user_id, server_json, created_at, updated_at
		FROM user_tool_servers
		WHERE user_id = ?
		ORDER BY updated_at DESC, created_at DESC`,
    [userId]
  );
  return (Array.isArray(rows) ? rows : [])
    .map((row) =>
      normalizeUserToolServerRecord(
        { ...(parseJsonObject(row.server_json) || {}), id: row.id, user_id: row.user_id },
        row.user_id
      )
    )
    .filter(Boolean);
}

export async function getUserToolServer(db, userId, serverId) {
  if (!db || !userId || !serverId) return null;
  await ensureUserToolServersTable(db);
  const row = await db.first(
    `SELECT id, user_id, server_json, created_at, updated_at
		FROM user_tool_servers
		WHERE user_id = ? AND id = ?`,
    [userId, serverId]
  );
  if (!row) return null;
  return normalizeUserToolServerRecord(
    { ...(parseJsonObject(row.server_json) || {}), id: row.id, user_id: row.user_id },
    row.user_id
  );
}

export async function createUserToolServer(db, userId, server = {}) {
  if (!db || !userId) throw new Error('User id is required');
  await ensureUserToolServersTable(db);
  const merged = mergeToolServer(null, server);
  if (!merged.name || !merged.url) {
    throw new Error('name and url are required');
  }
  if (!isValidHttpUrl(merged.url)) {
    throw new Error('url must start with http:// or https://');
  }
  const id = merged.id || crypto.randomUUID();
  const record = { ...merged, id, source: 'user', owner_user_id: userId, personal: true };
  await db.run(
    `INSERT INTO user_tool_servers (id, user_id, server_json, created_at, updated_at)
		VALUES (?, ?, ?, unixepoch(), unixepoch())`,
    [id, userId, JSON.stringify(record)]
  );
  return getUserToolServer(db, userId, id);
}

export async function updateUserToolServer(db, userId, serverId, server = {}) {
  if (!db || !userId || !serverId) throw new Error('Server id is required');
  await ensureUserToolServersTable(db);
  const existing = await getUserToolServer(db, userId, serverId);
  if (!existing) return null;
  const merged = mergeToolServer(existing, server);
  if (!merged.name || !merged.url) {
    throw new Error('name and url are required');
  }
  if (!isValidHttpUrl(merged.url)) {
    throw new Error('url must start with http:// or https://');
  }
  const record = { ...merged, id: serverId, source: 'user', owner_user_id: userId, personal: true };
  await db.run(
    `UPDATE user_tool_servers SET server_json = ?, updated_at = unixepoch()
		WHERE user_id = ? AND id = ?`,
    [JSON.stringify(record), userId, serverId]
  );
  return getUserToolServer(db, userId, serverId);
}

export async function deleteUserToolServer(db, userId, serverId) {
  if (!db || !userId || !serverId) throw new Error('Server id is required');
  await ensureUserToolServersTable(db);
  const existing = await getUserToolServer(db, userId, serverId);
  if (!existing) return false;
  await db.run('DELETE FROM user_tool_servers WHERE user_id = ? AND id = ?', [userId, serverId]);
  return true;
}
