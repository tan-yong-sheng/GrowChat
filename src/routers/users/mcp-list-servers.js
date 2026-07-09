/**
 * Handle GET /api/users/me/resources/mcp-servers — list the user's MCP tool servers.
 * Extracted from handleUsersMcp (was ~20 lines, ~10 cyclomatic).
 */
import { HTTP_STATUS } from '../../shared/http-status.js';
import { createDB } from '../../db.js';
import { loadWorkspaceToolServersPayload } from '../../services/workspace-settings.js';
import { json, error } from '../../utils/response.js';

/**
 * @param {Request} req
 * @param {object} env
 * @param {string} userSub
 * @param {object} logger
 * @returns {Promise<Response>}
 */
export async function handleListMcpServers(req, env, userSub, logger) {
  const db = createDB(env.DB);
  try {
    const payload = await loadWorkspaceToolServersPayload({ db, userId: userSub });
    return json(req, payload);
  } catch (err) {
    logger.error('Load user MCP servers failed', { error: err?.message || err });
    return error(req, 'Failed to load MCP servers', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
