import { createDB } from '../db.js';
import { getConfigValue } from '../utils/app-config.js';
import {
  buildConnectionAclIndex,
  evaluateConnectionAclAccess,
  loadConnectionAclRules,
} from '../utils/connection-acl.js';
import {
  buildProviderId,
  getConnectionProviderFamily,
  normalizeProviderFamily,
} from './provider-registry.js';
import { loadUserResourceOverrides } from '../../public/js/shared/utils/user-resource-overrides.js';
import { normalizeConnectionModelSelectionMode } from '../../public/js/shared/utils/connection-model-selection.js';
import { createLogger } from '../utils/logger.js';

function normalizeUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/$/, '');
}

function normalizeBaseUrl(url) {
  return normalizeUrl(url);
}

export function getConnectionApiType(providerType) {
  switch (
    normalizeProviderFamily(providerType) ||
    String(providerType || '')
      .trim()
      .toLowerCase()
  ) {
    case 'google':
      return 'stream-generate-content';
    case 'anthropic':
      return 'messages';
    default:
      return 'chat-completions';
  }
}

export function getConnectionApiTypeLabel(providerType) {
  switch (
    normalizeProviderFamily(providerType) ||
    String(providerType || '')
      .trim()
      .toLowerCase()
  ) {
    case 'google':
      return 'Gemini Stream Generate Content';
    case 'anthropic':
      return 'Messages';
    default:
      return 'Chat Completions';
  }
}

