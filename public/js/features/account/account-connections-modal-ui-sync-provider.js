/**
 * Sync provider UI — updates the connection modal when the provider type changes.
 * Extracted from account-connections-modal-ui.js to reduce module size.
 */
import {
  isCompatibleProviderType,
  resolveUrlLabel,
  providerDisplayLabel as adminProviderDisplayLabel,
} from '../../shared/utils/connection-helpers.js';
import { providerUrlPlaceholder } from './account-connections-helpers.js';
import { updateApiTypeDisplay } from '../admin/settings/connections-helpers-modal-models.js';

/**
 * Sync the provider-UI elements when the provider select changes.
 * Updates the URL placeholder, hints, and key label based on the selected provider type.
 *
 * @param {HTMLSelectElement|null} providerSelect - Provider type select element
 * @param {HTMLInputElement|null} baseUrlInput - Base URL input element
 * @param {HTMLElement|null} bodyEl - Modal body element
 * @param {HTMLInputElement|null} nameInput - Name input element
 */
// eslint-disable-next-line max-statements, complexity
export function syncProviderUi(providerSelect, baseUrlInput, bodyEl, nameInput) {
  if (!providerSelect || !baseUrlInput) return;
  const providerType = providerSelect.value;
  const nextDefault = providerUrlPlaceholder(providerType);
  baseUrlInput.placeholder = nextDefault;
  if (isCompatibleProviderType(providerType)) {
    const currentValue = String(baseUrlInput.value == null ? '' : baseUrlInput.value).trim();
    const knownDefaults = [
      providerUrlPlaceholder('openai-compatible'),
      providerUrlPlaceholder('gemini-compatible'),
      providerUrlPlaceholder('claude-compatible'),
    ];
    if (!currentValue || knownDefaults.includes(currentValue)) {
      baseUrlInput.value = '';
    }
  } else {
    baseUrlInput.value = nextDefault;
  }
  updateApiTypeDisplay(bodyEl, providerType);
  const urlLabel = bodyEl?.querySelector('#modal-conn-url-label');
  if (urlLabel) urlLabel.textContent = resolveUrlLabel(providerType);
  const providerHint = bodyEl?.querySelector('#modal-conn-provider-hint');
  if (providerHint) providerHint.textContent = adminProviderDisplayLabel(providerType);
  const urlHint = bodyEl?.querySelector('#modal-conn-url-hint');
  if (urlHint) {
    urlHint.textContent = isCompatibleProviderType(providerType)
      ? 'Required for compatible providers.'
      : 'Uses the built-in default if left blank.';
  }
  const keyLabel = bodyEl?.querySelector('#modal-conn-key-label');
  if (keyLabel) keyLabel.textContent = 'API Key *';
  if (nameInput) nameInput.placeholder = `e.g. ${adminProviderDisplayLabel(providerType)}`;
}
