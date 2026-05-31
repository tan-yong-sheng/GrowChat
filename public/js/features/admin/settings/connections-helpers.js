/**
 * Re-exports from shared/utils/connection-helpers.js
 * Kept for backward compatibility — consumers in admin/ can use either path.
 */
export {
  cloneModelSelection,
  connectionApiTypeDetails,
  formatConnectionModelId,
  getConnectionProviderId,
  inflateManualConnectionModels,
  isCompatibleProviderType,
  normalizeConnectionManualModels,
  normalizeConnectionRecord,
  normalizeModalModelId,
  normalizeModalModelRecord,
  normalizeModelRecord,
  normalizeProviderFamily,
  normalizeSavedConnectionModelId,
  providerDisplayLabel,
  providerUrlPlaceholder,
  resolveKeyLabel,
  resolveModalUrl,
  resolveUrlLabel,
} from '../../../shared/utils/connection-helpers.js';
