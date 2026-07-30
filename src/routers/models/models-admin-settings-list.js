import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { createDB } from '../../db.js';
import { getConfigBool } from '../../utils/app-config.js';

import { countEnabledModels, sortModelsByActiveThenName } from '../../llm/model-state.js';
import {
  getModelAccessMap,
  loadModelAttachmentCaps,
  getModelAttachmentCapsEntry,
  parseModelListSearchParams,
} from './models-helpers.js';
import {
  loadModels,
  toPublicModel,
  isOpenAIProvider,
  buildProviderStats,
  getProviderKey,
  matchesModelQuery,
} from './models-discovery.js';
import { requireModelAdmin } from './models-admin-settings-helpers.js';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes']);

function parseListParams(req) {
  const url = new URL(req.url);
  const { limit, offset, query } = parseModelListSearchParams(url.searchParams);
  const includeDisabled = TRUTHY_VALUES.has(
    String(url.searchParams.get('include_disabled') || '').toLowerCase()
  );
  const providerParam = String(url.searchParams.get('provider') || '')
    .trim()
    .toLowerCase();
  const providerFilter = providerParam && providerParam !== 'all' ? providerParam : '';
  return { limit, offset, query, includeDisabled, providerFilter };
}

function applyFilters(models, query, providerFilter) {
  let filtered = models;
  if (query) {
    filtered = filtered.filter((model) => matchesModelQuery(model, query));
  }
  if (providerFilter) {
    filtered = filtered.filter((model) => getProviderKey(model) === providerFilter);
  }
  return filtered;
}

function buildAdminModels(allModels, accessMap) {
  return allModels.map((model) => {
    const publicModel = toPublicModel(model);
    const enabled =
      publicModel.enabled !== false && (accessMap.has(model.id) ? accessMap.get(model.id) : true);
    return { ...publicModel, enabled };
  });
}

async function attachAttachmentCaps(db, models) {
  if (!db) return models;
  const attachmentCaps = await loadModelAttachmentCaps(db);
  return models.map((model) => ({
    ...model,
    attachments: getModelAttachmentCapsEntry(attachmentCaps, model.id),
  }));
}
export async function handleAdminModelsSettingsList({
  req,
  env,
  ctx: _ctx,
  user,
  path: _path,
  logger,
}) {
  const authError = await requireModelAdmin(req, env, user);
  if (authError) return authError;

  if (!env.DB) {
    return error(req, 'Database unavailable', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  try {
    const ctx = await buildAdminListContext({ env, req, logger });
    const response = buildAdminListResponse({ ...ctx, req, limit: ctx.limit, offset: ctx.offset });
    return json(req, response);
  } catch (err) {
    logger.error('Unexpected error listing admin models', { error: err?.message || err });
    return error(req, 'Failed to list models', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

async function buildAdminListContext({ env, req, logger }) {
  const db = createDB(env.DB);
  const openaiEnabled = await resolveOpenaiEnabled(db, logger);
  const { limit, offset, query, providerFilter, includeDisabled } = parseListParams(req);
  const { baseModels, customModels } = await loadModels(env, logger, { includeDisabled });

  const allModels = openaiEnabled
    ? [...baseModels, ...customModels]
    : [...baseModels, ...customModels].filter((model) => !isOpenAIProvider(model));

  const accessMap = await getModelAccessMap(db, logger);
  const adminModels = buildAdminModels(allModels, accessMap);
  return { db, adminModels, limit, offset, query, providerFilter };
}

async function resolveOpenaiEnabled(db, logger) {
  try {
    return await getConfigBool(db, 'openai_enabled', true);
  } catch (err) {
    logger.warn('Failed to read openai_enabled config', { error: err.message });
    return true;
  }
}

function buildAdminListResponse({ req, db, adminModels, limit, offset, query, providerFilter }) {
  const providerStats = buildProviderStats(adminModels);
  const filteredModels = sortModelsByActiveThenName(
    applyFilters(adminModels, query, providerFilter)
  );
  const total = filteredModels.length;
  const activeTotal = countEnabledModels(filteredModels);
  const paginated = applyPagination(filteredModels, limit, offset);
  return assembleListPayload(req, db, {
    paginated,
    total,
    activeTotal,
    limit,
    offset,
    providerStats,
  });
}

function applyPagination(models, limit, offset) {
  if (limit <= 0) return models;
  return models.slice(offset, offset + limit);
}

async function assembleListPayload(
  req,
  db,
  { paginated, total, activeTotal, limit, offset, providerStats }
) {
  const modelsWithCaps = await attachAttachmentCaps(db, paginated);
  return {
    models: modelsWithCaps,
    total,
    active_total: activeTotal,
    limit,
    offset,
    providers: providerStats,
  };
}
