/**
 * Groups Router - dispatcher
 * Routes requests to per-route handlers based on method + path
 */
import { error } from '../utils/response.js';
import { createDB } from '../db.js';
import { createLogger } from '../utils/logger.js';
import { authorize } from '../utils/authorize.js';
import { handleGroupsList } from './groups-list.js';
import { handleGroupsCreate } from './groups-create.js';
import { handleGroupsGet } from './groups-get.js';
import { handleGroupsUpdate } from './groups-update.js';
import { handleGroupsDelete } from './groups-delete.js';
import { handleGroupsAddUsers } from './groups-add-users.js';
import { handleGroupsRemoveUsers } from './groups-remove-users.js';

const EXACT_ROUTES = [
  { method: 'GET', path: '/api/admin/groups', handler: handleGroupsList },
  { method: 'POST', path: '/api/admin/groups', handler: handleGroupsCreate },
];

const PATTERN_ROUTES = [
  {
    methods: ['GET', 'PUT', 'DELETE'],
    pattern: /^\/api\/admin\/groups\/([^/]+)$/,
    handlers: {
      GET: handleGroupsGet,
      PUT: handleGroupsUpdate,
      DELETE: handleGroupsDelete,
    },
  },
  {
    methods: ['POST', 'DELETE'],
    pattern: /^\/api\/admin\/groups\/([^/]+)\/users$/,
    handlers: {
      POST: handleGroupsAddUsers,
      DELETE: handleGroupsRemoveUsers,
    },
  },
];

function mapAuthCodeToStatus(code) {
  const map = { server_error: 500, unauthorized: 401, not_found: 404 };
  return map[code] || 403;
}

function resolveExactRoute(method, path) {
  for (const route of EXACT_ROUTES) {
    if (route.method === method && route.path === path)
      return { handler: route.handler, groupId: null };
  }
  return null;
}

function resolvePatternRoute(method, path) {
  for (const route of PATTERN_ROUTES) {
    if (!route.methods.includes(method)) continue;
    const match = path.match(route.pattern);
    if (match) {
      const handler = route.handlers[method];
      if (handler) return { handler, groupId: match[1] };
    }
  }
  return null;
}

function resolveRoute(method, path) {
  return resolveExactRoute(method, path) || resolvePatternRoute(method, path);
}

export async function groupsRouter(req, env, _ctx, user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

  const requiredPermission = req.method === 'GET' ? 'admin.user.read' : 'admin.user.write';

  const authDecision = await authorize(env, user, {
    action: requiredPermission,
  });

  if (!authDecision.allow) {
    const statusCode = mapAuthCodeToStatus(authDecision.code);
    return error(req, authDecision.reason || 'Forbidden', statusCode);
  }

  const route = resolveRoute(req.method, path);
  if (!route) return null;

  const db = createDB(env.DB);
  const context = { db, logger };
  if (route.groupId) {
    return route.handler(req, env, _ctx, user, route.groupId, path, context);
  }
  return route.handler(req, env, _ctx, user, path, context);
}
