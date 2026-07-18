import { HTTP_STATUS } from '../../shared/http-status.js';
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

// handler receives (req, env, user, _params, deps)
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
    return error(req, 'Failed to load resources', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// handler receives (req, env, user, _params, _deps)
export async function createUserConnection(req, env, user, _params, _deps) {
  try {
    const body = await readJsonBody(req);
    const db = createDB(env.DB);
    const created = await createUserOpenAIConnection({
      db,
      userId: user.sub,
      input: body,
    });
    await auditConnectionEvent(env, user, 'user_connection_created', created?.id);
    return json(req, { connection: toPersonalConnectionSummary(created) }, HTTP_STATUS.CREATED);
  } catch (err) {
    return handleConnectionError(err, req);
  }
}

// handler receives (req, env, user, { connectionId }, _deps)
export async function updateUserConnection(req, env, user, { connectionId }, _deps) {
  try {
    const body = await readJsonBody(req);
    const db = createDB(env.DB);
    const updated = await updateUserOpenAIConnection({
      db,
      userId: user.sub,
      connectionId,
      input: body,
    });
    if (!updated) return error(req, 'Connection not found', HTTP_STATUS.NOT_FOUND);
    await auditConnectionEvent(env, user, 'user_connection_updated', connectionId);
    return json(req, { connection: toPersonalConnectionSummary(updated) });
  } catch (err) {
    return handleConnectionError(err, req);
  }
}

// handler receives (req, env, user, { connectionId }, _deps)
export async function deleteUserConnection(req, env, user, { connectionId }, _deps) {
  try {
    const db = createDB(env.DB);
    const deleted = await deleteUserOpenAIConnection({
      db,
      userId: user.sub,
      connectionId,
    });
    if (!deleted) return error(req, 'Connection not found', HTTP_STATUS.NOT_FOUND);
    await auditConnectionEvent(env, user, 'user_connection_deleted', connectionId);
    return json(req, { success: true });
  } catch (err) {
    return handleConnectionError(err, req);
  }
}

// handler receives (req, env, user, _params, deps)
export async function testUserConnection(req, env, user, _params, deps) {
  try {
    const body = await readJsonBody(req);
    const db = createDB(env.DB);
    const existingConnection = await loadExistingConnectionForTest(db, user.sub, body);

    const providerType = resolveTestProviderType(body, existingConnection);
    const baseUrlResult = resolveTestBaseUrl(body, existingConnection, providerType);
    if (baseUrlResult.error) {
      return error(req, baseUrlResult.error, HTTP_STATUS.BAD_REQUEST);
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
      return error(req, err.message, HTTP_STATUS.BAD_REQUEST);
    }
    return error(req, 'Connection failed', HTTP_STATUS.BAD_GATEWAY, {
      message: err?.message || String(err),
    });
  }
}
