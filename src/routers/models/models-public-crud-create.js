import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { loadCustomModels } from './models-discovery.js';
import {
  invalidBaseUrl,
  invalidJsonBody,
  jsonCreated,
  missingCacheBinding,
  requireModelAdmin,
} from './models-public-crud-helpers.js';

const VALID_PROVIDERS = new Set([
  'openai',
  'custom',
  'openai-compatible',
  'google',
  'gemini-compatible',
  'anthropic',
  'claude-compatible',
]);

const ONE_YEAR_TTL = 31536000;
const CUSTOM_KEY = 'custom_models';

function validateCreateBody(body) {
  if (!body?.id || !body.name || !body.provider || !body.base_url) {
    return { valid: false, error: 'id, name, provider, and base_url are required' };
  }
  if (!VALID_PROVIDERS.has(body.provider)) {
    return {
      valid: false,
      error:
        'Provider must be one of: openai, custom, openai-compatible, google, gemini-compatible, anthropic, claude-compatible',
    };
  }
  if (!String(body.base_url).startsWith('http')) {
    return { valid: false, error: 'base_url must start with http:// or https://' };
  }
  return { valid: true };
}

function findDuplicate(customModels, body) {
  if (customModels.some((m) => m.id === body.id)) {
    return 'Model with this ID already exists';
  }
  if (customModels.some((m) => m.name === body.name)) {
    return 'Model name already exists';
  }
  return null;
}

function buildNewModel(body) {
  return {
    id: body.id,
    name: body.name,
    provider: body.provider,
    base_url: body.base_url,
    description: body.description || `${body.name} - ${body.provider}`,
    max_tokens: body.max_tokens || 4096,
    temperature: body.temperature || 0.7,
    created_at: Math.floor(Date.now() / 1000),
  };
}

export async function handlePublicModelsCreate(req, env, _ctx, user, _path, { logger }) {
  const authError = await requireModelAdmin(req, env, user);
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  if (body === null) {
    return invalidJsonBody(req);
  }

  const validation = validateCreateBody(body);
  if (!validation.valid) {
    return error(req, validation.error, 400);
  }

  if (!env.CACHE) {
    return missingCacheBinding(req);
  }

  try {
    const customModels = await loadCustomModels(env);
    const duplicateError = findDuplicate(customModels, body);
    if (duplicateError) {
      return error(req, duplicateError, 409);
    }

    const newModel = buildNewModel(body);
    customModels.push(newModel);

    await env.CACHE.put(CUSTOM_KEY, JSON.stringify(customModels), { expirationTtl: ONE_YEAR_TTL });

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'model_created',
      resource_type: 'model',
      resource_id: body.id,
      metadata: { provider: body.provider, name: body.name },
    });

    return jsonCreated(req, {
      model: newModel,
      message: 'Model configured successfully',
    });
  } catch (err) {
    logger.error('Add custom model failed', { error: err?.message || err });
    return error(req, 'Failed to add custom model', 500);
  }
}
