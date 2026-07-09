import { HTTP_STATUS } from '../../shared/http-status.js';
import { error, json } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { fetchBaseModelsFromOpenAI } from './models-discovery.js';

const STATUS_CODE_MAP = {
  server_error: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  unauthorized: HTTP_STATUS.UNAUTHORIZED,
  not_found: HTTP_STATUS.NOT_FOUND,
};

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
