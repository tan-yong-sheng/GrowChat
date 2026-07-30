/**
 * Admin Connections List & Test Handlers - GET/POST /api/admin/openai/connections
 */
import { error, getConnectionTestFailureMessage, json } from '../../utils/response.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { getConfigValue } from '../../utils/app-config.js';
import {
  buildConnectionHeaders,
  discoverConnectionModels,
  ensureConnectionId,
  extractConnectionModelId,
  getAllOpenAIConnectionConfigs,
  getConnectionDefaultBaseUrl,
  isConnectionUrlRequired,
} from '../../llm/connections.js';
import { normalizeProviderFamily } from '../../llm/provider-registry.js';
import { parseJsonAndRequireAdminAcl } from './admin-helpers.js';
import {
  isValidHttpUrl,
  normalizeBaseUrl,
  parseHeadersForRequest,
} from '../../admin/tool-servers.js';

function firstPresentValue(obj, keys) {
  for (const key of keys) {
    const value = obj && obj[key];
    if (value) return value;
  }
  return undefined;
}

function normalizeConnectionType(conn) {
  return String((conn && conn.providerType) || 'openai-compatible').toLowerCase();
}

function normalizeConnectionFamily(conn) {
  const raw = conn && (conn.providerType || conn.providerFamily);
  return normalizeProviderFamily(raw) || 'openai';
}

function connectionHasKey(conn) {
  return Boolean(firstPresentValue(conn, ['key', 'keyMasked', 'hasKey', 'has_key']));
}

function maskConnectionKey(conn) {
  if (conn?.keyMasked) return conn.keyMasked;
  if (conn?.key) return `••••${String(conn.key).slice(-4)}`;
  return '';
}

function isConnectionEnabled(conn) {
  return conn?.enabled !== false;
}

function normalizeConnectionListItem(conn, index) {
  return {
    ...conn,
    id: ensureConnectionId(conn, index),
    providerType: normalizeConnectionType(conn),
    providerFamily: normalizeConnectionFamily(conn),
    hasKey: connectionHasKey(conn),
    keyMasked: maskConnectionKey(conn),
    key: undefined,
    readOnly: false,
    source: 'config',
    enabled: isConnectionEnabled(conn),
  };
}

function parseConnectionsList(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeConnectionListItem);
  } catch {
    return [];
  }
}

