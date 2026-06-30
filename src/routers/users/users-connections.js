/**
 * Users Connections Handler
 */
import { createDB } from '../../db.js';
import { ValidationError } from '../../errors/http-errors.js';
import {
  buildConnectionHeaders,
  createUserOpenAIConnection,
  deleteUserOpenAIConnection,
  discoverConnectionModels,
  getConnectionDefaultBaseUrl,
  getUserOpenAIConnectionConfig,
  isConnectionUrlRequired,
  updateUserOpenAIConnection,
} from '../../llm/connections.js';
import {
  loadWorkspaceConnectionsPayload,
  toPersonalConnectionSummary,
} from '../../services/workspace-settings.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { error, getConnectionTestFailureMessage, json } from '../../utils/response.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import { normalizeRole } from './users-helpers.js';

/**
 * Handle users/connections routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersConnections(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/users/me/resources/connections') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    const db = createDB(env.DB);
    try {
      const payload = await loadWorkspaceConnectionsPayload({
        db,
        env,
        userId: user.sub,
        primaryRole: normalizeRole(user.primary_role),
        includeDisabled: true,
        includeHiddenForUser: true,
      });
      return json(req, {
        connections: payload.connections,
        my_connections: payload.my_connections,
      });
    } catch (err) {
      logger.error('Load user connections failed', { error: err?.message || err });
      return error(req, 'Failed to load resources', 500);
    }
  }

  const personalConnectionMatch = path.match(
    /^\/api\/users\/me\/resources\/connections\/(?!test$)([^/]+)$/
  );
  if (personalConnectionMatch) {
    const connectionId = personalConnectionMatch[1];

    if (req.method === 'PUT') {
      if (user.account_status && user.account_status !== 'active') {
        return error(req, 'Account pending approval.', 403);
      }
      let body;
      try {
        body = await req.json();
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      try {
        const db = createDB(env.DB);
        const updated = await updateUserOpenAIConnection({
          db,
          userId: user.sub,
          connectionId,
          input: body,
        });
        if (!updated) return error(req, 'Connection not found', 404);
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'user_connection_updated',
          resource_type: 'connection',
          resource_id: connectionId,
          metadata: { connection_id: connectionId },
        });
        return json(req, { connection: toPersonalConnectionSummary(updated) });
      } catch (err) {
        if (err instanceof ValidationError) {
          return error(req, err.message, 400);
        }
        return error(req, err?.message || 'Failed to update connection', 400);
      }
    }

    if (req.method === 'DELETE') {
      if (user.account_status && user.account_status !== 'active') {
        return error(req, 'Account pending approval.', 403);
      }
      try {
        const db = createDB(env.DB);
        const deleted = await deleteUserOpenAIConnection({
          db,
          userId: user.sub,
          connectionId,
        });
        if (!deleted) return error(req, 'Connection not found', 404);
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'user_connection_deleted',
          resource_type: 'connection',
          resource_id: connectionId,
          metadata: { connection_id: connectionId },
        });
        return json(req, { success: true });
      } catch (err) {
        return error(req, err?.message || 'Failed to delete connection', 400);
      }
    }

    return error(req, 'Method not allowed', 405);
  }

  if (req.method === 'POST' && path === '/api/users/me/resources/connections') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      const db = createDB(env.DB);
      const created = await createUserOpenAIConnection({
        db,
        userId: user.sub,
        input: body,
      });
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_connection_created',
        resource_type: 'connection',
        resource_id: created?.id || null,
        metadata: { connection_id: created?.id || null },
      });
      return json(req, { connection: toPersonalConnectionSummary(created) }, 201);
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      return error(req, err?.message || 'Failed to create connection', 400);
    }
  }

  if (req.method === 'POST' && path === '/api/users/me/resources/connections/test') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const connectionId = String(body.id || body.connection_id || '').trim();
    const db = createDB(env.DB);
    let existingConnection = null;
    if (connectionId) {
      existingConnection = await getUserOpenAIConnectionConfig(db, user.sub, connectionId);
    }

    const providerType =
      String(
        body.provider_type ||
          body.providerType ||
          existingConnection?.providerType ||
          'openai-compatible'
      )
        .trim()
        .toLowerCase() || 'openai-compatible';
    const baseUrlRaw = String(
      body.base_url || body.baseUrl || existingConnection?.baseUrl || ''
    ).trim();
    const baseUrl = baseUrlRaw || getConnectionDefaultBaseUrl(providerType);
    if (isConnectionUrlRequired(providerType) && !baseUrlRaw) {
      return error(req, 'Connection URL is required for compatible providers', 400);
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      return error(req, 'Connection URL must start with http:// or https://', 400);
    }
    const urlSafety = isSafeOutboundUrl(baseUrl);
    if (!urlSafety.safe) {
      return error(req, urlSafety.reason, 400);
    }

    let headers = {};
    try {
      if (typeof body.headers === 'string' && body.headers.trim()) {
        const parsed = JSON.parse(body.headers);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Headers must be a JSON object');
        }
        headers = parsed;
      } else if (body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)) {
        headers = body.headers;
      }
    } catch (err) {
      return error(req, err?.message || 'Headers must be valid JSON', 400);
    }

    const connection = {
      providerType,
      providerFamily: providerType,
      baseUrl,
      key: String(body.key || existingConnection?.key || '').trim(),
      headers: Object.keys(headers).length ? headers : existingConnection?.headers || {},
      authType: String(body.auth_type || body.authType || existingConnection?.authType || '')
        .trim()
        .toLowerCase(),
    };

    try {
      const discovery = await discoverConnectionModels(connection, {
        headers: buildConnectionHeaders(connection),
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
            const rawId = String(
              item?.id || item?.modelId || item?.model_id || item?.name || ''
            ).trim();
            const displayName = String(
              item?.displayName || item?.display_name || item?.name || rawId || ''
            ).trim();
            return {
              id: rawId.startsWith('models/') ? rawId.slice('models/'.length) : rawId,
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