export function getConnectionDefaultBaseUrl(providerType) {
  switch (
    normalizeProviderFamily(providerType) ||
    String(providerType || '')
      .trim()
      .toLowerCase()
  ) {
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

export function isConnectionUrlRequired(providerType) {
  const raw = String(providerType || '')
    .trim()
    .toLowerCase();
  return raw === 'openai-compatible' || raw === 'gemini-compatible' || raw === 'claude-compatible';
}

function labelFromFamily(family) {
  switch (normalizeProviderFamily(family)) {
    case 'google':
      return 'Gemini';
    case 'anthropic':
      return 'Claude';
    default:
      return 'OpenAI';
  }
}

export function dedupeConnectionConfigs(connections = []) {
  const deduped = [];
  const indexBySignature = new Map();
  for (const conn of Array.isArray(connections) ? connections : []) {
    const providerType = String(conn?.providerType || conn?.providerFamily || '')
      .trim()
      .toLowerCase();
    const apiType = String(conn?.apiType || getConnectionApiType(providerType) || '')
      .trim()
      .toLowerCase();
    const baseUrl = normalizeBaseUrl(conn?.baseUrl || conn?.url || '');
    const signature = `${providerType}::${apiType}::${baseUrl}`;
    const existingIndex = indexBySignature.get(signature);
    if (existingIndex === undefined) {
      indexBySignature.set(signature, deduped.length);
      deduped.push(conn);
      continue;
    }

    const existing = deduped[existingIndex];
    const existingIsConfig = existing?.source === 'config';
    const incomingIsConfig = conn?.source === 'config';
    const existingIsUser = existing?.source === 'user';
    const incomingIsUser = conn?.source === 'user';
    const existingPriority = existingIsUser ? 2 : existingIsConfig ? 1 : 0;
    const incomingPriority = incomingIsUser ? 2 : incomingIsConfig ? 1 : 0;
    if (incomingPriority > existingPriority) {
      deduped[existingIndex] = conn;
    }
  }
  return deduped;
}

function normalizeAuthType(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (['bearer', 'x-api-key', 'x-goog-api-key', 'api-key'].includes(raw)) {
    return raw;
  }
  return '';
}

function hashString(value) {
  let hash = 5381;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function stableConnectionId(conn, index = 0) {
  const seed = [
    conn?.providerFamily || conn?.providerType || '',
    conn?.url || conn?.baseUrl || '',
    conn?.key || '',
    conn?.headers || '',
    index,
  ].join('|');
  return `conn-${hashString(seed)}`;
}

export function ensureConnectionId(conn, index = 0) {
  return conn?.id || stableConnectionId(conn, index);
}

function safeParseHeaders(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function normalizeConnectionManualModels(value = []) {
  if (!Array.isArray(value)) return [];
  const deduped = [];
  const seen = new Set();
  for (const item of value) {
    const rawId = String(item?.modelId || item?.id || item?.name || item || '').trim();
    if (!rawId) continue;
    const safeId = rawId.startsWith('models/') ? rawId.slice('models/'.length) : rawId;
    if (seen.has(safeId)) continue;
    seen.add(safeId);
    deduped.push({
      modelId: safeId,
      name: String(item?.name || safeId).trim() || safeId,
    });
  }
  return deduped;
}

function getConnectionAuthHeaderName(connection) {
  const family = getConnectionProviderFamily(connection);
  const authType = normalizeAuthType(connection?.authType);
  if (authType === 'bearer') return 'Authorization';
  if (authType === 'x-api-key' || authType === 'api-key') return 'x-api-key';
  if (authType === 'x-goog-api-key') return 'x-goog-api-key';
  switch (family) {
    case 'google':
      return 'x-goog-api-key';
    case 'anthropic':
      return 'x-api-key';
    default:
      return 'Authorization';
  }
}

export function buildConnectionHeaders(connection = {}) {
  const headers = { ...(connection.headers || {}) };
  const key = String(connection.key || '').trim();
  if (!key) return headers;

  const headerName = getConnectionAuthHeaderName(connection);
  if (headerName === 'Authorization') {
    if (!headers.Authorization) {
      headers.Authorization = `Bearer ${key}`;
    }
    const explicitAuthType = normalizeAuthType(connection?.authType);
    const hasXApiKey = Object.keys(headers).some(
      (name) =>
        String(name || '')
          .trim()
          .toLowerCase() === 'x-api-key'
    );
    if (!explicitAuthType && getConnectionProviderFamily(connection) === 'openai' && !hasXApiKey) {
      headers['x-api-key'] = key;
    }
    return headers;
  }

  if (!headers[headerName]) {
    headers[headerName] = key;
  }
  return headers;
}

function normalizeConnectionModelItems(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.models)) return payload.models;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export function extractConnectionModelId(item) {
  const raw = String(
    item?.id || item?.modelId || item?.model_id || item?.name || item?.model || ''
  ).trim();
  if (!raw) return '';
  return raw.startsWith('models/') ? raw.slice('models/'.length) : raw;
}

function appendDiscoveryCandidate(urls, candidate) {
  const normalized = normalizeBaseUrl(candidate);
  if (!normalized || urls.includes(normalized)) return;
  urls.push(normalized);
}

function maybeUpgradeDiscoveryBaseUrl(url) {
  const normalized = normalizeBaseUrl(url);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    const hostname = String(parsed.hostname || '').toLowerCase();
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (parsed.protocol === 'http:' && !isLoopback) {
      parsed.protocol = 'https:';
      return normalizeBaseUrl(parsed.toString());
    }
    return normalized;
  } catch {
    return normalized;
  }
}

export function getConnectionModelDiscoveryUrls(connection = {}) {
  const baseUrl = normalizeBaseUrl(connection.baseUrl || connection.url || '');
  if (!baseUrl) return [];

  const family = getConnectionProviderFamily(connection);
  const urls = [];
  const upgradedBaseUrl = maybeUpgradeDiscoveryBaseUrl(baseUrl);
  const baseCandidates =
    upgradedBaseUrl && upgradedBaseUrl !== baseUrl ? [upgradedBaseUrl, baseUrl] : [baseUrl];

  const add = (candidateBaseUrl, path) =>
    appendDiscoveryCandidate(urls, `${candidateBaseUrl}${path}`);

  for (const candidateBaseUrl of baseCandidates) {
    switch (family) {
      case 'google':
        if (candidateBaseUrl.endsWith('/v1beta')) {
          add(candidateBaseUrl, '/models');
        } else if (candidateBaseUrl.endsWith('/v1')) {
          add(candidateBaseUrl, '/models');
        } else {
          add(candidateBaseUrl, '/v1beta/models');
          add(candidateBaseUrl, '/models');
          add(candidateBaseUrl, '/v1/models');
        }
        break;
      case 'anthropic':
        if (candidateBaseUrl.endsWith('/v1')) {
          add(candidateBaseUrl, '/models');
        } else {
          add(candidateBaseUrl, '/v1/models');
          add(candidateBaseUrl, '/models');
        }
        break;
      default:
        add(candidateBaseUrl, '/models');
        if (!candidateBaseUrl.endsWith('/v1') && !candidateBaseUrl.endsWith('/v1beta')) {
          add(candidateBaseUrl, '/v1/models');
        }
        break;
    }
  }

  return urls;
}

export async function discoverConnectionModels(connection = {}, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const headers = options.headers || buildConnectionHeaders(connection);
  const urls = options.urls || getConnectionModelDiscoveryUrls(connection);
  let lastError = null;

  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastError = {
          url,
          status: res.status,
          message: body.slice(0, 200),
        };
        continue;
      }

      const payload = await res.json().catch(() => ({}));
      const items = normalizeConnectionModelItems(payload);
      if (items.length === 0) {
        lastError = {
          url,
          status: res.status,
          message: 'No models returned',
        };
        continue;
      }

      return {
        url,
        items,
        payload,
      };
    } catch (err) {
      lastError = {
        url,
        message: err?.message || String(err),
      };
    }
  }

  return {
    url: null,
    items: [],
    payload: null,
    error: lastError,
  };
}

