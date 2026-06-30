import { normalizeProviderFamily, buildProviderId } from './provider-registry.js';
import { normalizeConnectionModelSelectionMode } from '../../public/js/shared/utils/connection-model-selection.js';
import { createRootLogger } from '../utils/logger.js';
import {
  normalizeBaseUrl,
  ensureConnectionId,
  labelFromFamily,
  normalizeAuthType,
  safeParseHeaders,
  normalizeConnectionManualModels,
  getConnectionApiType,
  getConnectionDefaultBaseUrl,
} from './connections-utils.js';

async function ensureUserConnectionsTable(db) {
  if (!db) return;
  await db.run(
    `CREATE TABLE IF NOT EXISTS user_connections (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
			base_url TEXT NOT NULL,
			key TEXT NOT NULL DEFAULT '',
			headers TEXT NOT NULL DEFAULT '{}',
			auth_type TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1,
			manual_models TEXT NOT NULL DEFAULT '[]',
			manual_models_mode TEXT NOT NULL DEFAULT 'all',
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
			UNIQUE(user_id, id)
		)`
  );
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_user_connections_user_id ON user_connections(user_id)'
  );
  await db.run(
    'CREATE INDEX IF NOT EXISTS idx_user_connections_enabled ON user_connections(enabled)'
  );
  try {
    const columns = await db.all('PRAGMA table_info(user_connections)');
    const hasModeColumn =
      Array.isArray(columns) &&
      columns.some((column) => column && String(column.name || '') === 'manual_models_mode');
    if (!hasModeColumn) {
      await db.run(
        "ALTER TABLE user_connections ADD COLUMN manual_models_mode TEXT NOT NULL DEFAULT 'all'"
      );
    }
  } catch (err) {
    if (!/duplicate column name/i.test(String(err?.message || ''))) {
      throw err;
    }
  }
}

function parseUserConnectionHeaders(raw) {
  return safeParseHeaders(raw);
}

function parseUserConnectionManualModels(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return normalizeConnectionManualModels(raw);
  try {
    const parsed = JSON.parse(String(raw));
    return normalizeConnectionManualModels(parsed);
  } catch {
    return [];
  }
}

function normalizeUserConnectionRow({ row, index = 0 } = {}) {
  if (!row) return null;
  const baseUrl = normalizeBaseUrl(row.base_url || row.baseUrl || '');
  if (!baseUrl) return null;

  const providerType =
    String(row.provider_type || row.providerType || 'openai-compatible')
      .trim()
      .toLowerCase() || 'openai-compatible';
  const providerFamily =
    normalizeProviderFamily(row.provider_family || row.providerFamily || providerType) || 'openai';
  const id = ensureConnectionId(
    {
      id: row.id,
      providerType,
      providerFamily,
      baseUrl,
      key: row.key || '',
      headers: row.headers || '{}',
    },
    index
  );

  return {
    id,
    name: String(row.name || `${labelFromFamily(providerFamily)} Personal`).slice(0, 120),
    baseUrl,
    url: baseUrl,
    key: String(row.key || '').trim(),
    headers: parseUserConnectionHeaders(row.headers),
    source: 'user',
    enabled: row.enabled !== 0 && row.enabled !== false,
    providerType,
    providerFamily,
    providerId: buildProviderId({ id, providerType, providerFamily }),
    authType: normalizeAuthType(row.auth_type || row.authType),
    apiType: getConnectionApiType(providerType),
    manualModels: parseUserConnectionManualModels(row.manual_models || row.manualModels),
    manualModelsMode:
      normalizeConnectionModelSelectionMode(row.manual_models_mode || row.manualModelsMode) ||
      'all',
    ownerUserId: row.user_id || row.userId || null,
    personal: true,
  };
}

function normalizeUserConnectionInput(opts = {}) {
  const input = opts.input ?? {};
  const existing = opts.existing ?? null;
  const name = String(input.name || existing?.name || '').trim();
  const providerType =
    String(
      input.provider_type || input.providerType || existing?.providerType || 'openai-compatible'
    )
      .trim()
      .toLowerCase() || 'openai-compatible';
  const providerFamily =
    normalizeProviderFamily(
      input.provider_family || input.providerFamily || existing?.providerFamily || providerType
    ) || 'openai';
  const baseUrlRaw = input.base_url !== undefined ? input.base_url : input.baseUrl;
  const resolvedBaseUrl = normalizeBaseUrl(
    baseUrlRaw || existing?.baseUrl || getConnectionDefaultBaseUrl(providerType)
  );
  const keyRaw = input.key;
  const headersRaw = input.headers !== undefined ? input.headers : existing?.headers;
  const authType = normalizeAuthType(input.auth_type || input.authType || existing?.authType || '');
  const enabled =
    input.enabled !== undefined ? input.enabled !== false : existing?.enabled !== false;
  const manualModels = normalizeConnectionManualModels(
    Array.isArray(input.manual_models)
      ? input.manual_models
      : Array.isArray(input.manualModels)
        ? input.manualModels
        : existing?.manualModels || []
  );
  const manualModelsMode =
    normalizeConnectionModelSelectionMode(
      input.manual_models_mode || input.manualModelsMode || existing?.manualModelsMode
    ) || 'all';

  return {
    name,
    providerType,
    providerFamily,
    baseUrl: resolvedBaseUrl,
    key: keyRaw !== undefined ? String(keyRaw || '').trim() : String(existing?.key || '').trim(),
    headers:
      headersRaw !== undefined ? safeParseHeaders(headersRaw) : safeParseHeaders(existing?.headers),
    authType,
    enabled,
    manualModels,
    manualModelsMode,
  };
}

