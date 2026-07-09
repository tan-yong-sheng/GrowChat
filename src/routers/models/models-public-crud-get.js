import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { fetchBaseModelsFromOpenAI, loadCustomModels, toPublicModel } from './models-discovery.js';
import { extractModelIdFromPath } from './models-public-crud-helpers.js';

async function discoverBaseModels(env, logger) {
  try {
    const modelConnections = await getAllOpenAIConnectionConfigs(env);
    return await fetchBaseModelsFromOpenAI(env, modelConnections);
  } catch (err) {
    logger.warn('Failed to discover base models for GET /api/models/:id:', err?.message || err);
    return [];
  }
}

function findBaseModel(baseModels, modelId) {
  return baseModels.find((m) => m.id === modelId);
}

function findCustomModel(customModels, modelId) {
  return customModels.find((m) => m.id === modelId);
}

// eslint-disable-next-line max-params -- router dispatcher pattern
export async function handlePublicModelsGet(req, env, _ctx, _user, path, { logger }) {
  const modelId = extractModelIdFromPath(path);

  try {
    const baseModels = await discoverBaseModels(env, logger);
    if (baseModels.length > 0) {
      const baseModel = findBaseModel(baseModels, modelId);
      if (baseModel) {
        return json(req, { model: toPublicModel(baseModel) });
      }
    }

    const customModels = await loadCustomModels(env);
    const customModel = findCustomModel(customModels, modelId);
    if (customModel) {
      return json(req, { model: toPublicModel(customModel) });
    }

    return error(req, 'Model not found', HTTP_STATUS.NOT_FOUND);
  } catch (err) {
    logger.error('Get model failed', { error: err?.message || err });
    return error(req, 'Failed to fetch model', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
