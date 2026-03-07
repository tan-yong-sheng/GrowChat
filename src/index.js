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
import { publicRouter } from './routers/public.js';
import { error, preflight } from './utils/response.js';

const API_ROUTES = [publicRouter, authRouter, chatRouter, usersRouter, faqsRouter, filesRouter, knowledgeRouter, promptsRouter, adminRouter, modelsRouter];
let schemaCompatibilityReady = null;

// Placeholder DO export to preserve compatibility with existing production
// Durable Object class references during transitional deployment.
export class MessageQueueDO {
  constructor(_state, _env) {}

  async fetch() {
    return new Response('MessageQueueDO is temporarily disabled', { status: 410 });
  }
}

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

async function hasColumn(env, tableName, columnName) {
  const info = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  const columns = info?.results || [];
  return columns.some((col) => col?.name === columnName);
}

async function ensureColumn(env, tableName, columnName, ddlType) {
  const exists = await hasColumn(env, tableName, columnName);
  if (exists) return;
  try {
    await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddlType}`).run();
  } catch (err) {
    if (!isDuplicateColumnError(err)) throw err;
  }
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

  return null;
}

async function ensureSchemaCompatibility(env) {
  if (schemaCompatibilityReady) return schemaCompatibilityReady;

  schemaCompatibilityReady = (async () => {
    // Legacy DB compatibility: some older Phase 1 databases may not have
    // messages.citations yet. Fresh installs already include it.
    // Never hard-fail auth/non-chat routes on this compatibility check.
    try {
      await ensureColumn(env, 'messages', 'citations', 'TEXT');
      await ensureColumn(env, 'messages', 'parent_id', 'TEXT');
      await ensureColumn(env, 'chats', 'current_message_id', 'TEXT');
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id)').run();
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
