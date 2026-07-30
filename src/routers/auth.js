/**
 * Auth Router — Dispatcher
 *
 * Delegates to per-route handlers for authentication operations.
 */
import { createDB } from '../db.js';
import { error } from '../utils/response.js';
import { createLogger } from '../utils/logger.js';
import { createUserRepository } from '../repositories/user-repository.js';
import { getJwtSecret } from '../shared/jwt-secret.js';
import { handleRegister } from './auth-register.js';
import { handleForgotPassword, handleResetPassword } from './auth-password-reset.js';
import { handleChangePassword } from './auth-change-password.js';
import { handleLogin } from './auth/auth-login.js';
import { handleRefresh } from './auth/auth-refresh.js';
import { handleLogout } from './auth/auth-logout.js';
import { handleMe } from './auth/auth-me.js';
import { createAccessToken, ensureUserRoleBinding } from './auth/auth-helpers.js';

const ROUTE_MAP = [
  {
    method: 'POST',
    path: '/api/auth/register',
    handler: (c) =>
      handleRegister({
        req: c.req,
        env: c.env,
        db: c.db,
        users: c.users,
        jwtSecret: c.jwtSecret,
        logger: c.logger,
        sharedFns: c.sharedFns,
      }),
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    handler: (c) =>
      handleLogin({ req: c.req, env: c.env, db: c.db, users: c.users, jwtSecret: c.jwtSecret }),
  },
  {
    method: 'POST',
    path: '/api/auth/refresh',
    handler: (c) =>
      handleRefresh({ req: c.req, env: c.env, db: c.db, users: c.users, jwtSecret: c.jwtSecret }),
  },
  { method: 'POST', path: '/api/auth/logout', handler: (c) => handleLogout(c.req, c.env) },
  {
    method: 'POST',
    path: '/api/auth/forgot-password',
    handler: (c) =>
      handleForgotPassword({
        req: c.req,
        env: c.env,
        db: c.db,
        users: c.users,
        requestContext: c.requestContext,
      }),
  },
  {
    method: 'POST',
    path: '/api/auth/reset-password',
    handler: (c) => handleResetPassword({ req: c.req, env: c.env, db: c.db }),
  },
  {
    method: 'POST',
    path: '/api/auth/change-password',
    handler: (c) =>
      handleChangePassword({
        req: c.req,
        env: c.env,
        db: c.db,
        authUser: c.authUser,
        requestContext: c.requestContext,
      }),
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    handler: (c) =>
      handleMe({ req: c.req, env: c.env, db: c.db, users: c.users, authUser: c.authUser }),
  },
];

const AUTH_PATHS = ROUTE_MAP.map((route) => route.path);

function resolveRoute(method, path) {
  for (const route of ROUTE_MAP) {
    if (route.method === method && route.path === path) {
      return route.handler;
    }
  }
  return null;
}

// eslint-disable-next-line max-params -- dispatcher pattern, params passed through from router
export async function authRouter(req, env, _ctx, authUser, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const db = createDB(env.DB);
  const users = createUserRepository(db);

  let jwtSecret;
  try {
    jwtSecret = getJwtSecret(env, req);
  } catch (err) {
    return error(req, 'JWT configuration error', 500, {
      message: err?.message || 'JWT_SECRET configuration error',
    });
  }
  if (path.startsWith('/api/auth/') && !jwtSecret) {
    return error(req, 'JWT_SECRET is not configured', 500);
  }

  const sharedFns = { ensureUserRoleBinding, createAccessToken };
  const context = {
    req,
    env,
    db,
    users,
    jwtSecret,
    authUser,
    logger,
    requestContext,
    sharedFns,
  };

  const handler = resolveRoute(req.method, path);
  if (handler) return handler(context);

  if (AUTH_PATHS.includes(path)) {
    return error(req, 'Method not allowed', 405); // eslint-disable-line no-magic-numbers -- HTTP status code
  }

  return null;
}
