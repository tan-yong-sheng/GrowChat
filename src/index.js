import { validateOrigin } from './middleware/cors.js';
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
import { getSriHashes, injectSriHashes } from './utils/sri-hashes.js';
import { MessageQueueDO } from './durable/message-queue.js';
import { createLogger, reconfigureAllRootLoggers } from './utils/logger.js';
import { withMemoryCheck } from './utils/memory-monitor.js';

const QUIET_INCOMING_PATHS = new Set(['/.well-known/appspecific/com.chrome.devtools.json']);

const STATIC_ASSET_PATTERN = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i;
const PUBLIC_SHARE_PATTERN = /^\/s\/[^/]+$/;
const ASSET_PATHNAMES = new Set(['/', '/index.html', '/auth.html']);
const AUTH_PATH_PREFIX = '/auth/';
const PLAIN_TEXT = { 'Content-Type': 'text/plain' };
const ASSETS_MISSING_RESPONSE = () =>
  new Response(
    'ASSETS binding missing. Use `npm run dev` for local UI or ensure assets are available in remote dev.',
    { status: 503, headers: PLAIN_TEXT }
  );
const ASSET_FETCH_FAILED_RESPONSE = () =>
  new Response('Asset fetch failed', { status: 503, headers: PLAIN_TEXT });

/**
 * Generate a unique requestId per request using crypto.randomUUID().
 * Attached to both the logger context and error response bodies.
 */
function createRequestContext(env) {
  const requestId = crypto.randomUUID();
  const logger = createLogger(env, { requestId });
  return { requestId, logger };
}

async function injectSriIntoHtmlResponse(response, env, logger) {
  if (!response?.ok) return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;
  try {
    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('etag');
    if (!html.includes('data-sri-key')) {
      return new Response(html, { status: response.status, headers });
    }
    let injectedHtml;
    try {
      const hashes = await getSriHashes(env);
      injectedHtml = injectSriHashes(html, hashes);
    } catch (err) {
      logger.error('SRI injection error', { error: err?.message || err });
      injectedHtml = html;
    }
    return new Response(injectedHtml, {
      status: response.status,
      headers,
    });
  } catch (err) {
    logger.error('HTML read error', { error: err?.message || err });
    return response;
  }
}

async function fetchHtmlAsset(env, req, pathname, logger) {
  const url = new URL(req.url);
  url.pathname = pathname === '/index.html' ? '/' : pathname;
  const response = await env.ASSETS.fetch(new Request(url.toString(), req));
  return injectSriIntoHtmlResponse(response, env, logger);
}

/**
 * Serve the landing page for unauthenticated root-path requests.
 * Returns null if the request should fall through to the default handler.
 */
async function maybeServeLandingPage(req, env) {
  const logger = createLogger(env);
  const url = new URL(req.url);
  // Browsers never send Authorization headers on page navigations, and GrowChat
  // uses Bearer-token auth (no session cookies), so server-side auth detection
  // for / is impossible. Authenticated users are redirected client-side by
  // landing.js (via ?app=1 query parameter).
  if (url.pathname !== '/' || req.headers.get('Authorization') || url.searchParams.has('app')) {
    return null;
  }
  try {
    // Use /landing (not /landing.html) because the Assets binding
    // redirects /landing.html → /landing with a 307 pretty-URL redirect,
    // which would return an empty body instead of the landing page.
    const landingUrl = new URL(req.url);
    landingUrl.pathname = '/landing';
    const response = await env.ASSETS.fetch(new Request(landingUrl.toString(), req));
    if (response.ok) return await injectSriIntoHtmlResponse(response, env);
  } catch (err) {
    logger.error('Landing asset fetch failed', { error: err?.message || String(err) });
  }
  return null;
}

const isAuthPath = (path) =>
  path === '/auth' || path === '/auth.html' || path.startsWith(AUTH_PATH_PREFIX);
const isStaticAssetPath = (path) =>
  STATIC_ASSET_PATTERN.test(path) || ASSET_PATHNAMES.has(path) || path.startsWith(AUTH_PATH_PREFIX);

async function handleOptions(req) {
  if (req.method === 'OPTIONS') return preflight(req);
  return null;
}

async function resolveAuthenticatedUser(req, env, path, ctx, requestId) {
  const isPublic = isPublicRoute(req, path);
  if (isPublic && !req.headers.get('Authorization')) return null;
  const user = await resolveAuthUser(req, env);
  if (!user?.sub) return null;
  const primaryRole = await loadPrimaryRole(env, user.sub);
  const accountStatus = await loadUserAccountStatus(env, user.sub);
  if (!primaryRole || accountStatus !== 'active') {
    return { deactivated: true, requestId };
  }
  ctx.waitUntil(touchLastActive(env, user.sub));
  return {
    ...user,
    primary_role: primaryRole,
    account_status: accountStatus,
  };
}