export async function loadUserOpenAIConnectionConfigs(
  db,
  userId,
  options = {},
  logger = createRootLogger({})
) {
  const includeDisabled = options.includeDisabled === true;
  if (!db || !userId) return [];

  try {
    await ensureUserConnectionsTable(db);
    const rawRows = await db.all(
      `SELECT id, user_id, name, provider_type, base_url, key, headers, auth_type, enabled, manual_models, manual_models_mode, created_at, updated_at
			FROM user_connections
			WHERE user_id = ?
			ORDER BY updated_at DESC, created_at DESC, name ASC`,
      [userId]
    );
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const normalized = rows
      .map((row, index) => normalizeUserConnectionRow({ row, index }))
      .filter(Boolean);
    if (includeDisabled) return normalized;
    return normalized.filter((conn) => conn.enabled !== false);
  } catch (err) {
    logger.warn('Failed to load user connections', { error: err?.message || err });
    return [];
  }
}

export async function getUserOpenAIConnectionConfig(
  db,
  userId,
  connectionId,
  logger = createRootLogger({})
) {
  if (!db || !userId || !connectionId) return null;

  try {
    await ensureUserConnectionsTable(db);
    const row = await db.first(
      `SELECT id, user_id, name, provider_type, base_url, key, headers, auth_type, enabled, manual_models, manual_models_mode, created_at, updated_at
			FROM user_connections
			WHERE user_id = ? AND id = ?`,
      [userId, connectionId]
    );
    return normalizeUserConnectionRow({ row });
  } catch (err) {
    logger.warn('Failed to load user connection', { error: err?.message || err });
    return null;
  }
}

export async function createUserOpenAIConnection(opts = {}) {
  const { db, userId } = opts;
  const input = opts.input ?? {};
  if (!db || !userId) throw new Error('User id is required');
  await ensureUserConnectionsTable(db);

  const connection = normalizeUserConnectionInput({ input, existing: null });
  if (!connection.name) throw new Error('name is required');
  if (!connection.baseUrl) throw new Error('base_url is required');

  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO user_connections (
			id, user_id, name, provider_type, base_url, key, headers, auth_type,
			enabled, manual_models, manual_models_mode, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
    [
      id,
      userId,
      connection.name,
      connection.providerType,
      connection.baseUrl,
      connection.key,
      JSON.stringify(connection.headers || {}),
      connection.authType,
      connection.enabled ? 1 : 0,
      JSON.stringify(connection.manualModels || []),
      connection.manualModelsMode || 'all',
    ]
  );

  return getUserOpenAIConnectionConfig(db, userId, id);
}

export async function updateUserOpenAIConnection(opts = {}) {
  const { db, userId, connectionId } = opts;
  const input = opts.input ?? {};
  if (!db || !userId || !connectionId) throw new Error('Connection id is required');
  await ensureUserConnectionsTable(db);

  const existing = await getUserOpenAIConnectionConfig(db, userId, connectionId);
  if (!existing) return null;

  const connection = normalizeUserConnectionInput({ input, existing });
  if (!connection.name) throw new Error('name is required');
  if (!connection.baseUrl) throw new Error('base_url is required');

  await db.run(
    `UPDATE user_connections SET
			name = ?, provider_type = ?, base_url = ?, key = ?, headers = ?,
			auth_type = ?, enabled = ?, manual_models = ?, manual_models_mode = ?,
			updated_at = unixepoch()
		WHERE user_id = ? AND id = ?`,
    [
      connection.name,
      connection.providerType,
      connection.baseUrl,
      connection.key,
      JSON.stringify(connection.headers || {}),
      connection.authType,
      connection.enabled ? 1 : 0,
      JSON.stringify(connection.manualModels || []),
      connection.manualModelsMode || 'all',
      userId,
      connectionId,
    ]
  );

  return getUserOpenAIConnectionConfig(db, userId, connectionId);
}

export async function deleteUserOpenAIConnection({ db, userId, connectionId } = {}) {
  if (!db || !userId || !connectionId) throw new Error('Connection id is required');
  await ensureUserConnectionsTable(db);

  const existing = await getUserOpenAIConnectionConfig(db, userId, connectionId);
  if (!existing) return false;

  await db.run('DELETE FROM user_connections WHERE user_id = ? AND id = ?', [userId, connectionId]);
  return true;
}
