import { verifyJWT } from './auth.js';
import { getJwtSecret } from './utils/jwt-secret.js';
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
import { foldersRouter } from './routers/folders.js';
import { error, preflight } from './utils/response.js';
import { MessageQueueDO } from './durable/message-queue.js';
import { runToolJob } from './tool-runner.js';

const API_ROUTES = [publicRouter, authRouter, chatRouter, usersRouter, faqsRouter, filesRouter, knowledgeRouter, promptsRouter, adminRouter, modelsRouter, rbacRouter, realtimeRouter, foldersRouter];
let schemaCompatibilityReady = null;
let schemaDiagnosticsLogged = false;
const REQUIRED_RBAC_TABLES = ['roles', 'permissions', 'role_permissions', 'user_roles', 'audit_log'];
const REQUIRED_CORE_TABLES = ['users', 'chats', 'messages', 'refresh_tokens'];
let coreSchemaDiagnosticsLogged = false;

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
  { method: 'GET', path: '/api/health', description: 'Health check' },

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
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }

  const url = new URL(req.url);
  if (url.pathname === '/api/realtime/stream') {
    const queryToken = url.searchParams.get('access_token');
    if (queryToken) return queryToken.trim();
  }

  return null;
}

async function resolveAuthUser(req, env) {
  const token = readBearer(req);
  const jwtSecret = getJwtSecret(env, req);
  if (!token || !jwtSecret) return null;

  try {
    return await verifyJWT(token, jwtSecret);
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

async function touchLastActive(env, userId) {
  if (!userId || !env?.DB) return;
  try {
    await env.DB.prepare('UPDATE users SET last_active_at = unixepoch() WHERE id = ?').bind(userId).run();
  } catch (err) {
    if (/no such column:\s*last_active_at/i.test(String(err?.message || ''))) {
      return;
    }
    console.warn('last_active_at update skipped:', String(err?.message || err));
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
      let info;
      try {
        info = await env.DB.prepare('PRAGMA table_info(messages)').all();
      } catch (err) {
        console.warn('Could not check messages table info:', String(err?.message || err));
        return;
      }
      const columns = info?.results || [];

      // If messages table does not exist yet, skip here and let specific routes
      // surface their own table errors.
      if (columns.length) {
        const hasCitations = columns.some((col) => col?.name === 'citations');
        if (!hasCitations) {
          try {
            await env.DB.prepare('ALTER TABLE messages ADD COLUMN citations TEXT').run();
          } catch (err) {
            if (!isDuplicateColumnError(err)) {
              console.warn('Could not add citations column:', String(err?.message || err));
            }
          }
        }
      }

      try {
        const userInfo = await env.DB.prepare('PRAGMA table_info(users)').all();
        const userColumns = userInfo?.results || [];
        if (userColumns.length) {
          const columnNames = new Set(userColumns.map((col) => col?.name).filter(Boolean));

          const columnsToAdd = [
            { name: 'last_active_at', type: 'INTEGER' },
            { name: 'avatar', type: 'TEXT' },
            { name: 'avatar_emoji', type: 'TEXT' },
            { name: 'status', sql: "TEXT DEFAULT 'offline'" },
            { name: 'preferences', sql: "TEXT DEFAULT '{}'" },
          ];

          for (const col of columnsToAdd) {
            if (!columnNames.has(col.name)) {
              try {
                const colDef = col.sql || col.type;
                await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${col.name} ${colDef}`).run();
              } catch (err) {
                if (!isDuplicateColumnError(err)) {
                  console.warn(`Could not add ${col.name} column:`, String(err?.message || err));
                }
              }
            }
          }

          // Update default values separately to avoid issues
          try {
            await env.DB.prepare('UPDATE users SET last_active_at = COALESCE(updated_at, created_at) WHERE last_active_at IS NULL').run();
          } catch (err) {
            // Ignore errors updating defaults
          }
          try {
            await env.DB.prepare("UPDATE users SET status = 'offline' WHERE status IS NULL").run();
          } catch (err) {
            // Ignore errors updating defaults
          }
          try {
            await env.DB.prepare("UPDATE users SET preferences = '{}' WHERE preferences IS NULL").run();
          } catch (err) {
            // Ignore errors updating defaults
          }
        }
      } catch (err) {
        console.warn('Could not check users table schema:', String(err?.message || err));
      }

      // RBAC schema diagnostics: log local DB details + missing tables once.
      try {
        const corePlaceholders = REQUIRED_CORE_TABLES.map(() => '?').join(', ');
        let coreRows;
        try {
          coreRows = await env.DB.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${corePlaceholders})`
          ).bind(...REQUIRED_CORE_TABLES).all();
        } catch (err) {
          console.warn('Could not query core tables:', String(err?.message || err));
          return;
        }

        const coreSet = new Set((coreRows?.results || []).map((row) => row.name));
        const missingCore = REQUIRED_CORE_TABLES.filter((name) => !coreSet.has(name));
        if (missingCore.length > 0 && !coreSchemaDiagnosticsLogged) {
          console.warn(
            `Core schema missing tables [${missingCore.join(', ')}]. ` +
            `Run: wrangler d1 execute growchat --local --file=./migrations/001_initial.sql`
          );
          coreSchemaDiagnosticsLogged = true;
        }

        const placeholders = REQUIRED_RBAC_TABLES.map(() => '?').join(', ');
        let existingRows;
        try {
          existingRows = await env.DB.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
          ).bind(...REQUIRED_RBAC_TABLES).all();
        } catch (err) {
          console.warn('Could not query RBAC tables:', String(err?.message || err));
          return;
        }

        const existingSet = new Set((existingRows?.results || []).map((row) => row.name));
        const missingTables = REQUIRED_RBAC_TABLES.filter((name) => !existingSet.has(name));

        if (missingTables.length > 0) {
          console.warn(
            `RBAC schema missing tables [${missingTables.join(', ')}]. ` +
            `Run: wrangler d1 execute growchat --local --file=./migrations/008_rbac_core.sql`
          );
        } else if (!schemaDiagnosticsLogged) {
          console.info('RBAC schema ready. Required tables present.');
        }
      } catch (err) {
        if (!/no such table|SQLITE_AUTH|not authorized/i.test(String(err?.message || ''))) {
          console.warn('Schema diagnostics failed:', String(err?.message || err));
        }
      }
      schemaDiagnosticsLogged = true;
    } catch (err) {
      console.warn('Schema compatibility check failed:', String(err?.message || err));
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

    try {
      if (req.method === 'OPTIONS') {
        return preflight(req);
      }

      if (path.startsWith('/api/') || isPublicSharePath) {
        if (!env.DB) return error(req, 'DB binding missing', 500);
        if (!env.SESSIONS && path.startsWith('/api/')) return error(req, 'SESSIONS KV binding missing', 500);
        const bindingError = validateRouteBindings(req, env, path);
        if (bindingError) return bindingError;

        // Don't block on schema compatibility check - run it in the background
        if (!schemaCompatibilityReady) {
          ctx.waitUntil(ensureSchemaCompatibility(env).catch(() => {}));
        }

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
            ctx.waitUntil(touchLastActive(env, user.sub));
          }
        }

        for (const route of API_ROUTES) {
          const response = await route(req, env, ctx, user, path);
          if (response) return response;
        }

        return error(req, 'Not found', 404);
      }

      if (!env.ASSETS) {
        return new Response('ASSETS binding missing. Use `npm run dev` for local UI or ensure assets are available in remote dev.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // Fetch assets - note: in remote dev mode, assets may be slow
      let response;
      try {
        response = await env.ASSETS.fetch(req);
      } catch (err) {
        console.error('Asset fetch failed:', String(err?.message || err));
        return new Response('Asset fetch failed', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }

      if (response.status === 404 && !path.startsWith('/api/')) {
        if (path === '/auth' || path === '/auth.html') {
          try {
            const authReq = new Request(new URL('/auth.html', req.url));
            const authRes = await env.ASSETS.fetch(authReq);
            if (authRes.status !== 404) return authRes;
          } catch (err) {
            console.error('Auth asset fetch failed:', String(err?.message || err));
          }
        }

        try {
          const indexReq = new Request(new URL('/index.html', req.url));
          return await env.ASSETS.fetch(indexReq);
        } catch (err) {
          console.error('Index asset fetch failed:', String(err?.message || err));
          return new Response('Asset fetch failed', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      }

      return response;
    } catch (err) {
      console.error('Unhandled worker error:', err);
      const message = err?.message || 'Unhandled worker error';
      if (path.startsWith('/api/') || isPublicSharePath) {
        return error(req, `worker_crash: ${message}`, 500);
      }
      return new Response(`Worker crash: ${message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  },

  async queue(batch, env, ctx) {
    if (!batch?.messages?.length) return;
    for (const message of batch.messages) {
      try {
        const payload = typeof message.body === 'string'
          ? JSON.parse(message.body)
          : message.body;
        await runToolJob(env, payload);
      } catch (err) {
        if (message.retry) {
          message.retry();
        } else {
          throw err;
        }
      }
    }
  },
};

export { MessageQueueDO };
export class RealtimeHubDO extends MessageQueueDO {}