async function handleApiRequest(req, env, ctx, path, requestId, logger) {
  // CORS origin validation (defense in depth)
  const corsReject = validateOrigin(req, env);
  if (corsReject) return corsReject;

  if (!env.DB) return error(req, 'DB binding missing', 500, { requestId });
  if (!env.SESSIONS && path.startsWith('/api/'))
    return error(req, 'SESSIONS KV binding missing', 500, { requestId });

  const bindingError = validateRouteBindings(req, env, path);
  if (bindingError) return bindingError;

  const authResult = await resolveAuthenticatedUser(req, env, path, ctx, requestId);
  if (authResult?.deactivated) {
    return error(req, 'Account deactivated', 403, { requestId });
  }
  const user = authResult;

  for (const route of API_ROUTES) {
    const response = await route(req, env, ctx, user, path, { requestId, logger });
    if (response) return response;
  }
  return error(req, 'Not found', 404, { requestId });
}

async function handleSpaFallback(req, env, path, logger) {
  if (isAuthPath(path)) {
    const authResponse = await tryFetchAuthAsset(env, req, logger);
    if (authResponse) return authResponse;
  }
  return tryFetchIndexAsset(env, req, logger);
}

async function tryFetchAuthAsset(env, req, logger) {
  try {
    const authResponse = await fetchHtmlAsset(env, req, '/auth.html', logger);
    if (authResponse.status !== 404) return authResponse;
  } catch (err) {
    logger.error('Auth asset fetch failed', { error: String(err?.message || err) });
  }
  return null;
}

async function tryFetchIndexAsset(env, req, logger) {
  try {
    return await fetchHtmlAsset(env, req, '/', logger);
  } catch (err) {
    logger.error('Index asset fetch failed', { error: String(err?.message || err) });
    return ASSET_FETCH_FAILED_RESPONSE();
  }
}

async function handleAssetRequest(req, env, path, logger) {
  if (!env.ASSETS) return ASSETS_MISSING_RESPONSE();

  // Landing page: serve landing.html for unauthenticated / (no auth header, no ?app override).
  const landingPage = await maybeServeLandingPage(req, env);
  if (landingPage) return landingPage;

  // Check if this looks like an SPA route (not a static asset)
  const isStaticAsset = isStaticAssetPath(path);

  let response;
  try {
    response = await env.ASSETS.fetch(req);
  } catch (err) {
    logger.error('Asset fetch failed', { error: String(err?.message || err) });
    return ASSET_FETCH_FAILED_RESPONSE();
  }
  response = await injectSriIntoHtmlResponse(response, env, logger);

  // If static asset request failed with 404/307, or if it's an SPA route, serve index.html
  if (!isStaticAsset && (response.status === 404 || response.status === 307)) {
    return await handleSpaFallback(req, env, path, logger);
  }
  return response;
}

async function handleWorkerError(req, path, err, requestId) {
  const isPublicSharePath = PUBLIC_SHARE_PATTERN.test(path);
  const message = err?.message || 'Unhandled worker error';
  if (path.startsWith('/api/') || isPublicSharePath) {
    // CORS origin validation (defense in depth)
    const corsReject = validateOrigin(req);
    if (corsReject) return corsReject;
    return error(req, `worker_crash: ${message}`, 500, { requestId });
  }
  return new Response(`Worker crash: ${message}`, {
    status: 500,
    headers: PLAIN_TEXT,
  });
}

async function handleRequest(req, env, ctx) {
  // Reconfigure module-level root loggers with env on the first request
  // so LOG_LEVEL from wrangler.jsonc takes effect globally.
  reconfigureAllRootLoggers(env);

  const path = getPath(req);
  const { requestId, logger } = createRequestContext(env);

  if (!QUIET_INCOMING_PATHS.has(path)) {
    logger.info('Incoming request', { path, method: req.method });
  }

  const isPublicSharePath = PUBLIC_SHARE_PATTERN.test(path);

  try {
    const optionsResponse = await handleOptions(req);
    if (optionsResponse) return optionsResponse;
    if (path.startsWith('/api/') || isPublicSharePath) {
      return await handleApiRequest(req, env, ctx, path, requestId, logger);
    }
    return await handleAssetRequest(req, env, path, logger);
  } catch (err) {
    logger.error('Unhandled worker error', { error: err?.message || err, stack: err?.stack });
    return await handleWorkerError(req, path, err, requestId);
  }
}

export default {
  async fetch(req, env, ctx) {
    return withMemoryCheck('fetch-handler', () => handleRequest(req, env, ctx));
  },
};

export { MessageQueueDO };

export class RealtimeHubDO extends MessageQueueDO {}
