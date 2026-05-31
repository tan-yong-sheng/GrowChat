/**
 * Re-exports from shared/utils/connection-helpers.js
 * Kept for backward compatibility — consumers in admin/ can use either path.
 */
export {
  buildModalConnectionPayload,
  buildSelectedConnectionModels,
  previewConnectionModalModels,
  resolveConnectionModalSelectionMode,
  updateApiTypeDisplay,
} from '../../../shared/utils/connection-helpers.js';

export {
  cloneModalModelSelection,
  mergeConnectionModalModels,
  applyModalModelPreview,
} from '../../../shared/utils/connection-helpers.js';
