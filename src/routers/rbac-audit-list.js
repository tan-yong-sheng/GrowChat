/**
 * RBAC - GET /api/admin/audit
 * Lists audit log entries (paginated)
 */
import { error, json } from '../utils/response.js';
import { getAuditLog } from '../utils/authorize.js';

export async function handleRbacAuditList(req, env, _ctx, user, path, { db, logger } = {}) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);
  const actorId = url.searchParams.get('actor_id') || '';
  const resourceType = url.searchParams.get('resource_type') || '';
  const action = url.searchParams.get('action') || '';

  try {
    const result = await getAuditLog(env, {
      actor_id: actorId && actorId.length <= 255 ? actorId : undefined,
      resource_type: resourceType && resourceType.length <= 100 ? resourceType : undefined,
      action: action && action.length <= 100 ? action : undefined,
      limit,
      offset,
    });

    return json(req, {
      audit_log: result.entries,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      filters: { actor_id: actorId, resource_type: resourceType, action },
    });
  } catch (err) {
    logger.error('Audit log query failed', { error: err?.message || err });
    return error(req, 'Failed to fetch audit log', 500);
  }
}
