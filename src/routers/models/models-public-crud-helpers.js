import { error, json } from '../../utils/response.js';
import { authorize } from '../../utils/authorize.js';

const STATUS_CODE_MAP = {
  server_error: 500,
  unauthorized: 401,
  not_found: 404,
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
  const statusCode = STATUS_CODE_MAP[authDecision.code] || 403;
  return error(req, authDecision.reason || 'Forbidden', statusCode);
}

export function extractModelIdFromPath(path) {
  return path.split('/').pop();
}

export function parseJsonBody(req) {
  return req.json().catch(() => null);
}

export function jsonCreated(req, data) {
  return json(req, data, 201);
}

export function invalidJsonBody(req) {
  return error(req, 'Invalid JSON body', 400);
}

export function invalidBaseUrl(req) {
  return error(req, 'base_url must start with http:// or https://', 400);
}

export function missingCacheBinding(req) {
  return error(
    req,
    'CACHE KV binding required to manage custom models. Please configure CACHE in wrangler.jsonc',
    500
  );
}
