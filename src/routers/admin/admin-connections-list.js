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

function parseConnectionsList(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((conn, index) => ({
      ...conn,
      id: ensureConnectionId(conn, index),
      providerType: String(conn?.providerType || 'openai-compatible').toLowerCase(),
      providerFamily:
        normalizeProviderFamily(conn?.providerType || conn?.providerFamily) || 'openai',
      hasKey: Boolean(conn?.key || conn?.keyMasked || conn?.hasKey || conn?.has_key),
      keyMasked: conn?.keyMasked || (conn?.key ? `••••${String(conn.key).slice(-4)}` : ''),
      key: undefined,
      readOnly: false,
      source: 'config',
      enabled: conn?.enabled !== false,
    }));
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

function buildTestConnection(body, baseUrl, headers, key, existingConnection) {
  const providerType = String(body.providerType || 'openai').toLowerCase();
  const providerFamily =
    normalizeProviderFamily(body.providerType || body.providerFamily) || 'openai';
  const rawAuthType = String(
    body.authType ||
      body.auth_type ||
      existingConnection?.authType ||
      existingConnection?.auth_type ||
      ''
  )
    .trim()
    .toLowerCase();
  const authType = ['bearer', 'x-api-key', 'x-goog-api-key', 'api-key'].includes(rawAuthType)
    ? rawAuthType
    : '';
  return {
    providerType,
    providerFamily,
    authType,
    key: key || String(existingConnection?.key || '').trim(),
    headers,
    baseUrl: normalizeBaseUrl(baseUrl),
  };
}

function formatDiscoveredModels(items) {
  return items
    .map((item) => {
      const rawId = extractConnectionModelId(item);
      const displayName = String(
        item?.displayName || item?.display_name || item?.name || item?.id || rawId || ''
      ).trim();
      return {
        id: rawId,
        name: displayName.startsWith('models/') ? displayName.slice('models/'.length) : displayName,
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

  const providerType = String(body.providerType || 'openai').toLowerCase();
  const providerFamily =
    normalizeProviderFamily(body.providerType || body.providerFamily) || 'openai';
  const url = String(body.url || '').trim();
  const connectionId = String(body.id || body.connectionId || '').trim();
  const requiresUrl = isConnectionUrlRequired(providerType);
  const baseUrl = url || getConnectionDefaultBaseUrl(providerType || providerFamily);

  const urlError = validateConnectionBaseUrl(req, baseUrl, requiresUrl, url);
  if (urlError) return urlError;

  const key = String(body.key || '').trim();
  let headers;
  try {
    headers = parseHeadersForRequest(body.headers);
  } catch (err) {
    return error(req, err.message || 'Headers must be valid JSON', HTTP_STATUS.BAD_REQUEST);
  }

  try {
    const existingConnection = await findExistingConnection(env, connectionId);
    const testConnection = buildTestConnection(body, baseUrl, headers, key, existingConnection);
    const discovery = await discoverConnectionModels(testConnection, {
      headers: buildConnectionHeaders(testConnection),
    });
    if (!discovery.items.length) {
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

    return json(req, {
      ok: true,
      message: 'Connection successful',
      discovery_url: discovery.url,
      models: formatDiscoveredModels(discovery.items),
    });
  } catch (err) {
    return error(req, 'Connection failed', HTTP_STATUS.BAD_GATEWAY, {
      message: err?.message || String(err),
    });
  }
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
