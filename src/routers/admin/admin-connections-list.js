/**
 * Admin Connections List & Test Handlers - GET/POST /api/admin/openai/connections
 */
import { error, getConnectionTestFailureMessage, json } from '../../utils/response.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
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
import { ensureAdminAclAccess } from './admin-helpers.js';
import {
  isValidHttpUrl,
  normalizeBaseUrl,
  parseHeadersForRequest,
} from '../../admin/tool-servers.js';

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
    try {
      const url = new URL(req.url);
      const includeDisabled = ['1', 'true', 'yes'].includes(
        String(url.searchParams.get('include_disabled') || '').toLowerCase()
      );
      let manualConnections = [];
      const raw = await getConfigValue(db, 'openai_connections', '[]');
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          manualConnections = parsed.map((conn, index) => ({
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
        }
      } catch {
        manualConnections = [];
      }
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
      return error(req, 'Failed to fetch connections', 500);
    }
  }

  // POST /api/admin/openai/connections/test - Test OpenAI connection
  if (req.method === 'POST' && path === '/api/admin/openai/connections/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess({ env, user, resource: 'connection' });
    if (!aclDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[aclDecision.code] || 403;
      return error(req, aclDecision.reason || 'Forbidden', statusCode);
    }

    const providerType = String(body.providerType || 'openai').toLowerCase();
    const providerFamily =
      normalizeProviderFamily(body.providerType || body.providerFamily) || 'openai';
    const url = String(body.url || '').trim();
    const connectionId = String(body.id || body.connectionId || '').trim();
    const requiresUrl = isConnectionUrlRequired(providerType);
    const baseUrl = url || getConnectionDefaultBaseUrl(providerType || providerFamily);
    if (requiresUrl && !url) {
      return error(req, 'Connection URL is required for compatible providers', 400);
    }
    if (!isValidHttpUrl(baseUrl)) {
      return error(req, 'Connection URL must start with http:// or https://', 400);
    }
    const urlSafety = isSafeOutboundUrl(baseUrl);
    if (!urlSafety.safe) {
      return error(req, urlSafety.reason, 400);
    }

    const key = String(body.key || '').trim();
    let headers;
    try {
      headers = parseHeadersForRequest(body.headers);
    } catch (err) {
      return error(req, err.message || 'Headers must be valid JSON', 400);
    }

    try {
      let existingConnection = null;
      if (connectionId) {
        const existingConnections = await getAllOpenAIConnectionConfigs(env, {
          includeDisabled: true,
        });
        existingConnection =
          (Array.isArray(existingConnections) ? existingConnections : []).find(
            (connection) => String(connection.id || '') === connectionId
          ) || null;
      }
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
      const testConnection = {
        providerType,
        providerFamily,
        authType,
        key: key || String(existingConnection?.key || '').trim(),
        headers,
        baseUrl: normalizeBaseUrl(baseUrl),
      };
      const discovery = await discoverConnectionModels(testConnection, {
        headers: buildConnectionHeaders(testConnection),
      });
      if (!discovery.items.length) {
        const upstreamMessage = discovery.error?.message || 'No models discovered';
        const upstreamStatus = discovery.error?.status;
        logger.warn('Connection test failed', {
          status: upstreamStatus,
          url: discovery.error?.url,
          upstreamMessage,
        });
        const safeReason = getConnectionTestFailureMessage(upstreamStatus);
        return error(req, 'Connection failed', 502, {
          message: safeReason,
        });
      }

      return json(req, {
        ok: true,
        message: 'Connection successful',
        discovery_url: discovery.url,
        models: discovery.items
          .map((item) => {
            const rawId = extractConnectionModelId(item);
            const displayName = String(
              item?.displayName || item?.display_name || item?.name || item?.id || rawId || ''
            ).trim();
            return {
              id: rawId,
              name: displayName.startsWith('models/')
                ? displayName.slice('models/'.length)
                : displayName,
            };
          })
          .filter((item) => Boolean(item.id)),
      });
    } catch (err) {
      return error(req, 'Connection failed', 502, {
        message: err?.message || String(err),
      });
    }
  }

  return null;
}
