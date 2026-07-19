import crypto from 'node:crypto';
import { createRootLogger } from '../services/logger.js';

import { normalizeUserConnectionRow, normalizeUserConnectionInput } from './connections-utils.js';

let tableEnsured = false;

async function ensureUserConnectionsTable(db) {
  if (tableEnsured) return;
  await db.run(`CREATE TABLE IF NOT EXISTS user_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    provider_type TEXT,
    base_url TEXT,
    key TEXT,
    headers TEXT DEFAULT '{}',
    auth_type TEXT,
    enabled INTEGER DEFAULT 1,
    manual_models TEXT DEFAULT '[]',
    manual_models_mode TEXT DEFAULT 'all',
    created_at INTEGER,
    updated_at INTEGER
  )`);
  tableEnsured = true;
}

// -- Backward-compatible options detection helpers --

function isOptionsObject(opts) {
  return opts && typeof opts === 'object' && 'userId' in opts;
}

function resolveDb(opts, isOpt, _legacyDb) {
  return isOpt ? opts.db : opts;
}

function resolveUserId(opts, isOpt, legacyId) {
  return isOpt ? opts.userId : legacyId;
}

function resolveLogger(opts, isOpt, legacyLogger) {
  return (isOpt ? opts.logger : legacyLogger) || createRootLogger({});
}

function resolveOptions(opts, isOpt, legacyOptions) {
  return isOpt ? opts.options : legacyOptions;
}

function resolveConnectionId(opts, isOpt, legacyConnectionId) {
  return isOpt ? opts.connectionId : legacyConnectionId;
}

// -- Core async functions --

export async function loadUserOpenAIConnectionConfigs(
  opts,
  legacyUserId,
  legacyOptions,
  legacyLogger
) {
  const isOpt = isOptionsObject(opts);
  const db = resolveDb(opts, isOpt, opts);
  const userId = resolveUserId(opts, isOpt, legacyUserId);
  const options = resolveOptions(opts, isOpt, legacyOptions);
  const logger = resolveLogger(opts, isOpt, legacyLogger);
  const includeDisabled = options?.includeDisabled === true;
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
  opts,
  legacyUserId,
  legacyConnectionId,
  legacyLogger
) {
  const isOpt = isOptionsObject(opts);
  const db = resolveDb(opts, isOpt, opts);
  const userId = resolveUserId(opts, isOpt, legacyUserId);
  const connectionId = resolveConnectionId(opts, isOpt, legacyConnectionId);
  const logger = resolveLogger(opts, isOpt, legacyLogger);
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

export async function createUserOpenAIConnection(opts) {
  const { db, userId, input } = extractCreateUserConnectionOpts(opts);
  validateUserConnectionContext({ db, userId });
  await ensureUserConnectionsTable(db);

  const connection = normalizeUserConnectionInput({ input, existing: null });
  validateUserConnectionPayload(connection);

  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO user_connections (
				id, user_id, name, provider_type, base_url, key, headers, auth_type,
				enabled, manual_models, manual_models_mode, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
    insertUserConnectionParams({ id, userId, connection })
  );

  return getUserOpenAIConnectionConfig({ db, userId, connectionId: id });
}

async function ensureUserConnectionContext({ db, userId, connectionId }) {
  if (!db || !userId || !connectionId) throw new Error('Connection id is required');
  await ensureUserConnectionsTable(db);
}

export async function updateUserOpenAIConnection(opts) {
  const { db, userId, connectionId, input } = extractUpdateUserConnectionOpts(opts);
  await ensureUserConnectionContext({ db, userId, connectionId });

  const existing = await getUserOpenAIConnectionConfig({ db, userId, connectionId });
  if (!existing) return null;

  const connection = normalizeUserConnectionInput({ input, existing });
  validateUserConnectionPayload(connection);

  await db.run(
    `UPDATE user_connections SET
				name = ?, provider_type = ?, base_url = ?, key = ?, headers = ?,
				auth_type = ?, enabled = ?, manual_models = ?, manual_models_mode = ?,
				updated_at = unixepoch()
			WHERE user_id = ? AND id = ?`,
    updateUserConnectionParams({ userId, connectionId, connection })
  );

  return getUserOpenAIConnectionConfig(db, userId, connectionId);
}

export async function deleteUserOpenAIConnection(options) {
  const { db, userId, connectionId } = options ?? {};
  await ensureUserConnectionContext({ db, userId, connectionId });

  const existing = await getUserOpenAIConnectionConfig({ db, userId, connectionId });
  if (!existing) return false;

  await db.run('DELETE FROM user_connections WHERE user_id = ? AND id = ?', [userId, connectionId]);
  return true;
}

function extractCreateUserConnectionOpts(opts) {
  return {
    db: opts?.db,
    userId: opts?.userId,
    input: opts?.input ?? {},
  };
}

function extractUpdateUserConnectionOpts(opts) {
  return {
    db: opts?.db,
    userId: opts?.userId,
    connectionId: opts?.connectionId,
    input: opts?.input ?? {},
  };
}

function validateUserConnectionContext({ db, userId }) {
  if (!db || !userId) throw new Error('User id is required');
}

function validateUserConnectionPayload(connection) {
  if (!connection.name) throw new Error('name is required');
  if (!connection.baseUrl) throw new Error('base_url is required');
}

function insertUserConnectionParams({ id, userId, connection }) {
  return [
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
  ];
}

function updateUserConnectionParams({ userId, connectionId, connection }) {
  return [
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
  ];
}
