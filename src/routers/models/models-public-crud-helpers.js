import { HTTP_STATUS } from '../../shared/http-status.js';
import { error, json } from '../../utils/response.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { fetchBaseModelsFromOpenAI, loadCustomModels } from './models-discovery.js';

const STATUS_CODE_MAP = {
  server_error: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  unauthorized: HTTP_STATUS.UNAUTHORIZED,
  not_found: HTTP_STATUS.NOT_FOUND,
};

const ONE_YEAR_TTL = 31536000;
const CUSTOM_KEY = 'custom_models';

export async function requireModelAdmin(req, env, user, resourceId) {
  const authDecision = await authorize(env, user, {
    action: 'model.admin',
    resource: 'model',
    ...(resourceId ? { resourceId } : {}),
  });
  if (authDecision.allow) {
    return null;
  }
  const statusCode = STATUS_CODE_MAP[authDecision.code] || HTTP_STATUS.FORBIDDEN;
  return error(req, authDecision.reason || 'Forbidden', statusCode);
}

export function extractModelIdFromPath(path) {
  return path.split('/').pop();
}

export function parseJsonBody(req) {
  return req.json().catch(() => null);
}

export function jsonCreated(req, data) {
  return json(req, data, HTTP_STATUS.CREATED);
}

export function invalidJsonBody(req) {
  return error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST);
}

export function invalidBaseUrl(req) {
  return error(req, 'base_url must start with http:// or https://', HTTP_STATUS.BAD_REQUEST);
}

export function missingCacheBinding(req) {
  return error(
    req,
    'CACHE KV binding required to manage custom models. Please configure CACHE in wrangler.jsonc',
    HTTP_STATUS.INTERNAL_SERVER_ERROR
  );
}

/**
 * Reject the request if the modelId matches a base model.
 * Shared between update and delete flows — pass the action verb
 * (e.g. 'update', 'delete') to contextualize error and log messages.
 */
// eslint-disable-next-line max-params -- action+logger keeps shared helper parameterized
export async function rejectIfBaseModel(req, env, modelId, action, logger) {
  try {
    const modelConnections = await getAllOpenAIConnectionConfigs(env);
    const baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
    if (baseModels.find((m) => m.id === modelId)) {
      return error(req, `Cannot ${action} base model`, HTTP_STATUS.BAD_REQUEST);
    }
  } catch (err) {
    logger.warn(`Failed to check base models during ${action}`, { error: err?.message || err });
  }
  return null;
}

/**
 * Find a custom model by ID.
 * Returns { found: false, error: Response } on 404, or
 * { found: true, customModels, modelIndex } on match.
 * Used by both update and delete CRUD handlers.
 */
export async function findCustomModelById(req, env, modelId) {
  const customModels = await loadCustomModels(env);
  const modelIndex = customModels.findIndex((m) => m.id === modelId);
  if (modelIndex === -1) {
    return { found: false, error: error(req, 'Model not found', HTTP_STATUS.NOT_FOUND) };
  }
  return { found: true, customModels, modelIndex };
}

/**
 * Write the updated custom models list to cache.
 * Shared by all CRUD handlers that modify custom models.
 */
export async function writeCustomModelsToCache(env, customModels) {
  await env.CACHE.put(CUSTOM_KEY, JSON.stringify(customModels), { expirationTtl: ONE_YEAR_TTL });
}

/**
 * Log an audit event for a model change.
 * action: 'model_created', 'model_updated', 'model_deleted', etc.
 * extraFields: object with additional properties merged into the audit event.
 */
// eslint-disable-next-line max-params -- audit helper needs all params
export async function logModelAuditEvent(env, user, action, modelId, extraFields) {
  await logAuditEvent(env, {
    actor_id: user.sub,
    action,
    resource_type: 'model',
    resource_id: modelId,
    ...(extraFields || {}),
  });
}
