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
/* Multiple audit log filters */
// Cloudflare Worker handler
function parseAuditLogQuery(url) {
  return {
    actor_id: url.searchParams.get('userId') || undefined,
    action: url.searchParams.get('action') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '50', 10),
    offset: parseInt(url.searchParams.get('offset') || '0', 10),
  };
}

function mapAuditLogEntries(entries) {
  return (entries || []).map((entry) => ({
    ...entry,
    user_id: entry.actor_id,
    user_email: null,
    details: entry.metadata,
  }));
}

export async function handleAdminAuditLogs({
  req,
  env,
  ctx: _ctx,
  user: _user,
  path,
  db: _db,
  logger,
} = {}) {
  if (path !== '/api/admin/audit-logs') return null;

  try {
    const url = new URL(req.url);
    const query = parseAuditLogQuery(url);
    const result = await getAuditLog(env, query);
    const mappedLogs = mapAuditLogEntries(result.entries);

    return json(req, {
      logs: mappedLogs,
      total: result.total || mappedLogs.length,
    });
  } catch (err) {
    logger.error('Audit logs fetch failed', { error: err?.message || err });
    return error(req, 'Failed to fetch audit logs', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
