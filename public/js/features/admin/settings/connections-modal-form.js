/**
 * Connection modal form helpers — field population, model rendering,
 * and model loading/refreshing for the connection create/edit modal.
 */

import { renderModalModels } from './connections-modal-form-render-models.js';
import {
  providerDisplayLabel,
  providerUrlPlaceholder,
  isCompatibleProviderType,
  resolveUrlLabel,
  resolveKeyLabel,
} from './connections-helpers.js';
import { updateApiTypeDisplay } from './connections-helpers-modal-models.js';
import {
  addManualModalModel as addManualModalModelOp,
  removeManualModalModel as removeManualModalModelOp,
  loadModalModels as loadModalModelsOp,
  refreshModalModels as refreshModalModelsOp,
} from './connections-modal-form-ops.js';

function queryConnectionModalRefs(scope) {
  return {
    nameInput: scope.querySelector('#modal-conn-name'),
    urlInput: scope.querySelector('#modal-conn-url'),
    keyInput: scope.querySelector('#modal-conn-key'),
    headersInput: scope.querySelector('#modal-conn-headers'),
    providerSelect: scope.querySelector('#modal-conn-provider'),
    testButton: scope.querySelector('#test-connection'),
    testMessage: scope.querySelector('#connection-test-message'),
    title: scope.querySelector('#modal-title'),
    providerHint: scope.querySelector('#modal-conn-provider-hint'),
    urlLabel: scope.querySelector('#modal-conn-url-label'),
    urlHint: scope.querySelector('#modal-conn-url-hint'),
    keyLabel: scope.querySelector('#modal-conn-key-label'),
    keyHint: scope.querySelector('#modal-conn-key-hint'),
    deleteBtn: scope.querySelector('#delete-connection'),
  };
}

function setElementValue(el, value) {
  if (el) el.value = value;
}

function setElementText(el, text) {
  if (el) el.textContent = text;
}

function setElementDisabled(el, disabled) {
  if (el) el.disabled = disabled;
}

function toggleElementClass(el, className, force) {
  if (el) el.classList.toggle(className, force);
}

function resolveEffectiveProviderType(refs, connection) {
  const selected = refs.providerSelect?.value;
  return selected || connection?.providerType || 'openai';
}

function applyFieldValues(refs, connection) {
  setElementValue(refs.nameInput, connection?.name || '');
  setElementValue(refs.urlInput, connection?.url || '');
  setElementValue(refs.keyInput, '');
  setElementValue(refs.headersInput, connection?.headers || '');
  setElementValue(refs.providerSelect, connection?.providerType || 'openai');
}

function applyReadOnlyState(refs, isReadOnlyConnection) {
  setElementDisabled(refs.nameInput, isReadOnlyConnection);
  setElementDisabled(refs.urlInput, isReadOnlyConnection);
  setElementDisabled(refs.keyInput, isReadOnlyConnection);
  setElementDisabled(refs.headersInput, isReadOnlyConnection);
  setElementDisabled(refs.providerSelect, isReadOnlyConnection);
  toggleElementClass(refs.nameInput, 'text-gray-400', isReadOnlyConnection);
  toggleElementClass(refs.urlInput, 'text-gray-400', isReadOnlyConnection);
  toggleElementClass(refs.keyInput, 'text-gray-400', isReadOnlyConnection);
  toggleElementClass(refs.headersInput, 'text-gray-400', isReadOnlyConnection);
  toggleElementClass(refs.providerSelect, 'text-gray-400', isReadOnlyConnection);
}

function applyUrlPlaceholder(refs, providerType, isReadOnlyConnection) {
  if (!refs.urlInput) return;
  const defaultUrl = providerUrlPlaceholder(providerType);
  refs.urlInput.placeholder = defaultUrl;
  const needsDefault =
    !isCompatibleProviderType(providerType) &&
    !String(refs.urlInput.value || '').trim() &&
    !isReadOnlyConnection;
  if (needsDefault) {
    refs.urlInput.value = defaultUrl;
  }
}

function applyNamePlaceholder(refs, providerType) {
  if (refs.nameInput) {
    refs.nameInput.placeholder = `e.g. ${providerDisplayLabel(providerType)}`;
  }
}

const MODAL_TITLES = {
  update: 'Edit Connection',
  default: 'Add Connection',
};

function resolveModalTitle(modalMode) {
  return modalMode === 'update' ? MODAL_TITLES.update : MODAL_TITLES.default;
}

function applyProviderLabels(refs, providerType) {
  setElementText(refs.providerHint, providerDisplayLabel(providerType));
  setElementText(refs.urlLabel, resolveUrlLabel(providerType));
  const urlHintText = isCompatibleProviderType(providerType)
    ? 'Required for compatible providers.'
    : 'Uses the built-in default if left blank.';
  setElementText(refs.urlHint, urlHintText);
}

function applyKeyLabels(refs, connection) {
  setElementText(refs.keyLabel, resolveKeyLabel());
  const hasSavedKey = Boolean(connection?.hasKey || connection?.keyMasked);
  const keyHintText = hasSavedKey
    ? 'A key is already saved. Leave this blank to keep it.'
    : 'Optional for providers that do not require a key.';
  setElementText(refs.keyHint, keyHintText);
}

function applyModalButtons(refs, isReadOnlyConnection, modalMode) {
  const hideDelete = modalMode !== 'update' || isReadOnlyConnection;
  toggleElementClass(refs.deleteBtn, 'hidden', hideDelete);
  toggleElementClass(refs.testButton, 'hidden', isReadOnlyConnection);
  toggleElementClass(refs.testMessage, 'hidden', isReadOnlyConnection);
}

function updateModalSaveButtonInternal(connectionsState, scope) {
  const btn = scope.querySelector('#save-modal');
  if (!btn) return;
  const saving = connectionsState.modalSaving;
  btn.disabled = saving;
  btn.textContent = saving ? 'Saving...' : 'Save';
  btn.classList.toggle('opacity-60', saving);
  btn.classList.toggle('cursor-not-allowed', saving);
}

export function createConnectionsModalForm(deps) {
  const { container, connectionsState, setTestStatus } = deps;

  const fillModalFields = (connection, scope = container) => {
    const refs = queryConnectionModalRefs(scope);
    const isReadOnlyConnection = Boolean(connection?.readOnly);
    const providerType = resolveEffectiveProviderType(refs, connection);

    applyFieldValues(refs, connection);
    applyUrlPlaceholder(refs, providerType, isReadOnlyConnection);
    applyNamePlaceholder(refs, providerType);
    applyReadOnlyState(refs, isReadOnlyConnection);
    setElementText(refs.title, resolveModalTitle(connectionsState.modalMode));
    applyProviderLabels(refs, providerType);
    applyKeyLabels(refs, connection);
    applyModalButtons(refs, isReadOnlyConnection, connectionsState.modalMode);

    updateApiTypeDisplay(scope, providerType);
    setTestStatus('idle', '', scope);
  };

  const addManualModalModel = (scope = container) => addManualModalModelOp(deps, scope);
  const removeManualModalModel = (modelId, scope = container) =>
    removeManualModalModelOp(deps, modelId, scope);
  const loadModalModels = (connection, scope = container) =>
    loadModalModelsOp(deps, connection, scope);
  const refreshModalModels = (scope = container) => refreshModalModelsOp(deps, scope);
  const updateModalSaveButton = (scope = container) =>
    updateModalSaveButtonInternal(connectionsState, scope);

  return {
    fillModalFields,
    renderModalModels,
    addManualModalModel,
    removeManualModalModel,
    loadModalModels,
    refreshModalModels,
    updateModalSaveButton,
  };
}
