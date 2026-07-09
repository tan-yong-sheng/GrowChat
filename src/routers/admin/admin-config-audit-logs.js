/**
 * Admin Config - GET /api/admin/audit-logs
 * Fetches paginated audit log entries
 */
import { HTTP_STATUS } from '../../shared/http-status.js';
import { error, json } from '../../utils/response.js';
import { getAuditLog } from '../../utils/authorize.js';

/**
 * Handle GET /api/admin/audit-logs - Fetch audit log entries
 */
/* eslint-disable complexity -- Multiple audit log filters */
// eslint-disable-next-line max-params -- Cloudflare Worker handler
export async function handleAdminAuditLogs(req, env, _ctx, user, path, { db: _db, logger } = {}) {
  if (path !== '/api/admin/audit-logs') return null;

  try {
    const url = new URL(req.url);
    const actor_id = url.searchParams.get('userId') || undefined;
    const action = url.searchParams.get('action') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const result = await getAuditLog(env, {
      actor_id,
      action,
      limit,
      offset,
    });

    const mappedLogs = (result.entries || []).map((entry) => ({
      ...entry,
      user_id: entry.actor_id,
      user_email: null,
      details: entry.metadata,
    }));

    return json(req, {
      logs: mappedLogs,
      total: result.total || mappedLogs.length,
    });
  } catch (err) {
    logger.error('Audit logs fetch failed', { error: err?.message || err });
    return error(req, 'Failed to fetch audit logs', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
