/**
 * Public Models List Handler - GET /api/models
 */
// fallow-ignore-file code-duplication
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
  parseModelListSearchParams,
} from './models-helpers.js';
import {
  fetchBaseModelsFromOpenAI,
  loadModels,
  loadCustomModels,
  toPublicModel,
  splitModelScopeByUserVisibility,
  isOpenAIProvider,
  buildProviderStats,
  matchesModelQuery,
} from './models-discovery.js';
import {
  buildModelAclIndex,
  evaluateModelAclAccess,
  loadModelAclRules,
} from '../../utils/model-acl.js';

const TRUE_STRINGS = ['1', 'true', 'yes'];

function parseScopeParam(searchParams) {
  return String(searchParams.get('scope') || '')
    .trim()
    .toLowerCase();
}

function parseIncludeDisabledParam(searchParams) {
  return TRUE_STRINGS.includes(String(searchParams.get('include_disabled') || '').toLowerCase());
}

function parseRequestParams(req) {
  const url = new URL(req.url);
  return {
    ...parseModelListSearchParams(url.searchParams),
    scope: parseScopeParam(url.searchParams),
    includeDisabled: parseIncludeDisabledParam(url.searchParams),
  };
}

async function resolveDbAndOpenAI(env, logger) {
  if (!env.DB) return { db: null, openaiEnabled: true };
  try {
    const db = createDB(env.DB);
    const openaiEnabled = await getConfigBool(db, 'openai_enabled', true);
    return { db, openaiEnabled };
  } catch (err) {
    logger.warn('Failed to read openai_enabled config', { error: err.message });
    return { db: null, openaiEnabled: true };
  }
}

async function resolveEffectiveUserGroupIds(db, user, scope, logger) {
  if (!db || scope !== 'effective' || !user?.sub) return null;
  try {
    const rows = await db.all('SELECT group_id FROM group_members WHERE user_id = ?', [user.sub]);
    return new Set((Array.isArray(rows) ? rows : []).map((row) => row.group_id).filter(Boolean));
  } catch (err) {
    logger.warn('Failed to resolve effective user groups for model scoping', {
      error: err.message,
    });
    return null;
  }
}

function buildConnectionLoadOptions(user, effectiveUserGroupIds) {
  return {
    includeHiddenForUser: true,
    userId: user?.sub || '',
    userRole: user?.primary_role || 'member',
    userGroupIds: effectiveUserGroupIds ? Array.from(effectiveUserGroupIds) : undefined,
  };
}

function filterModelsByOpenAIEnabled(models, openaiEnabled) {
  if (openaiEnabled) return models;
  return models.filter((model) => !isOpenAIProvider(model));
}

function filterModelsByQuery(models, query) {
  if (!query) return models;
  return models.filter((model) => matchesModelQuery(model, query));
}

async function loadAndFilterModels(env, logger, user, openaiEnabled, effectiveUserGroupIds, query) {
  const { baseModels, customModels } = await loadModels(
    env,
    logger,
    buildConnectionLoadOptions(user, effectiveUserGroupIds)
  );
  let allModels = filterModelsByOpenAIEnabled([...baseModels, ...customModels], openaiEnabled);
  let publicModels = allModels.map(toPublicModel);
  publicModels = filterModelsByQuery(publicModels, query);
  return publicModels;
}

function evaluateModelsWithAcl(publicModels, ctx) {
  return publicModels.map((model) => {
    const access = evaluateModelAclAccess(model, {
      user: ctx.user,
      userGroupIds: ctx.userGroupIds,
      rules: ctx.aclIndex.get(model.id) || [],
    });
    return {
      ...model,
      access_label: access.access_label,
      access_variant: access.access_variant,
      allowed: access.allowed,
      enabled: model.enabled !== false,
    };
  });
}

function filterAccessibleModels(scopedModels, accessMap) {
  return scopedModels.filter(
    (model) => model.allowed === true && accessMap.get(model.id) !== false
  );
}

function collectDisabledModelIds(publicModels, accessMap) {
  return publicModels
    .filter((model) => accessMap.get(model.id) === false || model.enabled === false)
    .map((model) => model.id)
    .filter(Boolean);
}

function paginateModels(models, limit, offset) {
  if (limit <= 0) return models;
  return models.slice(offset, offset + limit);
}

function attachAttachmentCaps(models, attachmentCaps) {
  return models.map((model) => ({
    ...model,
    attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
  }));
}

function buildEffectiveEtag(limit, offset, total, visibleModels, hiddenModelIds) {
  const tagSource = `effective|${limit}|${offset}|${total}|${visibleModels.map((model) => model.id).join('|')}`;
  const visibilityTag = `|${Array.from(hiddenModelIds).join(',')}`;
  return createWeakEtag(`${tagSource}|${visibilityTag}`);
}

