/**
 * Public Models List Handler - GET /api/models
 */
import { jsonCached, createWeakEtag, error } from '../../utils/response.js';
import { createDB } from '../../db.js';
import { getConfigBool } from '../../utils/app-config.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../../llm/model-state.js';
import { loadUserResourceOverrides } from '../../../public/js/shared/utils/user-resource-overrides.js';
import {
  getDisabledModelSet,
  getModelAccessMap,
  loadModelAttachmentCaps,
  getModelAttachmentCapsEntry,
} from './models-helpers.js';
import {
  fetchBaseModelsFromOpenAI,
  loadCustomModels,
  toPublicModel,
  splitModelScopeByUserVisibility,
  isOpenAIProvider,
  buildProviderStats,
} from './models-discovery.js';
import {
  buildModelAclIndex,
  evaluateModelAclAccess,
  loadModelAclRules,
} from '../../utils/model-acl.js';

/**
 * Handle handlePublicModelsList routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handlePublicModelsList(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/models') {
    // No auth required - everyone should see available models
    // Gracefully degrade: return what we can, don't fail entirely on optional binding issues
    try {
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get('limit') || '0', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const rawQuery = url.searchParams.get('q') || '';
      const query = String(rawQuery).trim().toLowerCase();
      const scope = String(url.searchParams.get('scope') || '')
        .trim()
        .toLowerCase();
      const includeDisabled = ['1', 'true', 'yes'].includes(
        String(url.searchParams.get('include_disabled') || '').toLowerCase()
      );

      let customModels = [];
      let baseModels = [];
      let openaiEnabled = true;
      let db = null;
      let modelConnections = [];
      let effectiveUserGroupIds = null;

      if (env.DB) {
        try {
          db = createDB(env.DB);
          openaiEnabled = await getConfigBool(db, 'openai_enabled', true);
        } catch (err) {
          logger.warn('Failed to read openai_enabled config', { error: err.message });
        }
      }

      // Load base models from OpenAI-compatible env configuration.
      // If this fails, log but continue with baseModels = []
      try {
        if (db && scope === 'effective' && user?.sub) {
          const userGroupRows = await db.all(
            'SELECT group_id FROM group_members WHERE user_id = ?',
            [user.sub]
          );
          effectiveUserGroupIds = new Set(
            (Array.isArray(userGroupRows) ? userGroupRows : [])
              .map((row) => row.group_id)
              .filter(Boolean)
          );
        }
        const connectionLoadOptions = {
          includeHiddenForUser: true,
          userId: user?.sub || '',
          userRole: user?.primary_role || 'member',
          userGroupIds: effectiveUserGroupIds ? Array.from(effectiveUserGroupIds) : undefined,
        };
        modelConnections = await getAllOpenAIConnectionConfigs(env, {
          ...connectionLoadOptions,
        });
        baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
      } catch (err) {
        logger.warn('Failed to fetch base models from OpenAI-compatible sources', {
          error: err.message,
        });
      }

      // Load custom models. This may fail if KV or D1 is unavailable.
      // If this fails, log but continue with customModels = []
      try {
        customModels = await loadCustomModels(env);
      } catch (err) {
        logger.warn('Failed to load custom models', { error: err.message });
      }

      let allModels = [...baseModels, ...customModels];
      if (!openaiEnabled) {
        allModels = allModels.filter((model) => !isOpenAIProvider(model));
      }
      let publicModels = allModels.map(toPublicModel);
      let visibility = {
        disabled_model_ids: [],
        hidden_model_ids: [],
      };
      if (query) {
        publicModels = publicModels.filter((model) => {
          const name = String(model?.name || '').toLowerCase();
          const id = String(model?.id || '').toLowerCase();
          const connection = String(model?.connection_name || '').toLowerCase();
          const provider = String(model?.provider || '').toLowerCase();
          return (
            name.includes(query) ||
            id.includes(query) ||
            connection.includes(query) ||
            provider.includes(query)
          );
        });
      }
      if (db) {
        if (scope === 'effective' && user?.sub) {
          const [accessMap, userOverrides, aclRules] = await Promise.all([
            getModelAccessMap(db, logger),
            loadUserResourceOverrides(db, user.sub),
            loadModelAclRules(db),
          ]);
          const hiddenModelIds = new Set(userOverrides?.models?.hidden_ids || []);
          const userGroupIds = effectiveUserGroupIds || new Set();
          const aclIndex = buildModelAclIndex(aclRules);

          const scopedModels = publicModels
            .map((model) => {
              const access = evaluateModelAclAccess(model, {
                user,
                userGroupIds,
                rules: aclIndex.get(model.id) || [],
              });
              return {
                ...model,
                access_label: access.access_label,
                access_variant: access.access_variant,
                allowed: access.allowed,
                enabled: model.enabled !== false,
              };
            })
            .filter((model) => model.allowed === true && accessMap.get(model.id) !== false);
          const disabledModelIds = publicModels
            .filter((model) => accessMap.get(model.id) === false || model.enabled === false)
            .map((model) => model.id)
            .filter(Boolean);
          const eligibleModels = scopedModels.filter((model) => model.enabled !== false);
          const scopedModelIds = new Set(eligibleModels.map((model) => model.id));
          const scopedVisibility = splitModelScopeByUserVisibility(eligibleModels, hiddenModelIds);
          const visibleModels = sortModelsByActiveThenName(scopedVisibility.visibleModels);
          const hiddenModels = sortModelsByActiveThenName(scopedVisibility.hiddenModels);
          const total = visibleModels.length;
          const activeTotal = countEnabledModels(visibleModels);

          let paginatedModels = visibleModels;
          if (limit > 0) {
            paginatedModels = visibleModels.slice(offset, offset + limit);
          }
          const attachmentCaps = await loadModelAttachmentCaps(db);
          const visibleWithCaps = paginatedModels.map((model) => ({
            ...model,
            attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
          }));
          const hiddenWithCaps = hiddenModels.map((model) => ({
            ...model,
            attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
          }));
          const tagSource = `effective|${limit}|${offset}|${total}|${visibleWithCaps.map((model) => model.id).join('|')}`;
          const visibilityTag = `|${Array.from(hiddenModelIds).join(',')}`;
          const etag = createWeakEtag(`${tagSource}|${visibilityTag}`);

          return jsonCached(
            req,
            {
              models: visibleWithCaps,
              hidden_models: hiddenWithCaps,
              total,
              active_total: activeTotal,
              limit,
              offset,
              providers: buildProviderStats(visibleModels),
              visibility: {
                disabled_model_ids: disabledModelIds,
                hidden_model_ids: Array.from(hiddenModelIds).filter((modelId) =>
                  scopedModelIds.has(modelId)
                ),
              },
            },
            {
              etag,
              cacheControl: 'private, no-store',
            }
          );
        }

        const disabledSet = await getDisabledModelSet(db, logger);
        if (!includeDisabled && disabledSet.size > 0) {
          publicModels = publicModels.filter((model) => !disabledSet.has(model.id));
        }
        visibility = {
          disabled_model_ids: Array.from(disabledSet),
          hidden_model_ids: [],
        };
      }
      publicModels = sortModelsByActiveThenName(publicModels);
      const total = publicModels.length;
      const activeTotal = countEnabledModels(publicModels);

      let paginatedModels = publicModels;
      if (limit > 0) {
        paginatedModels = publicModels.slice(offset, offset + limit);
      }
      if (db) {
        const attachmentCaps = await loadModelAttachmentCaps(db);
        paginatedModels = paginatedModels.map((model) => ({
          ...model,
          attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
        }));
      }

      const tagSource = `${scope === 'global' ? 'global' : 'public'}|${limit}|${offset}|${total}|${paginatedModels.map((model) => model.id).join('|')}`;
      const visibilityTag = `${visibility.disabled_model_ids.join(',')}|${visibility.hidden_model_ids.join(',')}`;
      const etag = createWeakEtag(`${tagSource}|${visibilityTag}`);

      return jsonCached(
        req,
        {
          models: paginatedModels,
          total: total,
          active_total: activeTotal,
          limit: limit,
          offset: offset,
          visibility,
        },
        {
          etag,
          cacheControl: 'private, no-store',
        }
      );
    } catch (err) {
      logger.error('Unexpected error listing models', { error: err?.message || err });
      return error(req, 'Failed to list models', 500);
    }
  }

  return null;
}