export async function getStoredOpenAIConnectionConfigs(env, options = {}) {
  const logger = createLogger(env);
  const includeDisabled = options.includeDisabled === true;
  if (!env?.DB) return [];
  try {
    const db = createDB(env.DB);
    const raw = await getConfigValue(db, 'openai_connections', '[]');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((conn, index) => {
        const url = normalizeBaseUrl(conn.url || '');
        if (!url) return null;
        const headers = safeParseHeaders(conn.headers);
        const enabled = conn?.enabled !== false;
        const providerFamily =
          normalizeProviderFamily(conn.providerType || conn.providerFamily) || 'openai';
        return {
          id: ensureConnectionId(
            { ...conn, url, baseUrl: url, headers: conn.headers, providerFamily },
            index
          ),
          name: String(conn.name || `${labelFromFamily(providerFamily)} Compatible`).slice(0, 120),
          baseUrl: url,
          key: String(conn.key || '').trim(),
          headers,
          source: 'config',
          enabled,
          providerType: String(conn.providerType || providerFamily).toLowerCase(),
          providerFamily,
          providerId: buildProviderId({
            id: ensureConnectionId(
              { ...conn, url, baseUrl: url, headers: conn.headers, providerFamily },
              index
            ),
            providerType: String(conn.providerType || providerFamily).toLowerCase(),
            providerFamily,
          }),
          authType: normalizeAuthType(conn.authType),
          apiType: getConnectionApiType(conn.providerType || providerFamily),
          manualModels: normalizeConnectionManualModels(conn.manualModels),
          manualModelsMode:
            normalizeConnectionModelSelectionMode(
              conn.manualModelsMode || conn.manual_models_mode
            ) || 'all',
        };
      })
      .filter(Boolean);
    if (includeDisabled) return normalized;
    return normalized.filter((conn) => conn.enabled !== false);
  } catch (err) {
    logger.warn('Failed to load stored connections', { error: err?.message || err });
    return [];
  }
}

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
      columns.some((column) => String(column.name || '') === 'manual_models_mode');
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

function normalizeUserConnectionRow(row, index = 0) {
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

export async function loadUserOpenAIConnectionConfigs(db, userId, options = {}) {
  const logger = createLogger({});
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
      .map((row, index) => normalizeUserConnectionRow(row, index))
      .filter(Boolean);
    if (includeDisabled) return normalized;
    return normalized.filter((conn) => conn.enabled !== false);
  } catch (err) {
    logger.warn('Failed to load user connections', { error: err?.message || err });
    return [];
  }
}

export async function getUserOpenAIConnectionConfig(db, userId, connectionId) {
  const logger = createLogger({});
  if (!db || !userId || !connectionId) return null;
  try {
    await ensureUserConnectionsTable(db);
    const row = await db.first(
      `SELECT id, user_id, name, provider_type, base_url, key, headers, auth_type, enabled, manual_models, manual_models_mode, created_at, updated_at
       FROM user_connections
       WHERE user_id = ? AND id = ?`,
      [userId, connectionId]
    );
    return normalizeUserConnectionRow(row);
  } catch (err) {
    logger.warn('Failed to load user connection', { error: err?.message || err });
    return null;
  }
}

