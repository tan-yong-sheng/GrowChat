import { verifyJWT } from './auth.js';
import { authRouter } from './routers/auth.js';
import { chatRouter } from './routers/chat.js';
import { usersRouter } from './routers/users.js';
import { faqsRouter } from './routers/faqs.js';
import { filesRouter } from './routers/files.js';
import { adminRouter } from './routers/admin.js';
import { modelsRouter } from './routers/models.js';
import { knowledgeRouter } from './routers/knowledge.js';
import { promptsRouter } from './routers/prompts.js';
import { rbacRouter } from './routers/rbac.js';
import { publicRouter } from './routers/public.js';
import { realtimeRouter } from './routers/realtime.js';
import { error, preflight } from './utils/response.js';
import { MessageQueueDO } from './durable/message-queue.js';

const API_ROUTES = [publicRouter, authRouter, chatRouter, usersRouter, faqsRouter, filesRouter, knowledgeRouter, promptsRouter, adminRouter, modelsRouter, rbacRouter, realtimeRouter];
let schemaCompatibilityReady = null;

/**
 * Public routes that don't require authentication.
 *
 * Format: { method: string, path: string|RegExp, description: string }
 *
 * These routes MUST NOT expose sensitive data or admin operations.
 * Regular auth-protected routes are handled by checking the user object after resolution.
 */
const PUBLIC_ROUTES = [
  // Model discovery - read-only, safe to expose
  { method: 'GET', path: '/api/models', description: 'List available models' },
  { method: 'GET', path: /^\/api\/models\/[^/]+$/, description: 'Get model by ID' },

  // Authentication - these endpoints are explicitly public
  { method: 'POST', path: '/api/auth/register', description: 'User registration' },
  { method: 'POST', path: '/api/auth/login', description: 'User login' },
  { method: 'POST', path: '/api/auth/refresh', description: 'Token refresh' },
  { method: 'POST', path: '/api/auth/logout', description: 'Logout' },

  // Public chat sharing - read-only shared chats
  { method: 'GET', path: /^\/s\/[^/]+$/, description: 'View shared chat' },
];

function getPath(req) {
  return new URL(req.url).pathname;
}

/**
 * Check if a route is public (doesn't require authentication).
 *
 * @param {Request} req - The HTTP request
 * @param {string} path - The request path
 * @returns {boolean} - True if the route is public
 */
function isPublicRoute(req, path) {
  const method = req.method.toUpperCase();
  for (const route of PUBLIC_ROUTES) {
    const pathMatches = route.path instanceof RegExp
      ? route.path.test(path)
      : route.path === path;

    if (method === route.method && pathMatches) {
      return true;
    }
  }
  return false;
}

function readBearer(req) {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

async function resolveAuthUser(req, env) {
  const token = readBearer(req);
  if (!token || !env.JWT_SECRET) return null;

  try {
    return await verifyJWT(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}

async function loadUserRole(env, userId) {
  if (!userId) return null;
  try {
    const row = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
    return row?.role || null;
  } catch {
    return null;
  }
}

function isDuplicateColumnError(err) {
  const message = String(err?.message || '');
  return /duplicate column name|already exists/i.test(message);
}

function requireBinding(req, env, name, value) {
  if (value) return null;
  return error(req, `${name} binding missing`, 500);
}

function validateRouteBindings(req, env, path) {
  // R2 upload endpoint requires FILES bucket.
  if (req.method === 'POST' && path === '/api/files/upload') {
    return requireBinding(req, env, 'FILES', env.FILES);
  }

  // FAQ semantic search requires embedding + vector indexes.
  if (req.method === 'GET' && path === '/api/faqs/search') {
    return requireBinding(req, env, 'AI', env.AI)
      || requireBinding(req, env, 'VECTORIZE', env.VECTORIZE);
  }

  // Reindex jobs require embedding + vector indexes.
  if (
    req.method === 'POST' &&
    (path === '/api/admin/faqs/reindex' || path === '/api/admin/documents/reindex')
  ) {
    return requireBinding(req, env, 'AI', env.AI)
      || requireBinding(req, env, 'VECTORIZE', env.VECTORIZE);
  }

  if (path === '/api/realtime/stream') {
    return requireBinding(req, env, 'MESSAGE_QUEUE', env.MESSAGE_QUEUE);
  }

  return null;
}

async function ensureSchemaCompatibility(env) {
  if (schemaCompatibilityReady) return schemaCompatibilityReady;

  schemaCompatibilityReady = (async () => {
    try {
      // Check for legacy Phase 1 schema: messages.citations column
      const info = await env.DB.prepare('PRAGMA table_info(messages)').all();
      const columns = info?.results || [];

      // If messages table does not exist yet, skip here and let specific routes
      // surface their own table errors.
      if (columns.length) {
        const hasCitations = columns.some((col) => col?.name === 'citations');
        if (!hasCitations) {
          await env.DB.prepare('ALTER TABLE messages ADD COLUMN citations TEXT').run();
        }
      }

      // Check for RBAC schema: verify roles table exists (Phase 2)
      // If missing, the RBAC migration (008_rbac_core.sql) has not been applied yet.
      // Warn but don't fail - allows graceful degradation on first deploy.
      try {
        const rolesCheck = await env.DB.prepare('SELECT COUNT(*) as count FROM roles').first();
        if (rolesCheck === undefined) {
          console.warn('RBAC schema not found: roles table missing. Run migrations/008_rbac_core.sql');
        }
      } catch (err) {
        // Table doesn't exist yet - this is expected on first deploy before migrations run
        if (/no such table/i.test(String(err?.message || ''))) {
          console.warn('RBAC schema initialization pending: Run migrations/008_rbac_core.sql');
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (!isDuplicateColumnError(err)) {
        console.warn('Schema compatibility check skipped:', String(err?.message || err));
      }
    }
  })();

  try {
    await schemaCompatibilityReady;
  } catch (err) {
    // Allow retry on later requests if this failed transiently.
    schemaCompatibilityReady = null;
    throw err;
  }

  return schemaCompatibilityReady;
}

export default {
  async fetch(req, env, ctx) {
    const path = getPath(req);
    const isPublicSharePath = /^\/s\/[^/]+$/.test(path);

    if (req.method === 'OPTIONS') {
      return preflight(req);
    }

    if (path.startsWith('/api/') || isPublicSharePath) {
      if (!env.DB) return error(req, 'DB binding missing', 500);
      if (!env.SESSIONS && path.startsWith('/api/')) return error(req, 'SESSIONS KV binding missing', 500);
      const bindingError = validateRouteBindings(req, env, path);
      if (bindingError) return bindingError;
      await ensureSchemaCompatibility(env);

      // Public routes don't require authentication
      let user = null;
      if (!isPublicRoute(req, path)) {
        user = await resolveAuthUser(req, env);
        // Enforce account deactivation server-side, even if caller still has a valid JWT.
        if (user?.sub) {
          const role = await loadUserRole(env, user.sub);
          if (!role || role === 'inactive') {
            return error(req, 'Account deactivated', 403);
          }
          user = { ...user, role };
        }
      }

      for (const route of API_ROUTES) {
        const response = await route(req, env, ctx, user, path);
        if (response) return response;
      }

      return error(req, 'Not found', 404);
    }

    return env.ASSETS.fetch(req);
  },
};

export { MessageQueueDO };
export class RealtimeHubDO extends MessageQueueDO {}