function buildPublicEtag(scope, limit, offset, total, paginatedModels, visibility) {
  const tagSource = `${scope === 'global' ? 'global' : 'public'}|${limit}|${offset}|${total}|${paginatedModels.map((model) => model.id).join('|')}`;
  const visibilityTag = `${visibility.disabled_model_ids.join(',')}|${visibility.hidden_model_ids.join(',')}`;
  return createWeakEtag(`${tagSource}|${visibilityTag}`);
}

async function buildEffectiveScopeResponse(ctx) {
  const { db, logger, user, limit, offset } = ctx;
  const [accessMap, userOverrides, aclRules] = await Promise.all([
    getModelAccessMap(db, logger),
    loadUserResourceOverrides(db, user.sub),
    loadModelAclRules(db),
  ]);
  const hiddenModelIds = new Set(userOverrides?.models?.hidden_ids || []);
  const userGroupIds = ctx.effectiveUserGroupIds || new Set();
  const aclIndex = buildModelAclIndex(aclRules);

  const scopedModels = filterAccessibleModels(
    evaluateModelsWithAcl(ctx.publicModels, { user, userGroupIds, aclIndex }),
    accessMap
  );
  const disabledModelIds = collectDisabledModelIds(ctx.publicModels, accessMap);
  const eligibleModels = scopedModels.filter((model) => model.enabled !== false);
  const scopedModelIds = new Set(eligibleModels.map((model) => model.id));
  const scopedVisibility = splitModelScopeByUserVisibility(eligibleModels, hiddenModelIds);
  const visibleModels = sortModelsByActiveThenName(scopedVisibility.visibleModels);
  const hiddenModels = sortModelsByActiveThenName(scopedVisibility.hiddenModels);
  const total = visibleModels.length;
  const activeTotal = countEnabledModels(visibleModels);

  const paginatedModels = paginateModels(visibleModels, limit, offset);
  const attachmentCaps = await loadModelAttachmentCaps(db);
  const visibleWithCaps = attachAttachmentCaps(paginatedModels, attachmentCaps);
  const hiddenWithCaps = attachAttachmentCaps(hiddenModels, attachmentCaps);
  const etag = buildEffectiveEtag(limit, offset, total, visibleWithCaps, hiddenModelIds);

  return jsonCached(
    ctx.req,
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
    { etag, cacheControl: 'private, no-store' }
  );
}

async function buildPublicScopeResponse(ctx) {
  const { db, logger, scope, limit, offset, publicModels } = ctx;
  let filteredModels = publicModels;
  let visibility = { disabled_model_ids: [], hidden_model_ids: [] };

  if (db) {
    const disabledSet = await getDisabledModelSet(db, logger);
    if (!ctx.includeDisabled && disabledSet.size > 0) {
      filteredModels = filteredModels.filter((model) => !disabledSet.has(model.id));
    }
    visibility = {
      disabled_model_ids: Array.from(disabledSet),
      hidden_model_ids: [],
    };
  }

  filteredModels = sortModelsByActiveThenName(filteredModels);
  const total = filteredModels.length;
  const activeTotal = countEnabledModels(filteredModels);
  let paginatedModels = paginateModels(filteredModels, limit, offset);

  if (db) {
    const attachmentCaps = await loadModelAttachmentCaps(db);
    paginatedModels = attachAttachmentCaps(paginatedModels, attachmentCaps);
  }

  const etag = buildPublicEtag(scope, limit, offset, total, paginatedModels, visibility);
  return jsonCached(
    ctx.req,
    {
      models: paginatedModels,
      total,
      active_total: activeTotal,
      limit,
      offset,
      visibility,
    },
    { etag, cacheControl: 'private, no-store' }
  );
}

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
  if (req.method !== 'GET' || path !== '/api/models') {
    return null;
  }

  try {
    const params = parseRequestParams(req);
    const { db, openaiEnabled } = await resolveDbAndOpenAI(env, logger);
    const effectiveUserGroupIds = await resolveEffectiveUserGroupIds(
      db,
      user,
      params.scope,
      logger
    );
    const publicModels = await loadAndFilterModels(
      env,
      logger,
      user,
      openaiEnabled,
      effectiveUserGroupIds,
      params.query
    );

    const ctx = { req, db, logger, user, ...params, publicModels, effectiveUserGroupIds };
    if (db && params.scope === 'effective' && user?.sub) {
      return buildEffectiveScopeResponse(ctx);
    }
    return buildPublicScopeResponse(ctx);
  } catch (err) {
    logger.error('Unexpected error listing models', { error: err?.message || err });
    return error(req, 'Failed to list models', 500);
  }
}