function normalizeUserConnectionInput(input = {}, existing = null) {
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

export async function createUserOpenAIConnection(db, userId, input = {}) {
  if (!db || !userId) throw new Error('User id is required');
  await ensureUserConnectionsTable(db);
  const connection = normalizeUserConnectionInput(input);
  if (!connection.name) throw new Error('name is required');
  if (!connection.baseUrl) throw new Error('base_url is required');
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO user_connections (
      id, user_id, name, provider_type, base_url, key, headers, auth_type, enabled, manual_models, manual_models_mode, created_at, updated_at
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

export async function updateUserOpenAIConnection(db, userId, connectionId, input = {}) {
  if (!db || !userId || !connectionId) throw new Error('Connection id is required');
  await ensureUserConnectionsTable(db);
  const existing = await getUserOpenAIConnectionConfig(db, userId, connectionId);
  if (!existing) return null;
  const connection = normalizeUserConnectionInput(input, existing);
  if (!connection.name) throw new Error('name is required');
  if (!connection.baseUrl) throw new Error('base_url is required');
  await db.run(
    `UPDATE user_connections
     SET name = ?, provider_type = ?, base_url = ?, key = ?, headers = ?, auth_type = ?, enabled = ?, manual_models = ?, manual_models_mode = ?, updated_at = unixepoch()
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

export async function deleteUserOpenAIConnection(db, userId, connectionId) {
  if (!db || !userId || !connectionId) throw new Error('Connection id is required');
  await ensureUserConnectionsTable(db);
  const existing = await getUserOpenAIConnectionConfig(db, userId, connectionId);
  if (!existing) return false;
  await db.run('DELETE FROM user_connections WHERE user_id = ? AND id = ?', [userId, connectionId]);
  return true;
}

export async function getAllOpenAIConnectionConfigs(env, options = {}) {
  const logger = createLogger(env);
  const includeDisabled = options.includeDisabled === true;
  const includeHiddenForUser = options.includeHiddenForUser === true;
  const userId = options.userId ? String(options.userId).trim() : '';
  const userRole =
    String(options.userRole || 'member')
      .trim()
      .toLowerCase() || 'member';
  const providedUserGroupIds = (() => {
    if (options.userGroupIds instanceof Set) {
      return new Set(
        Array.from(options.userGroupIds)
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      );
    }
    if (Array.isArray(options.userGroupIds)) {
      return new Set(
        options.userGroupIds.map((value) => String(value || '').trim()).filter(Boolean)
      );
    }
    return null;
  })();
  const storedConnections = await getStoredOpenAIConnectionConfigs(env, { includeDisabled });
  let userConnections = [];
  if (userId && env?.DB) {
    try {
      const db = createDB(env.DB);
      userConnections = await loadUserOpenAIConnectionConfigs(db, userId, { includeDisabled });
    } catch (err) {
      logger.warn('Failed to load user-owned connections', { error: err?.message || err });
      userConnections = [];
    }
  }
  const combined = [...storedConnections, ...userConnections];

  if (!env?.DB || !userId) {
    if (includeDisabled) return combined;
    return combined.filter((conn) => conn.enabled !== false);
  }

  try {
    const db = createDB(env.DB);
    const userOverrides = await loadUserResourceOverrides(db, userId);
    const hiddenConnectionIds = new Set(userOverrides.connections.hidden_ids || []);
    let userGroupIds = providedUserGroupIds;
    if (!userGroupIds) {
      const groupRows = await db.all('SELECT group_id FROM group_members WHERE user_id = ?', [
        userId,
      ]);
      userGroupIds = new Set(
        (Array.isArray(groupRows) ? groupRows : []).map((row) => row.group_id).filter(Boolean)
      );
    }
    const aclRules = await loadConnectionAclRules(db);
    const aclIndex = buildConnectionAclIndex(aclRules);

    const filtered = combined
      .map((connection) => {
        const access = evaluateConnectionAclAccess(connection, {
          user: { sub: userId, primary_role: userRole },
          userGroupIds,
          rules: aclIndex.get(connection.id) || [],
        });
        const hiddenForUser =
          connection.source !== 'user' &&
          hiddenConnectionIds.has(String(connection.id || '').trim());
        return {
          ...connection,
          access_label: access.access_label,
          access_variant: access.access_variant,
          allowed: access.allowed,
          visible_for_user: !hiddenForUser,
          hidden_for_user: hiddenForUser,
        };
      })
      .filter((connection) => connection.source === 'user' || connection.allowed)
      .filter(
        (connection) =>
          includeHiddenForUser || connection.source === 'user' || connection.visible_for_user
      )
      .map((connection) => {
        const rest = { ...connection };
        delete rest.allowed;
        return rest;
      });

    if (includeDisabled) return filtered;
    return filtered.filter((conn) => conn.enabled !== false);
  } catch (err) {
    logger.warn('Failed to apply connection ACL filtering', { error: err?.message || err });
    if (includeDisabled) return combined;
    return combined.filter((conn) => conn.enabled !== false);
  }
}

export async function getPrimaryOpenAIConnection(env) {
  const connections = await getAllOpenAIConnectionConfigs(env);
  return connections.find((conn) => conn.key) || connections[0] || null;
}
