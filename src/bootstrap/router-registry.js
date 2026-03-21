import { authRouter } from '../routers/auth.js';
import { chatRouter } from '../routers/chat/index.js';
import { usersRouter } from '../routers/users.js';
import { faqsRouter } from '../routers/faqs.js';
import { filesRouter } from '../routers/files.js';
import { adminRouter } from '../routers/admin/index.js';
import { modelsRouter } from '../routers/models/index.js';
import { knowledgeRouter } from '../routers/knowledge.js';
import { promptsRouter } from '../routers/prompts.js';
import { rbacRouter } from '../routers/rbac.js';
import { publicRouter } from '../routers/public.js';
import { realtimeRouter } from '../routers/realtime.js';
import { foldersRouter } from '../routers/folders.js';

export const API_ROUTES = [
  publicRouter,
  authRouter,
  chatRouter,
  usersRouter,
  faqsRouter,
  filesRouter,
  knowledgeRouter,
  promptsRouter,
  adminRouter,
  modelsRouter,
  rbacRouter,
  realtimeRouter,
  foldersRouter,
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
