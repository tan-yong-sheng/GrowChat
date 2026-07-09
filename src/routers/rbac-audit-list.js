/**
 * RBAC - GET /api/admin/audit
 * Lists audit log entries (paginated)
 */
import { error, json } from '../utils/response.js';
import { getAuditLog } from '../utils/authorize.js';
import { HTTP_STATUS } from '../shared/http-status.js';

const MAX_LIMIT = 500;
const MAX_FILTER_LENGTH = 255;
const MAX_RESOURCE_FILTER_LENGTH = 100;

function parseAuditQueryParams(req) {
  const url = new URL(req.url);
  return {
    limit: Math.min(parseInt(url.searchParams.get('limit') || '50'), MAX_LIMIT),
    offset: Math.max(parseInt(url.searchParams.get('offset') || '0'), 0),
    actorId: url.searchParams.get('actor_id') || '',
    resourceType: url.searchParams.get('resource_type') || '',
    action: url.searchParams.get('action') || '',
  };
}

function buildAuditFilters(actorId, resourceType, action) {
  return {
    actor_id: actorId && actorId.length <= MAX_FILTER_LENGTH ? actorId : undefined,
    resource_type:
      resourceType && resourceType.length <= MAX_RESOURCE_FILTER_LENGTH ? resourceType : undefined,
    action: action && action.length <= MAX_RESOURCE_FILTER_LENGTH ? action : undefined,
  };
}

// eslint-disable-next-line max-params -- admin dispatcher pattern (req, env, ctx, user, path, deps)
export async function handleRbacAuditList(req, env, _ctx, user, path, { db: _db, logger } = {}) {
  const { limit, offset, actorId, resourceType, action } = parseAuditQueryParams(req);

  try {
    const result = await getAuditLog(env, {
      ...buildAuditFilters(actorId, resourceType, action),
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
    return error(req, 'Failed to fetch audit log', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
