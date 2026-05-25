/**
 * Re-exports from shared/utils/connection-helpers.js
 * Kept for backward compatibility — consumers in admin/ can use either path.
 */
export {
  normalizeProviderType,
  normalizeProviderFamily,
  providerLabel,
  providerDisplayLabel,
  providerUrlPlaceholder,
  isCompatibleProviderType,
  resolveModalUrl,
  resolveUrlLabel,
  resolveKeyLabel,
  connectionApiTypeDetails,
  normalizeConnectionManualModels,
  normalizeModelRecord,
  normalizeConnectionRecord,
  cloneModelSelection,
  getConnectionProviderId,
  formatConnectionModelId,
  inflateManualConnectionModels,
  normalizeModalModelRecord,
  normalizeModalModelId,
  cloneModalModelSelection,
  mergeConnectionModalModels,
  previewConnectionModalModels,
  buildSelectedConnectionModels,
  applyModalModelPreview,
  resolveConnectionModalSelectionMode,
  updateApiTypeDisplay,
} from '../../../shared/utils/connection-helpers.js';