async function handleConnectionsListGet(req, db, logger) {
  try {
    const url = new URL(req.url);
    const includeDisabled = ['1', 'true', 'yes'].includes(
      String(url.searchParams.get('include_disabled') || '').toLowerCase()
    );
    const manualConnections = parseConnectionsList(
      await getConfigValue(db, 'openai_connections', '[]')
    );
    const enabledRaw = await getConfigValue(db, 'openai_enabled', 'true');
    const enabled = String(enabledRaw).toLowerCase() !== 'false';
    return json(req, {
      enabled,
      connections: includeDisabled
        ? manualConnections
        : manualConnections.filter((connection) => connection.enabled !== false),
    });
  } catch (err) {
    logger.error('OpenAI connections fetch failed', { error: err?.message || err });
    return error(req, 'Failed to fetch connections', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

function validateConnectionBaseUrl(req, baseUrl, requiresUrl, url) {
  if (requiresUrl && !url) {
    return error(
      req,
      'Connection URL is required for compatible providers',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (!isValidHttpUrl(baseUrl)) {
    return error(
      req,
      'Connection URL must start with http:// or https://',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  const urlSafety = isSafeOutboundUrl(baseUrl);
  if (!urlSafety.safe) {
    return error(req, urlSafety.reason, HTTP_STATUS.BAD_REQUEST);
  }
  return null;
}

function resolveConnectionAuthType(body, existingConnection) {
  const raw = String(
    body.authType ||
      body.auth_type ||
      (existingConnection && existingConnection.authType) ||
      (existingConnection && existingConnection.auth_type) ||
      ''
  )
    .trim()
    .toLowerCase();
  return ['bearer', 'x-api-key', 'x-goog-api-key', 'api-key'].includes(raw) ? raw : '';
}

function resolveConnectionKey(key, existingConnection) {
  return key || String((existingConnection && existingConnection.key) || '').trim();
}

function buildTestConnection(body, baseUrl, headers, key, existingConnection) {
  const providerType = String(body.providerType || 'openai').toLowerCase();
  const providerFamily =
    normalizeProviderFamily(body.providerType || body.providerFamily) || 'openai';
  const authType = resolveConnectionAuthType(body, existingConnection);
  return {
    providerType,
    providerFamily,
    authType,
    key: resolveConnectionKey(key, existingConnection),
    headers,
    baseUrl: normalizeBaseUrl(baseUrl),
  };
}

const DISPLAY_NAME_FIELDS = ['displayName', 'display_name', 'name', 'id'];

function resolveDisplayName(item, rawId) {
  for (const key of DISPLAY_NAME_FIELDS) {
    const value = item && item[key];
    if (value) return String(value).trim();
  }
  return rawId ? String(rawId).trim() : '';
}

function stripModelsPrefix(name) {
  return name.startsWith('models/') ? name.slice('models/'.length) : name;
}

function formatDiscoveredModels(items) {
  return items
    .map((item) => {
      const rawId = extractConnectionModelId(item);
      const displayName = resolveDisplayName(item, rawId);
      return {
        id: rawId,
        name: stripModelsPrefix(displayName),
      };
    })
    .filter((item) => Boolean(item.id));
}

async function findExistingConnection(env, connectionId) {
  if (!connectionId) return null;
  const existingConnections = await getAllOpenAIConnectionConfigs(env, {
    includeDisabled: true,
  });
  return (
    (Array.isArray(existingConnections) ? existingConnections : []).find(
      (connection) => String(connection.id || '') === connectionId
    ) || null
  );
}

async function handleConnectionsTestPost(req, env, user, logger) {
  const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'connection');
  if (denied) return denied;

  const inputs = parseConnectionTestBody(body);
  const urlError = validateConnectionBaseUrl(req, inputs.baseUrl, inputs.requiresUrl, inputs.url);
  if (urlError) return urlError;

  let headers;
  try {
    headers = parseHeadersForRequest(body.headers);
  } catch (err) {
    return error(req, err.message || 'Headers must be valid JSON', HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const existingConnection = await findExistingConnection(env, inputs.connectionId);
    const testConnection = buildTestConnection(
      body,
      inputs.baseUrl,
      headers,
      inputs.key,
      existingConnection
    );
    const discovery = await discoverConnectionModels(testConnection, {
      headers: buildConnectionHeaders(testConnection),
    });
    if (!discovery.items.length) {
      return respondToDiscoveryFailure(req, logger, discovery);
    }
    return respondToDiscoverySuccess(req, discovery);
  } catch (err) {
    return error(req, 'Connection failed', HTTP_STATUS.BAD_GATEWAY, {
      message: err?.message || String(err),
    });
  }
}

function resolveProviderType(body) {
  return String(body.providerType || 'openai').toLowerCase();
}

function resolveProviderFamily(body, fallback) {
  return normalizeProviderFamily(body.providerType || body.providerFamily) || fallback;
}

function resolveConnectionId(body) {
  return String(body.id || body.connectionId || '').trim();
}

function resolveBaseUrl(body, providerType, providerFamily) {
  const url = String(body.url || '').trim();
  const requiresUrl = isConnectionUrlRequired(providerType);
  const baseUrl = url || getConnectionDefaultBaseUrl(providerType || providerFamily);
  return { url, requiresUrl, baseUrl };
}

function parseConnectionTestBody(body) {
  const providerType = resolveProviderType(body);
  const providerFamily = resolveProviderFamily(body, providerType);
  const { url, requiresUrl, baseUrl } = resolveBaseUrl(body, providerType, providerFamily);
  const connectionId = resolveConnectionId(body);
  const key = String(body.key || '').trim();
  return { providerType, providerFamily, url, connectionId, requiresUrl, baseUrl, key };
}

function respondToDiscoveryFailure(req, logger, discovery) {
  const upstreamStatus = discovery.error?.status;
  logger.warn('Connection test failed', {
    status: upstreamStatus,
    url: discovery.error?.url,
    upstreamMessage: discovery.error?.message || 'No models discovered',
  });
  return error(req, 'Connection failed', HTTP_STATUS.BAD_GATEWAY, {
    message: getConnectionTestFailureMessage(upstreamStatus),
  });
}

function respondToDiscoverySuccess(req, discovery) {
  return json(req, {
    ok: true,
    message: 'Connection successful',
    discovery_url: discovery.url,
    models: formatDiscoveredModels(discovery.items),
  });
}

/**
 * Handle handleAdminConnectionsList routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminConnectionsList(
  req,
  env,
  ctx,
  user,
  path,
  { db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/admin/openai/connections') {
    return handleConnectionsListGet(req, db, logger);
  }

  if (req.method === 'POST' && path === '/api/admin/openai/connections/test') {
    return handleConnectionsTestPost(req, env, user, logger);
  }

  return null;
}
