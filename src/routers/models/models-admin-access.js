import { handleAdminModelsAccessBulkUpdate } from './models-admin-access-bulk-update.js';
import { handleAdminModelsAccessByModel } from './models-admin-access-model.js';
import { handleAdminModelsAccessList } from './models-admin-access-list.js';

const SINGLE_MODEL_ACCESS_RE = /^\/api\/admin\/models\/([^/]+)\/access$/;

const ROUTE_MAP = [
  {
    methods: new Set(['GET']),
    match: (p) => p === '/api/admin/models/access',
    handler: handleAdminModelsAccessList,
  },
  {
    methods: new Set(['PUT']),
    match: (p) => p === '/api/admin/models/access',
    handler: handleAdminModelsAccessBulkUpdate,
  },
  {
    methods: null,
    match: (p) => SINGLE_MODEL_ACCESS_RE.test(p),
    handler: handleAdminModelsAccessByModel,
  },
];

/**
 * Handle admin models access routes.
 * Returns Response if handled, null if path doesn't match.
 */
function routeMatches(route, method, path) {
  if (!route.match(path)) return false;
  if (route.methods && !route.methods.has(method)) return false;
  return true;
}

/**
 * Handle admin models access routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminModelsAccess(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  for (const route of ROUTE_MAP) {
    if (routeMatches(route, req.method, path)) {
      return route.handler(req, env, ctx, user, path, { logger });
    }
  }
  return null;
}
