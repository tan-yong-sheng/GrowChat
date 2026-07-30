/**
 * File Management Router — Dispatcher
 *
 * Delegates to per-route handlers for each file operation.
 * Routes:
 *   POST   /api/files/upload    — handleFileUpload
 *   GET    /api/files           — handleFileList
 *   GET    /api/files/:id       — handleFileGet
 *   DELETE /api/files/:id      — handleFileDelete
 *   GET    /api/files/search    — handleFileSearch
 *   GET    /api/files/:id/blob  — handleFileBlob
 *   GET    /api/files/:id/process/status — handleFileProcessStatus
 *   GET    /api/files/:id/content — handleFileContent
 *   GET    /api/files/health    — handleFilesHealth
 */
import { createLogger } from '../utils/logger.js';
import { error } from '../utils/response.js';
import { handleFilesHealth } from './files-health-handler.js';
import { handleFileUpload } from './files-upload-handler.js';
import { handleFileList } from './files-list-handler.js';
import { handleFileGet } from './files-get-handler.js';
import { handleFileDelete } from './files-delete-handler.js';
import { handleFileSearch } from './files-search-handler.js';
import { handleFileBlob } from './files-blob-handler.js';
import { handleFileProcessStatus } from './files-process-status-handler.js';
import { handleFileContent } from './files-content-handler.js';

const ROUTE_MAP = [
  { path: '/api/files/health', method: 'GET', handler: handleFilesHealth },
  { path: '/api/files/upload', method: 'POST', handler: handleFileUpload },
  { path: '/api/files', method: 'GET', handler: handleFileList },
  { path: '/api/files/search', method: 'GET', handler: handleFileSearch },
];

const PATTERN_MAP = [
  { pattern: /^\/api\/files\/([^/]+)\/blob$/, handler: handleFileBlob, matchIndex: 1 },
  {
    pattern: /^\/api\/files\/([^/]+)\/process\/status$/,
    handler: handleFileProcessStatus,
    matchIndex: 1,
  },
  { pattern: /^\/api\/files\/([^/]+)\/content$/, handler: handleFileContent, matchIndex: 1 },
  { pattern: /^\/api\/files\/([^/]+)$/, handler: handleFileGet, matchIndex: 1 },
];

export async function filesRouter(req, env, ctx, user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

  if (!user) return error(req, 'Unauthorized', 401);

  // Check exact path matches first (no params)
  for (const route of ROUTE_MAP) {
    if (req.method === route.method && path === route.path) {
      return route.handler({ req, env, ctx, user, requestContext });
    }
  }

  // Check delete by exact path — only match /api/files/:id (4 path segments)
  // Reject /api/files/search, /api/files/health etc. which are GET-only routes
  if (req.method === 'DELETE' && path.split('/').length === 4) {
    const fileId = path.split('/').pop();
    // Only proceed if the path is not handled by a non-DELETE route
    // (which would indicate a named path segment like 'search' or 'health')
    const isNonDeletePath = ROUTE_MAP.some((r) => r.method !== 'DELETE' && r.path === path);
    if (isNonDeletePath) {
      // This is a GET-only path — return 405
      return new Response(null, { status: 405 });
    }
    return handleFileDelete({ req, env, ctx, user, documentId: fileId, requestContext });
  }

  // Pattern-based routes (with :id param)
  for (const route of PATTERN_MAP) {
    const match = path.match(route.pattern);
    if (match && req.method === 'GET') {
      return route.handler({
        req,
        env,
        ctx,
        user,
        documentId: match[route.matchIndex],
        requestContext,
      });
    }
  }

  return null;
}
