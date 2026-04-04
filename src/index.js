import { API_ROUTES, isPublicRoute } from './bootstrap/router-registry.js';
import {
  getPath,
  loadUserAccountStatus,
  loadPrimaryRole,
  resolveAuthUser,
  touchLastActive,
  validateRouteBindings,
} from './bootstrap/worker-context.js';
import { error, preflight } from './utils/response.js';
import { MessageQueueDO } from './durable/message-queue.js';

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

        // Public routes don't require authentication, but can still accept it for scoped data.
        let user = null;
        const isPublic = isPublicRoute(req, path);
        if (!isPublic || req.headers.get('Authorization')) {
          user = await resolveAuthUser(req, env);
          // Enforce account deactivation server-side, even if caller still has a valid JWT.
          if (user?.sub) {
            const primaryRole = await loadPrimaryRole(env, user.sub);
            const accountStatus = await loadUserAccountStatus(env, user.sub);
            if (!primaryRole || accountStatus !== 'active') {
              return error(req, 'Account deactivated', 403);
            }
            user = { ...user, primary_role: primaryRole, account_status: accountStatus };
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
        if (path === '/auth' || path === '/auth.html' || path.startsWith('/auth/')) {
          try {
            const authReq = new Request(new URL('/auth.html' + req.url.substring(req.url.indexOf('?')), req.url));
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

};

export { MessageQueueDO };
export class RealtimeHubDO extends MessageQueueDO {}
