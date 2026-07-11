// fallow-ignore-file code-duplication
/**
 * Model Discovery Context and Model Building Helpers
 *
 * Extracted from models-discovery.js to reduce file size.
 * These helpers build connection model context, check model
 * enablement, and construct discovered model objects.
 */

import {
  buildProviderId,
  formatModelId,
  normalizeConnectionModelId,
  normalizeProviderFamily,
} from '../../llm/provider-registry.js';
import { normalizeConnectionManualModels } from '../../llm/connections.js';
import { normalizeConnectionModelSelectionMode } from '../../../public/js/shared/utils/connection-model-selection.js';

export function buildConnectionModelContext(conn) {
  const providerId = buildProviderId(conn);
  const manualModels = normalizeConnectionManualModels(conn.manualModels);
  const manualModelIds = new Set(
    manualModels
      .map((model) => normalizeConnectionModelId(providerId, model?.modelId || ''))
      .filter(Boolean)
  );
  const selectionMode =
    normalizeConnectionModelSelectionMode(conn.manualModelsMode || conn.manual_models_mode) ||
    'all';
  return { providerId, manualModels, manualModelIds, selectionMode };
}

export function isModelEnabled({ selectionMode, manualModelIds, rawId }) {
  if (selectionMode === 'none') return false;
  if (selectionMode === 'some') return manualModelIds.has(rawId);
  return true;
}

export function buildDiscoveredModel(
  conn,
  providerId,
  rawId,
  description,
  context,
  overrides = {}
) {
  return {
    id: formatModelId(providerId, rawId),
    name: overrides.name || rawId,
    provider: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
    provider_type: String(conn.providerType || conn.providerFamily || 'openai').toLowerCase(),
    provider_family: normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai',
    provider_id: providerId,
    connection_id: conn.id,
    connection_name: conn.name || null,
    connection_source: conn.source || null,
    free: false,
    description,
    enabled: isModelEnabled({
      selectionMode: context.selectionMode,
      manualModelIds: context.manualModelIds,
      rawId,
    }),
    ...overrides,
  };
}
