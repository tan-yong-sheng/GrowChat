import { HTTP_STATUS } from '../../shared/http-status.js';
import { error, json } from '../../utils/response.js';
import {
  extractModelIdFromPath,
  findCustomModelById,
  logModelAuditEvent,
  missingCacheBinding,
  rejectIfBaseModel,
  requireModelAdmin,
  writeCustomModelsToCache,
} from './models-public-crud-helpers.js';

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

    const result = await findCustomModelById(req, env, modelId);
    if (!result.found) return result.error;

    const { customModels, modelIndex } = result;
    const deletedModel = customModels[modelIndex];
    customModels.splice(modelIndex, 1);

    await writeCustomModelsToCache(env, customModels);

    await logModelAuditEvent(env, user, 'model_deleted', modelId, {
      provider: deletedModel.provider,
      name: deletedModel.name,
    });

    return json(req, { success: true, message: 'Model removed successfully' });
  } catch (err) {
    logger.error('Delete model failed', { error: err?.message || err });
    return error(req, 'Failed to remove model', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
