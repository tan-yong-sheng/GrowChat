/**
 * Handle PUT/DELETE /api/users/me/resources/mcp-servers/:id — update or delete an MCP server.
 * Extracted from handleUsersMcp's personalMcpMatch block (was ~50 lines, ~25 cyclomatic).
 */
import { createDB } from '../../db.js';
import { updateUserToolServer, deleteUserToolServer } from '../../admin/tool-servers.js';
import { toPersonalToolServerSummary } from '../../services/workspace-settings.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { json, error } from '../../utils/response.js';

/**
 * @param {Request} req
 * @param {object} env
 * @param {string} userSub
 * @param {string} serverId
 * @returns {Promise<Response>}
 */
export async function handleUpdateMcpServer(req, env, userSub, serverId) {
  // Account status is already checked by the router's checkMcpAuth at the dispatcher level
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  const db = createDB(env.DB);
  try {
    const updated = await updateUserToolServer(db, userSub, serverId, body);
    if (!updated) return error(req, 'MCP server not found', 404);
    await logAuditEvent(env, {
      actor_id: userSub,
      action: 'user_tool_server_updated',
      resource_type: 'tool-server',
      resource_id: serverId,
      metadata: { server_id: serverId },
    });
    return json(req, { server: toPersonalToolServerSummary(updated) });
  } catch (err) {
    return error(req, err?.message || 'Failed to update MCP server', 400);
  }
}

/**
 * @param {Request} req
 * @param {object} env
 * @param {string} userSub
 * @param {string} serverId
 * @returns {Promise<Response>}
 */
export async function handleDeleteMcpServer(req, env, userSub, serverId) {
  // Account status is already checked by the router's checkMcpAuth at the dispatcher level
  const db = createDB(env.DB);
  try {
    const deleted = await deleteUserToolServer(db, userSub, serverId);
    if (!deleted) return error(req, 'MCP server not found', 404);
    await logAuditEvent(env, {
      actor_id: userSub,
      action: 'user_tool_server_deleted',
      resource_type: 'tool-server',
      resource_id: serverId,
      metadata: { server_id: serverId },
    });
    return json(req, { success: true });
  } catch (err) {
    return error(req, err?.message || 'Failed to delete MCP server', 400);
  }
}
