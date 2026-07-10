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
import { loadUserGroupIdsFromDb } from '../shared/tool-servers-shared.js';
import {
  normalizeBaseUrl,
  ensureConnectionId,
  labelFromFamily,
  normalizeAuthType,
  safeParseHeaders,
  normalizeConnectionManualModels,
  getConnectionApiType,
} from './connections-utils.js';
import { loadUserOpenAIConnectionConfigs } from './connections-user.js';

// Re-export everything from sub-modules for backward compatibility
export {
  getConnectionApiType,
  getConnectionApiTypeLabel,
  getConnectionDefaultBaseUrl,
  isConnectionUrlRequired,
  normalizeConnectionManualModels,
  extractConnectionModelId,
  dedupeConnectionConfigs,
  ensureConnectionId,
} from './connections-utils.js';

export {
  loadUserOpenAIConnectionConfigs,
  getUserOpenAIConnectionConfig,
  createUserOpenAIConnection,
  updateUserOpenAIConnection,
  deleteUserOpenAIConnection,
} from './connections-user.js';

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
        lastError = { url, status: res.status, message: body.slice(0, 200) };
        continue;
      }
      const payload = await res.json().catch(() => ({}));
      const items = normalizeConnectionModelItems(payload);
      if (items.length === 0) {
        lastError = { url, status: res.status, message: 'No models returned' };
        continue;
      }
      return { url, items, payload };
    } catch (err) {
      lastError = { url, message: err?.message || String(err) };
    }
  }
  return { url: null, items: [], payload: null, error: lastError };
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
        const id = ensureConnectionId(
          { ...conn, url, baseUrl: url, headers: conn.headers, providerFamily },
          index
        );
        const providerType = String(conn.providerType || providerFamily).toLowerCase();
        return {
          id,
          name: String(conn.name || `${labelFromFamily(providerFamily)} Compatible`).slice(0, 120),
          baseUrl: url,
          key: String(conn.key || '').trim(),
          headers,
          source: 'config',
          enabled,
          providerType,
          providerFamily,
          providerId: buildProviderId({
            id,
            providerType,
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
      userConnections = await loadUserOpenAIConnectionConfigs({
        db,
        userId,
        options: { includeDisabled },
      });
    } catch (err) {
      logger.warn('Failed to load user-owned connections', {
        error: err?.message || err,
      });
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
      userGroupIds = await loadUserGroupIdsFromDb(db, userId);
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
    logger.warn('Failed to apply connection ACL filtering', {
      error: err?.message || err,
    });
    if (includeDisabled) return combined;
    return combined.filter((conn) => conn.enabled !== false);
  }
}

export async function getPrimaryOpenAIConnection(env) {
  const connections = await getAllOpenAIConnectionConfigs(env);
  return connections.find((conn) => conn.key) || connections[0] || null;
}
