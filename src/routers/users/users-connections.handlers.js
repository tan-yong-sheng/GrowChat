import { createDB } from '../../db.js';
import { ValidationError } from '../../errors/http-errors.js';
import {
  createUserOpenAIConnection,
  deleteUserOpenAIConnection,
  updateUserOpenAIConnection,
} from '../../llm/connections.js';
import {
  loadWorkspaceConnectionsPayload,
  toPersonalConnectionSummary,
} from '../../services/workspace-settings.js';
import { error, json } from '../../utils/response.js';
import { normalizeRole } from './users-helpers.js';
import {
  auditConnectionEvent,
  buildDiscoveryFailureResponse,
  buildDiscoverySuccessResponse,
  buildTestConnection,
  handleConnectionError,
  loadExistingConnectionForTest,
  parseConnectionHeaders,
  readJsonBody,
  resolveTestBaseUrl,
  resolveTestProviderType,
  runConnectionTest,
} from './users-connections.helpers.js';

export async function listUserConnections(req, env, user, _params, deps) {
  try {
    const db = createDB(env.DB);
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
    deps.logger.error('Load user connections failed', { error: err?.message || err });
    return error(req, 'Failed to load resources', 500);
  }
}

export async function createUserConnection(req, env, user, _params, deps) {
  try {
    const body = await readJsonBody(req);
    const db = createDB(env.DB);
    const created = await createUserOpenAIConnection({
      db,
      userId: user.sub,
      input: body,
    });
    await auditConnectionEvent(env, user, 'user_connection_created', created?.id);
    return json(req, { connection: toPersonalConnectionSummary(created) }, 201);
  } catch (err) {
    return handleConnectionError(err, req);
  }
}

export async function updateUserConnection(req, env, user, { connectionId }, deps) {
  try {
    const body = await readJsonBody(req);
    const db = createDB(env.DB);
    const updated = await updateUserOpenAIConnection({
      db,
      userId: user.sub,
      connectionId,
      input: body,
    });
    if (!updated) return error(req, 'Connection not found', 404);
    await auditConnectionEvent(env, user, 'user_connection_updated', connectionId);
    return json(req, { connection: toPersonalConnectionSummary(updated) });
  } catch (err) {
    return handleConnectionError(err, req);
  }
}

export async function deleteUserConnection(req, env, user, { connectionId }, deps) {
  try {
    const db = createDB(env.DB);
    const deleted = await deleteUserOpenAIConnection({
      db,
      userId: user.sub,
      connectionId,
    });
    if (!deleted) return error(req, 'Connection not found', 404);
    await auditConnectionEvent(env, user, 'user_connection_deleted', connectionId);
    return json(req, { success: true });
  } catch (err) {
    return handleConnectionError(err, req);
  }
}

export async function testUserConnection(req, env, user, _params, deps) {
  try {
    const body = await readJsonBody(req);
    const db = createDB(env.DB);
    const existingConnection = await loadExistingConnectionForTest(db, user.sub, body);

    const providerType = resolveTestProviderType(body, existingConnection);
    const baseUrlResult = resolveTestBaseUrl(body, existingConnection, providerType);
    if (baseUrlResult.error) {
      return error(req, baseUrlResult.error, 400);
    }

    const headers = parseConnectionHeaders(body, existingConnection);
    const connection = buildTestConnection(
      body,
      existingConnection,
      providerType,
      baseUrlResult.value,
      headers.value
    );

    const discovery = await runConnectionTest(connection);
    if (!discovery.items.length) {
      return buildDiscoveryFailureResponse(req, discovery, deps.logger);
    }
    return buildDiscoverySuccessResponse(req, discovery);
  } catch (err) {
    deps.logger.error('Connection test failed', { error: err?.message || err });
    if (err instanceof ValidationError) {
      return error(req, err.message, 400);
    }
    return error(req, 'Connection failed', 502, {
      message: err?.message || String(err),
    });
  }
}
