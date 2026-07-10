import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import {
  extractModelIdFromPath,
  findCustomModelById,
  invalidJsonBody,
  logModelAuditEvent,
  missingCacheBinding,
  parseJsonBody,
  rejectIfBaseModel,
  requireModelAdmin,
  writeCustomModelsToCache,
} from './models-public-crud-helpers.js';

function applyNameUpdate(model, body) {
  if (body.name !== undefined) {
    model.name = body.name;
  }
}

function applyDescriptionUpdate(model, body) {
  if (body.description !== undefined) {
    model.description = body.description;
  }
}

function applyBaseUrlUpdate(model, body) {
  if (body.base_url !== undefined) {
    if (!String(body.base_url).startsWith('http')) {
      throw Object.assign(new Error('base_url must start with http:// or https://'), {
        status: HTTP_STATUS.BAD_REQUEST,
      });
    }
    model.base_url = body.base_url;
  }
}

function applyMaxTokensUpdate(model, body) {
  if (body.max_tokens !== undefined) {
    const parsed = parseInt(body.max_tokens, 10);
    if (!Number.isNaN(parsed)) {
      model.max_tokens = parsed;
    }
  }
}

function applyTemperatureUpdate(model, body) {
  if (body.temperature !== undefined) {
    const parsed = parseFloat(body.temperature);
    if (!Number.isNaN(parsed)) {
      model.temperature = parsed;
    }
  }
}

function applyUpdates(model, body) {
  applyNameUpdate(model, body);
  applyDescriptionUpdate(model, body);
  applyBaseUrlUpdate(model, body);
  applyMaxTokensUpdate(model, body);
  applyTemperatureUpdate(model, body);
}

/* eslint-disable max-params, max-statements -- handler orchestrates multiple steps */
export async function handlePublicModelsUpdate(req, env, _ctx, user, path, { logger }) {
  const modelId = extractModelIdFromPath(path);

  const authError = await requireModelAdmin(req, env, user, modelId);
  if (authError) return authError;

  const body = await parseJsonBody(req);
  if (body === null) {
    return invalidJsonBody(req);
  }

  try {
    const baseModelError = await rejectIfBaseModel(req, env, modelId, 'update', logger);
    if (baseModelError) return baseModelError;

    if (!env.CACHE) {
      return missingCacheBinding(req);
    }

    const result = await findCustomModelById(req, env, modelId);
    if (!result.found) return result.error;

    const { customModels, modelIndex } = result;

    applyUpdates(customModels[modelIndex], body);

    await writeCustomModelsToCache(env, customModels);

    await logModelAuditEvent(env, user, 'model_updated', modelId, {
      fields_changed: Object.keys(body),
    });

    return json(req, {
      model: customModels[modelIndex],
      message: 'Model updated successfully',
    });
  } catch (err) {
    if (err.status) {
      return error(req, err.message, err.status);
    }
    logger.error('Update model failed', { error: err?.message || err });
    return error(req, 'Failed to update model', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
