/**
 * Admin Tool Servers CRUD Handlers - GET/POST/PUT /api/admin/tool-servers
 */
import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import {
  isValidHttpUrl,
  loadToolServers,
  mergeToolServer,
  mergeToolSpecs,
  normalizeAuthType,
  parseHeadersForRequest,
  redactToolServer,
  saveToolServers,
} from '../../admin/tool-servers.js';
import { testMcpConnection, mapMcpTools } from '../../shared/tool-servers-shared.js';
import { applyAuthHeaders } from '../../shared/apply-auth-headers.js';
import { parseJsonAndRequireAdminAcl } from './admin-helpers.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';

async function handleListToolServers({ req, db, logger, _env, _user }) {
  try {
    const url = new URL(req.url);
    const includeDisabled = parseIncludeDisabledParam(
      String(url.searchParams.get('include_disabled') || '').toLowerCase()
    );
    const servers = await loadToolServers(db);
    const filtered = includeDisabled
      ? servers
      : servers.filter((server) => server.enabled !== false);
    return json(req, { servers: filtered.map(redactToolServer) });
  } catch (err) {
    logger.error('Tool servers fetch failed', { error: err?.message || err });
    return error(req, 'Failed to fetch tool servers', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

function validateToolServerUrl(req, body) {
  const url = String(body.url || '').trim();
  if (!url || !isValidHttpUrl(url)) {
    return {
      ok: false,
      error: error(req, 'Server URL must start with http:// or https://', HTTP_STATUS.BAD_REQUEST),
    };
  }
  const safety = isSafeOutboundUrl(url);
  if (!safety.safe) {
    return { ok: false, error: error(req, safety.reason, HTTP_STATUS.BAD_REQUEST) };
  }
  return { ok: true, url };
}

function buildToolServerTestHeaders(body) {
  try {
    const headers = parseHeadersForRequest(body.headers);
    applyAuthHeaders(headers, body);
    return { ok: true, headers };
  } catch (err) {
    return { ok: false, error: err.message || 'Headers must be valid JSON' };
  }
}

async function resolveToolServerOAuthIfNeeded(req, db, body, headers) {
  if (normalizeAuthType(body.auth_type) !== 'oauth') return null;
  return resolveOAuthHeaderForServer(req, db, body, headers);
}

async function runToolServerConnectionTest({ req, db, url, headers, body, _logger }) {
  const { tools: rawTools } = await testMcpConnection(url, headers);
  const toolSummaries = mapMcpTools(rawTools);
  const mergedTools = body.id
    ? await mergeConnectionTestToolsIntoExisting(db, body.id, toolSummaries)
    : toolSummaries;
  return json(req, {
    ok: true,
    message: 'Connection successful',
    tools: mergedTools,
  });
}

async function handleTestToolServer({ req, env, db, user, logger }) {
  const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'tool-server');
  if (denied) return denied;

  const urlResult = validateToolServerUrl(req, body);
  if (!urlResult.ok) return urlResult.error;

  const headersResult = buildToolServerTestHeaders(body);
  if (!headersResult.ok) {
    return error(req, headersResult.error, HTTP_STATUS.BAD_REQUEST);
  }

  const oauthResult = await resolveToolServerOAuthIfNeeded(req, db, body, headersResult.headers);
  if (oauthResult) return oauthResult;

  try {
    return await runToolServerConnectionTest({
      req,
      db,
      url: urlResult.url,
      headers: headersResult.headers,
      body,
    });
  } catch (err) {
    await persistToolServerConnectionError(db, logger, body, err);
    return error(req, 'Connection failed', HTTP_STATUS.BAD_GATEWAY, {
      message: err?.message || String(err),
    });
  }
}

async function handleUpdateToolServers({ req, env, db, user, logger }) {
  const { body, error: denied } = await parseJsonAndRequireAdminAcl(req, env, user, 'tool-server');
  if (denied) return denied;

  const servers = Array.isArray(body.servers) ? body.servers : [];
  const existing = await loadToolServers(db);
  const existingById = buildToolServerMap(existing);
  const sanitized = servers
    .map((server) => {
      const merged = mergeToolServer(existingById.get(String(server.id)), server);
      return merged;
    })
    .filter((server) => server.url);

  try {
    await saveToolServers(db, sanitized);
    await logAuditEvent(
      env,
      {
        actor_id: user.sub,
        action: 'tool_servers_updated',
        resource_type: 'admin',
        resource_id: 'tool-servers',
      },
      logger
    );
    return json(req, { ok: true, servers: sanitized.map(redactToolServer) });
  } catch (err) {
    logger.error('Tool servers update failed', { error: err?.message || err });
    return error(req, 'Failed to update tool servers', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Handle handleAdminToolServersCrud routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminToolServersCrud({
  req,
  env,
  user,
  path,
  db,
  logger,
  _ctx,
  _requestContext,
}) {
  if (req.method === 'GET' && path === '/api/admin/tool-servers') {
    return handleListToolServers({ req, db, logger });
  }
  if (req.method === 'POST' && path === '/api/admin/tool-servers/test') {
    return handleTestToolServer({ req, env, db, user, logger });
  }
  if (req.method === 'PUT' && path === '/api/admin/tool-servers') {
    return handleUpdateToolServers({ req, env, db, user, logger });
  }
  return null;
}

/**
 * Resolve OAuth header for a tool server — validates saved state and
 * attaches the Bearer token to the request headers.
 *
 * Returns a Response on error, or null on success (headers mutated).
 * The caller should return the error response if non-null.
 */
async function resolveOAuthHeaderForServer(req, db, body, headers) {
  const serverId = String(body.id || '').trim();
  if (!serverId) {
    return error(req, 'Server must be saved before OAuth verification', HTTP_STATUS.BAD_REQUEST);
  }
  const servers = await loadToolServers(db);
  const server = servers.find((entry) => String(entry.id) === serverId);
  const accessToken = server?.oauth_tokens?.access_token;
  if (!accessToken) {
    return error(
      req,
      'OAuth not connected yet. Click Connect OAuth first.',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  headers.Authorization = `Bearer ${accessToken}`;
  return null;
}

/**
 * Merge newly fetched tool specs into an existing tool server after
 * a successful test — merges tool lists and persists the update.
 *
 * @returns {Array} The merged tool list
 */
async function mergeConnectionTestToolsIntoExisting(db, bodyId, toolSummaries) {
  const servers = await loadToolServers(db);
  const index = servers.findIndex((entry) => String(entry.id) === String(bodyId));
  if (index === -1) {
    return toolSummaries;
  }
  const mergedTools = mergeToolSpecs(servers[index].tools, toolSummaries);
  servers[index] = {
    ...servers[index],
    tools: mergedTools,
    tools_error: '',
    tools_verified_at: new Date().toISOString(),
  };
  await saveToolServers(db, servers);
  return mergedTools;
}

/**
 * Persist a tool server error after a failed connection test — updates
 * the server record with the error message.
 */
/**
 * Parse the include_disabled query param — checks for truthy values.
 * @param {string} value - The lowercased query param value
 * @returns {boolean}
 */
function parseIncludeDisabledParam(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

/**
 * Build a Map of existing tool servers by their string id.
 * @param {Array} servers
 * @returns {Map<string, object>}
 */
function buildToolServerMap(servers) {
  return new Map((Array.isArray(servers) ? servers : []).map((entry) => [String(entry.id), entry]));
}

async function persistToolServerConnectionError(db, logger, body, err) {
  if (!body?.id) return;
  try {
    const servers = await loadToolServers(db);
    const index = servers.findIndex((entry) => String(entry.id) === String(body.id));
    if (index === -1) return;
    servers[index] = {
      ...servers[index],
      tools_error: err?.message || 'Connection failed',
      tools_verified_at: new Date().toISOString(),
    };
    await saveToolServers(db, servers);
  } catch (persistErr) {
    logger.warn('Failed to persist tool server error', {
      error: persistErr?.message || persistErr,
    });
  }
}
