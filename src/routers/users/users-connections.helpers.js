import { ValidationError } from '../../errors/http-errors.js';
import {
  discoverConnectionModels,
  getConnectionDefaultBaseUrl,
  isConnectionUrlRequired,
} from '../../llm/connections.js';
import { getUserOpenAIConnectionConfig } from '../../llm/connections.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { error, getConnectionTestFailureMessage, json } from '../../utils/response.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';

export function isAccountPending(user) {
  return Boolean(user?.account_status && user.account_status !== 'active');
}

export function accountPendingResponse(req) {
  return error(req, 'Account pending approval.', 403);
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
    return error(req, err.message, 400);
  }
  return error(req, err?.message || 'Failed to process connection', 400);
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

export function parseConnectionHeaders(body, existingConnection) {
  if (!body.headers) {
    return { value: existingConnection?.headers || {} };
  }
  if (typeof body.headers === 'object' && !Array.isArray(body.headers)) {
    return { value: body.headers };
  }
  if (typeof body.headers === 'string' && body.headers.trim()) {
    let parsed;
    try {
      parsed = JSON.parse(body.headers);
    } catch (err) {
      throw new ValidationError(err?.message || 'Headers must be valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError('Headers must be a JSON object');
    }
    return { value: parsed };
  }
  return { value: existingConnection?.headers || {} };
}

export function buildTestConnection(body, existingConnection, providerType, baseUrl, headers) {
  return {
    providerType,
    providerFamily: providerType,
    baseUrl,
    key: String(body.key || existingConnection?.key || '').trim(),
    headers: Object.keys(headers).length ? headers : existingConnection?.headers || {},
    authType: String(body.auth_type || body.authType || existingConnection?.authType || '')
      .trim()
      .toLowerCase(),
  };
}

export function formatDiscoveredModels(items) {
  return items
    .map((item) => {
      const rawId = String(item?.id || item?.modelId || item?.model_id || item?.name || '').trim();
      const displayName = String(
        item?.displayName || item?.display_name || item?.name || rawId || ''
      ).trim();
      return {
        id: rawId.startsWith('models/') ? rawId.slice('models/'.length) : rawId,
        name: displayName.startsWith('models/') ? displayName.slice('models/'.length) : displayName,
      };
    })
    .filter((item) => Boolean(item.id));
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
  return error(req, 'Connection failed', 502, {
    message: getConnectionTestFailureMessage(upstreamStatus),
  });
}

export async function runConnectionTest(connection) {
  const { buildConnectionHeaders } = await import('../../llm/connections.js');
  return discoverConnectionModels(connection, {
    headers: buildConnectionHeaders(connection),
  });
}
