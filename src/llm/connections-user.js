import crypto from 'node:crypto';
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
import { normalizeProviderFamily, buildProviderId } from './provider-registry.js';
import { normalizeConnectionModelSelectionMode } from '../../public/js/shared/utils/connection-model-selection.js';

const logger = createRootLogger({});

let tableEnsured = false;

const NAME_MAX_LENGTH = 120;

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

// -- User-connection row / input normalization (re-introduced after the
// PR #276 refactor moved the inline functions to a shared module but never
// exported them. The resulting `undefined is not a function` errors were
// silently swallowed by loadUserOpenAIConnectionConfigs' catch block, so in
// production this looked like "stored connections silently disappear".) --

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

function resolveRowProviderType(row) {
  const raw = String(row.provider_type || row.providerType || 'openai-compatible')
    .trim()
    .toLowerCase();
  return raw || 'openai-compatible';
}

function resolveRowProviderFamily(row, providerType) {
  const family = normalizeProviderFamily(row.provider_family || row.providerFamily || providerType);
  return family || 'openai';
}

function resolveRowManualModelsMode(row) {
  const mode = normalizeConnectionModelSelectionMode(
    row.manual_models_mode || row.manualModelsMode
  );
  return mode || 'all';
}

function resolveRowBaseUrl(row) {
  return normalizeBaseUrl(row.base_url || row.baseUrl || '');
}

function buildNormalizedRowIdentity(row, index) {
  const baseUrl = resolveRowBaseUrl(row);
  if (!baseUrl) {
    logger.warn('Skipping user connection with unresolvable baseUrl', { id: row?.id });
    return null;
  }
  const providerType = resolveRowProviderType(row);
  const providerFamily = resolveRowProviderFamily(row, providerType);
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
  return { id, baseUrl, providerType, providerFamily };
}

function buildNormalizedRowShape(row, identity) {
  return {
    id: identity.id,
    name: String(row.name || `${labelFromFamily(identity.providerFamily)} Personal`).slice(
      0,
      NAME_MAX_LENGTH
    ),
    baseUrl: identity.baseUrl,
    url: identity.baseUrl,
    key: String(row.key || '').trim(),
    headers: parseUserConnectionHeaders(row.headers),
    source: 'user',
    enabled: row.enabled !== 0 && row.enabled !== false,
    providerType: identity.providerType,
    providerFamily: identity.providerFamily,
    providerId: buildProviderId({
      id: identity.id,
      providerType: identity.providerType,
      providerFamily: identity.providerFamily,
    }),
    authType: normalizeAuthType(row.auth_type || row.authType),
    apiType: getConnectionApiType(identity.providerType),
    manualModels: parseUserConnectionManualModels(row.manual_models || row.manualModels),
    manualModelsMode: resolveRowManualModelsMode(row),
    ownerUserId: row.user_id || row.userId || null,
    personal: true,
  };
}

export function normalizeUserConnectionRow({ row, index = 0 } = {}) {
  if (!row) return null;
  const identity = buildNormalizedRowIdentity(row, index);
  if (!identity) return null;
  return buildNormalizedRowShape(row, identity);
}

function resolveInputProviderType(input, existing) {
  const raw = String(
    input.provider_type || input.providerType || existing?.providerType || 'openai-compatible'
  )
    .trim()
    .toLowerCase();
  return raw || 'openai-compatible';
}

function resolveInputProviderFamily(input, existing, providerType) {
  const family = normalizeProviderFamily(
    input.provider_family || input.providerFamily || existing?.providerFamily || providerType
  );
  return family || 'openai';
}

function resolveInputBaseUrl(input, existing, providerType) {
  const baseUrlRaw = input.base_url !== undefined ? input.base_url : input.baseUrl;
  return normalizeBaseUrl(
    baseUrlRaw || existing?.baseUrl || getConnectionDefaultBaseUrl(providerType)
  );
}

function resolveInputManualModels(input, existing) {
  if (Array.isArray(input.manual_models))
    return normalizeConnectionManualModels(input.manual_models);
  if (Array.isArray(input.manualModels)) return normalizeConnectionManualModels(input.manualModels);
  return normalizeConnectionManualModels(existing?.manualModels || []);
}

function resolveInputManualModelsMode(input, existing) {
  const mode = normalizeConnectionModelSelectionMode(
    input.manual_models_mode || input.manualModelsMode || existing?.manualModelsMode
  );
  return mode || 'all';
}

function resolveInputKey(input, existing) {
  const keyRaw = input.key;
  if (keyRaw !== undefined) return String(keyRaw || '').trim();
  return String(existing?.key || '').trim();
}

function resolveInputHeaders(input, existing) {
  return safeParseHeaders(input.headers !== undefined ? input.headers : existing?.headers);
}

function resolveInputEnabled(input, existing) {
  if (input.enabled !== undefined) return input.enabled !== false;
  return existing?.enabled !== false;
}

function resolveInputAuthType(input, existing) {
  return normalizeAuthType(input.auth_type || input.authType || existing?.authType || '');
}

export function normalizeUserConnectionInput({ input = {}, existing = null } = {}) {
  const name = String(input.name || existing?.name || '')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
  const providerType = resolveInputProviderType(input, existing);
  const providerFamily = resolveInputProviderFamily(input, existing, providerType);

  return {
    name,
    providerType,
    providerFamily,
    baseUrl: resolveInputBaseUrl(input, existing, providerType),
    key: resolveInputKey(input, existing),
    headers: resolveInputHeaders(input, existing),
    authType: resolveInputAuthType(input, existing),
    enabled: resolveInputEnabled(input, existing),
    manualModels: resolveInputManualModels(input, existing),
    manualModelsMode: resolveInputManualModelsMode(input, existing),
  };
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
