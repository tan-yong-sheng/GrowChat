import { handlePublicModelsCreate } from './models-public-crud-create.js';
import { handlePublicModelsDelete } from './models-public-crud-delete.js';
import { handlePublicModelsGet } from './models-public-crud-get.js';
import { handlePublicModelsUpdate } from './models-public-crud-update.js';

const SINGLE_MODEL_PATH_RE = /^\/api\/models\/[^/]+$/;

const ROUTE_MAP = [
  { method: 'POST', match: (p) => p === '/api/models', handler: handlePublicModelsCreate },
  { method: 'GET', match: (p) => SINGLE_MODEL_PATH_RE.test(p), handler: handlePublicModelsGet },
  { method: 'PUT', match: (p) => SINGLE_MODEL_PATH_RE.test(p), handler: handlePublicModelsUpdate },
  {
    method: 'DELETE',
    match: (p) => SINGLE_MODEL_PATH_RE.test(p),
    handler: handlePublicModelsDelete,
  },
];

/**
 * Handle public models CRUD routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handlePublicModelsCrud(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  for (const route of ROUTE_MAP) {
    if (route.method === req.method && route.match(path)) {
      return route.handler(req, env, ctx, user, path, { logger });
    }
  }
  return null;
}
