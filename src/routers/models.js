/**
 * Model Configuration Router
 *
 * Handles LLM model management and custom endpoint configuration.
 * Model configuration endpoints require admin authorization.
 *
 * Route handlers are extracted into domain-specific sub-modules:
 *   - models-public-list.js     → GET /api/models
 *   - models-public-crud.js     → POST/GET/PUT/DELETE /api/models/:id
 *   - models-admin-access.js    → /api/admin/models/access/*
 *   - models-admin-settings.js  → GET/PUT /api/admin/models
 *   - models-helpers.js         → shared utility functions
 */
import { createDB } from '../db.js';
import { createLogger } from '../utils/logger.js';

import { handlePublicModelsList } from './models/models-public-list.js';
import { handlePublicModelsCrud } from './models/models-public-crud.js';
import { handleAdminModelsAccess } from './models/models-admin-access.js';
import { handleAdminModelsSettings } from './models/models-admin-settings.js';

export { applyUserModelVisibilityOverrides } from './models/models-discovery.js';

/**
 * Models Router Handler
 */
// eslint-disable-next-line max-params -- router dispatcher pattern needs (req, env, ctx, user, path, deps)
export async function modelsRouter(req, env, ctx, user, path, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });
  const db = createDB(env.DB);
  const deps = { db, logger, requestContext };

  // Delegate to domain-specific sub-handlers.
  const handlers = [
    () => handlePublicModelsList(req, env, ctx, user, path, deps),
    () => handlePublicModelsCrud(req, env, ctx, user, path, deps),
    () => handleAdminModelsAccess(req, env, ctx, user, path, deps),
    () => handleAdminModelsSettings(req, env, ctx, user, path, deps),
  ];

  for (const handler of handlers) {
    const result = await handler();
    if (result !== null) return result;
  }

  return null;
}
