import { HTTP_STATUS } from '../../shared/http-status.js';
import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { loadCustomModels } from './models-discovery.js';
import {
  extractModelIdFromPath,
  missingCacheBinding,
  rejectIfBaseModel,
  requireModelAdmin,
} from './models-public-crud-helpers.js';

const ONE_YEAR_TTL = 31536000;
const CUSTOM_KEY = 'custom_models';

// eslint-disable-next-line max-params -- router dispatcher pattern
export async function handlePublicModelsDelete(req, env, _ctx, user, path, { logger }) {
  const modelId = extractModelIdFromPath(path);

  const authError = await requireModelAdmin(req, env, user, modelId);
  if (authError) return authError;

  try {
    const baseModelError = await rejectIfBaseModel(req, env, modelId, 'delete', logger);
    if (baseModelError) return baseModelError;

    if (!env.CACHE) {
      return missingCacheBinding(req);
    }

    const customModels = await loadCustomModels(env);
    const modelIndex = customModels.findIndex((m) => m.id === modelId);
    if (modelIndex === -1) {
      return error(req, 'Model not found', HTTP_STATUS.NOT_FOUND);
    }

    const deletedModel = customModels[modelIndex];
    customModels.splice(modelIndex, 1);

    await env.CACHE.put(CUSTOM_KEY, JSON.stringify(customModels), { expirationTtl: ONE_YEAR_TTL });

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'model_deleted',
      resource_type: 'model',
      resource_id: modelId,
      metadata: { provider: deletedModel.provider, name: deletedModel.name },
    });

    return json(req, { success: true, message: 'Model removed successfully' });
  } catch (err) {
    logger.error('Delete model failed', { error: err?.message || err });
    return error(req, 'Failed to remove model', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
