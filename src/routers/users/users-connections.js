import { error } from '../../utils/response.js';
import { accountPendingResponse, isAccountPending } from './users-connections.helpers.js';
import {
  createUserConnection,
  deleteUserConnection,
  listUserConnections,
  testUserConnection,
  updateUserConnection,
} from './users-connections.handlers.js';

const PERSONAL_CONNECTION_RE = /^\/api\/users\/me\/resources\/connections\/(?!test$)([^/]+)$/;

function matchPersonalConnection(path) {
  const m = path.match(PERSONAL_CONNECTION_RE);
  return m ? { connectionId: m[1] } : null;
}

const ROUTES = [
  {
    method: 'GET',
    match: (p) => (p === '/api/users/me/resources/connections' ? {} : null),
    handler: listUserConnections,
  },
  {
    method: 'POST',
    match: (p) => (p === '/api/users/me/resources/connections' ? {} : null),
    handler: createUserConnection,
  },
  {
    method: 'POST',
    match: (p) => (p === '/api/users/me/resources/connections/test' ? {} : null),
    handler: testUserConnection,
  },
  { method: 'PUT', match: matchPersonalConnection, handler: updateUserConnection },
  { method: 'DELETE', match: matchPersonalConnection, handler: deleteUserConnection },
];

function findRoute(method, path) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const params = route.match(path);
    if (params) return { route, params };
  }
  return null;
}

function isPersonalConnectionPath(path) {
  return PERSONAL_CONNECTION_RE.test(path);
}

/**
 * Handle users/connections routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersConnections(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  const matched = findRoute(req.method, path);
  if (!matched) {
    if (isPersonalConnectionPath(path)) {
      return error(req, 'Method not allowed', 405);
    }
    return null;
  }

  if (isAccountPending(user)) {
    return accountPendingResponse(req);
  }

  return matched.route.handler({ req, env, ctx, user, params: matched.params, logger });
}
