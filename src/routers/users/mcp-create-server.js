/**
 * Handle POST /api/users/me/resources/mcp-servers — create an MCP tool server.
 * Extracted from handleUsersMcp (was ~25 lines, ~15 cyclomatic).
 */
import { createDB } from '../../db.js';
import { createUserToolServer } from '../../admin/tool-servers.js';
import { toPersonalToolServerSummary } from '../../services/workspace-settings.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { json, error } from '../../utils/response.js';

/**
 * @param {Request} req
 * @param {object} env
 * @param {string} userSub
 * @returns {Promise<Response>}
 */
export async function handleCreateMcpServer(req, env, userSub) {
  const db = createDB(env.DB);
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  try {
    const created = await createUserToolServer(db, userSub, body);
    await logAuditEvent(env, {
      actor_id: userSub,
      action: 'user_tool_server_created',
      resource_type: 'tool-server',
      resource_id: created?.id || null,
      metadata: { server_id: created?.id || null },
    });
    return json(req, { server: toPersonalToolServerSummary(created) }, 201);
  } catch (err) {
    return error(req, err?.message || 'Failed to create MCP server', 400);
  }
}
