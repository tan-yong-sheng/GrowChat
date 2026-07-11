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
export function syncProviderUi(providerSelect, baseUrlInput, bodyEl, nameInput) {
  if (!providerSelect || !baseUrlInput) return;
  const providerType = providerSelect.value;
  syncBaseUrlInput(baseUrlInput, providerType);
  updateApiTypeDisplay(bodyEl, providerType);
  syncModalLabels(bodyEl, providerType);
  if (nameInput) nameInput.placeholder = `e.g. ${adminProviderDisplayLabel(providerType)}`;
}

function syncBaseUrlInput(baseUrlInput, providerType) {
  const nextDefault = providerUrlPlaceholder(providerType);
  baseUrlInput.placeholder = nextDefault;
  if (isCompatibleProviderType(providerType)) {
    clearMatchingBaseUrlValue(baseUrlInput);
    return;
  }
  baseUrlInput.value = nextDefault;
}

function clearMatchingBaseUrlValue(baseUrlInput) {
  const currentValue = String(baseUrlInput.value == null ? '' : baseUrlInput.value).trim();
  if (!currentValue) return;
  const knownDefaults = [
    providerUrlPlaceholder('openai-compatible'),
    providerUrlPlaceholder('gemini-compatible'),
    providerUrlPlaceholder('claude-compatible'),
  ];
  if (knownDefaults.includes(currentValue)) {
    baseUrlInput.value = '';
  }
}

function syncModalLabels(bodyEl, providerType) {
  setLabelText(bodyEl, '#modal-conn-url-label', resolveUrlLabel(providerType));
  setLabelText(bodyEl, '#modal-conn-provider-hint', adminProviderDisplayLabel(providerType));
  setLabelText(bodyEl, '#modal-conn-url-hint', resolveUrlHint(providerType));
  setLabelText(bodyEl, '#modal-conn-key-label', 'API Key *');
}

function setLabelText(bodyEl, selector, text) {
  const el = bodyEl?.querySelector(selector);
  if (el) el.textContent = text;
}

function resolveUrlHint(providerType) {
  return isCompatibleProviderType(providerType)
    ? 'Required for compatible providers.'
    : 'Uses the built-in default if left blank.';
}
