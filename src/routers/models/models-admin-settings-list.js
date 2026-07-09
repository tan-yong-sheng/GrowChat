import { error, json } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { createDB } from '../../db.js';
import { getConfigBool } from '../../utils/app-config.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { countEnabledModels, sortModelsByActiveThenName } from '../../llm/model-state.js';
import {
  getModelAccessMap,
  loadModelAttachmentCaps,
  getModelAttachmentCapsEntry,
} from './models-helpers.js';
import {
  fetchBaseModelsFromOpenAI,
  toPublicModel,
  isOpenAIProvider,
  buildProviderStats,
  loadCustomModels,
  getProviderKey,
} from './models-discovery.js';
import { requireModelAdmin } from './models-admin-settings-helpers.js';

const DEFAULT_LIMIT = 0;
const TRUTHY_VALUES = new Set(['1', 'true', 'yes']);

function parseListParams(req) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const rawQuery = url.searchParams.get('q') || '';
  const query = String(rawQuery).trim().toLowerCase();
  const includeDisabled = TRUTHY_VALUES.has(
    String(url.searchParams.get('include_disabled') || '').toLowerCase()
  );
  const providerParam = String(url.searchParams.get('provider') || '')
    .trim()
    .toLowerCase();
  const providerFilter = providerParam && providerParam !== 'all' ? providerParam : '';
  return { limit, offset, query, includeDisabled, providerFilter };
}

// eslint-disable-next-line complexity -- multi-field text search
function matchesModelQuery(model, query) {
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

async function loadModels(env, logger, includeDisabled) {
  let baseModels = [];
  let customModels = [];
  let modelConnections;

  try {
    modelConnections = await getAllOpenAIConnectionConfigs(env, { includeDisabled });
    baseModels = await fetchBaseModelsFromOpenAI(env, modelConnections);
  } catch (err) {
    logger.warn('Failed to fetch base models from OpenAI-compatible sources', {
      error: err.message,
    });
  }

  try {
    customModels = await loadCustomModels(env);
  } catch (err) {
    logger.warn('Failed to load custom models', { error: err.message });
  }

  return { baseModels, customModels };
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

/* eslint-disable max-params, max-statements -- handler orchestrates multiple steps */
export async function handleAdminModelsSettingsList(req, env, _ctx, user, _path, { logger }) {
  const authError = await requireModelAdmin(req, env, user);
  if (authError) return authError;

  if (!env.DB) {
    return error(req, 'Database unavailable', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  try {
    const db = createDB(env.DB);
    let openaiEnabled = true;
    try {
      openaiEnabled = await getConfigBool(db, 'openai_enabled', true);
    } catch (err) {
      logger.warn('Failed to read openai_enabled config', { error: err.message });
    }

    const { limit, offset, query, providerFilter, includeDisabled } = parseListParams(req);
    const { baseModels, customModels } = await loadModels(env, logger, includeDisabled);

    let allModels = [...baseModels, ...customModels];
    if (!openaiEnabled) {
      allModels = allModels.filter((model) => !isOpenAIProvider(model));
    }

    const accessMap = await getModelAccessMap(db, logger);
    const adminModels = buildAdminModels(allModels, accessMap);
    const providerStats = buildProviderStats(adminModels);

    let filteredModels = applyFilters(adminModels, query, providerFilter);
    filteredModels = sortModelsByActiveThenName(filteredModels);
    const total = filteredModels.length;
    const activeTotal = countEnabledModels(filteredModels);

    let paginatedModels = filteredModels;
    if (limit > 0) {
      paginatedModels = filteredModels.slice(offset, offset + limit);
    }

    paginatedModels = await attachAttachmentCaps(db, paginatedModels);

    return json(req, {
      models: paginatedModels,
      total,
      active_total: activeTotal,
      limit,
      offset,
      providers: providerStats,
    });
  } catch (err) {
    logger.error('Unexpected error listing admin models', { error: err?.message || err });
    return error(req, 'Failed to list models', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
