import { HTTP_STATUS } from '../../shared/http-status.js';
import { error, json } from '../../utils/response.js';
import {
  extractModelIdFromPath,
  findAndValidateCustomModel,
  logModelAuditEvent,
  requireModelAdmin,
  writeCustomModelsToCache,
} from './models-public-crud-helpers.js';
export async function handlePublicModelsDelete({ req, env, ctx: _ctx, user, path, logger }) {
  const modelId = extractModelIdFromPath(path);

  const authError = await requireModelAdmin(req, env, user, modelId);
  if (authError) return authError;

  try {
    const result = await findAndValidateCustomModel({
      req,
      env,
      modelId,
      action: 'delete',
      logger,
    });
    if (!result.found) return result.error;

    const { customModels, modelIndex } = result;
    const deletedModel = customModels[modelIndex];
    customModels.splice(modelIndex, 1);

    await writeCustomModelsToCache(env, customModels);

    await logModelAuditEvent({
      env,
      user,
      action: 'model_deleted',
      modelId,
      extraFields: {
        provider: deletedModel.provider,
        name: deletedModel.name,
      },
    });

    return json(req, { success: true, message: 'Model removed successfully' });
  } catch (err) {
    logger.error('Delete model failed', { error: err?.message || err });
    return error(req, 'Failed to remove model', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
