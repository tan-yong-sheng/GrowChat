import { authRouter } from '../routers/auth.js';
import { chatRouter } from '../routers/chat/index.js';
import { usersRouter } from '../routers/users.js';
import { userSettingsRouter } from '../routers/user-settings.js';
import { filesRouter } from '../routers/files.js';
import { adminRouter } from '../routers/admin/index.js';
import { modelsRouter } from '../routers/models/index.js';
import { rbacRouter } from '../routers/rbac.js';
import { groupsRouter } from '../routers/groups.js';
import { publicRouter } from '../routers/public.js';
import { realtimeRouter } from '../routers/realtime.js';

export const API_ROUTES = [
  publicRouter,
  authRouter,
  chatRouter,
  userSettingsRouter,
  usersRouter,
  filesRouter,
  adminRouter,
  modelsRouter,
  groupsRouter,
  rbacRouter,
  realtimeRouter,
];

export const PUBLIC_ROUTES = [
  { method: 'GET', path: '/api/models', description: 'List available models' },
  { method: 'GET', path: /^\/api\/models\/[^/]+$/, description: 'Get model by ID' },
  { method: 'GET', path: '/api/health', description: 'Health check' },
  { method: 'POST', path: '/api/auth/register', description: 'User registration' },
  { method: 'POST', path: '/api/auth/login', description: 'User login' },
  { method: 'POST', path: '/api/auth/refresh', description: 'Token refresh' },
  { method: 'POST', path: '/api/auth/logout', description: 'Logout' },
  { method: 'GET', path: /^\/s\/[^/]+$/, description: 'View shared chat' },
  { method: 'GET', path: '/api/users/me/resources/mcp-servers/oauth/callback', description: 'User MCP server OAuth callback' },
];

export function isPublicRoute(req, path) {
  const method = req.method.toUpperCase();
  return PUBLIC_ROUTES.some((route) => {
    const pathMatches = route.path instanceof RegExp
      ? route.path.test(path)
      : route.path === path;
    return method === route.method && pathMatches;
  });
}
