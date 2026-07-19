import { HTTP_STATUS } from '../../shared/http-status.js';
import { ValidationError } from '../../errors/http-errors.js';
import {
  discoverConnectionModels,
  getConnectionDefaultBaseUrl,
  isConnectionUrlRequired,
  getUserOpenAIConnectionConfig,
  buildConnectionHeaders,
} from '../../llm/connections.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { error, getConnectionTestFailureMessage, json } from '../../utils/response.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';

export function isAccountPending(user) {
  return Boolean(user?.account_status && user.account_status !== 'active');
}

export function accountPendingResponse(req) {
  return error(req, 'Account pending approval.', HTTP_STATUS.FORBIDDEN);
}

export async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
}

export async function auditConnectionEvent(env, user, action, connectionId) {
  await logAuditEvent(env, {
    actor_id: user.sub,
    action,
    resource_type: 'connection',
    resource_id: connectionId || null,
    metadata: { connection_id: connectionId || null },
  });
}

export function handleConnectionError(err, req) {
  if (err instanceof ValidationError) {
    return error(req, err.message, HTTP_STATUS.BAD_REQUEST);
  }
  return error(req, err?.message || 'Failed to process connection', HTTP_STATUS.BAD_REQUEST);
}

export async function loadExistingConnectionForTest(db, userId, body) {
  const connectionId = String(body.id || body.connection_id || '').trim();
  if (!connectionId) return null;
  return getUserOpenAIConnectionConfig({
    db,
    userId,
    connectionId,
  });
}

export function resolveTestProviderType(body, existingConnection) {
  return (
    String(
      body.provider_type ||
        body.providerType ||
        existingConnection?.providerType ||
        'openai-compatible'
    )
      .trim()
      .toLowerCase() || 'openai-compatible'
  );
}

export function resolveTestBaseUrl(body, existingConnection, providerType) {
  const raw = String(body.base_url || body.baseUrl || existingConnection?.baseUrl || '').trim();
  const baseUrl = raw || getConnectionDefaultBaseUrl(providerType);

  if (isConnectionUrlRequired(providerType) && !raw) {
    return { error: 'Connection URL is required for compatible providers' };
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    return { error: 'Connection URL must start with http:// or https://' };
  }
  const safety = isSafeOutboundUrl(baseUrl);
  if (!safety.safe) {
    return { error: safety.reason };
  }
  return { value: baseUrl };
}

function isPlainObject(value) {
  return typeof value === 'object' && !Array.isArray(value);
}

function isStringHeader(value) {
  return typeof value === 'string' && value.trim();
}

function parseJsonHeader(headers) {
  let parsed;
  try {
    parsed = JSON.parse(headers);
  } catch (err) {
    throw new ValidationError(err?.message || 'Headers must be valid JSON');
  }
  if (!isPlainObject(parsed)) {
    throw new ValidationError('Headers must be a JSON object');
  }
  return parsed;
}

export function parseConnectionHeaders(body, existingConnection) {
  if (!body.headers) {
    return { value: existingConnection?.headers || {} };
  }
  if (isPlainObject(body.headers)) {
    return { value: body.headers };
  }
  if (isStringHeader(body.headers)) {
    return { value: parseJsonHeader(body.headers) };
  }
  return { value: existingConnection?.headers || {} };
}

// builder receives { body, existingConnection, providerType, baseUrl, headers }
export function buildTestConnection({ body, existingConnection, providerType, baseUrl, headers }) {
  return {
    providerType,
    providerFamily: providerType,
    baseUrl,
    key: resolveTestKey(body, existingConnection),
    headers: resolveTestHeaders(headers, existingConnection),
    authType: resolveTestAuth(body, existingConnection),
  };
}

function resolveTestKey(body, existingConnection) {
  return String(body.key || existingConnection?.key || '').trim();
}

function resolveTestAuth(body, existingConnection) {
  return String(body.auth_type || body.authType || existingConnection?.authType || '')
    .trim()
    .toLowerCase();
}

function resolveTestHeaders(headers, existingConnection) {
  return Object.keys(headers).length ? headers : existingConnection?.headers || {};
}

function getFirstDefinedId(item) {
  return item?.id || item?.modelId || item?.model_id || item?.name || '';
}

function getFirstDefinedDisplayName(item) {
  return item?.displayName || item?.display_name || item?.name || '';
}

const MODELS_PREFIX = 'models/';

function formatModelItem(item) {
  const rawId = String(getFirstDefinedId(item)).trim();
  const displayName = String(getFirstDefinedDisplayName(item)).trim();
  const trimmedId = rawId.startsWith(MODELS_PREFIX) ? rawId.slice(MODELS_PREFIX.length) : rawId;
  const trimmedName = displayName.startsWith(MODELS_PREFIX)
    ? displayName.slice(MODELS_PREFIX.length)
    : displayName;
  return { id: trimmedId, name: trimmedName };
}

export function formatDiscoveredModels(items) {
  return items.map(formatModelItem).filter((item) => Boolean(item.id));
}

export function buildDiscoverySuccessResponse(req, discovery) {
  return json(req, {
    ok: true,
    message: 'Connection successful',
    discovery_url: discovery.url,
    models: formatDiscoveredModels(discovery.items),
  });
}

export function buildDiscoveryFailureResponse(req, discovery, logger) {
  const upstreamMessage = discovery.error?.message || 'No models discovered';
  const upstreamStatus = discovery.error?.status;
  logger.warn('Connection test failed', {
    status: upstreamStatus,
    url: discovery.error?.url,
    upstreamMessage,
  });
  return error(req, 'Connection failed', HTTP_STATUS.BAD_GATEWAY, {
    message: getConnectionTestFailureMessage(upstreamStatus),
  });
}

export async function runConnectionTest(connection) {
  return discoverConnectionModels(connection, {
    headers: buildConnectionHeaders(connection),
  });
}
