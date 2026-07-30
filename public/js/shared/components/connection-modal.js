import { renderButton } from './button.js';
import { filterModelsBySearch } from '../utils/model-search.js';
import { sortModelsByActiveThenName } from '../utils/model-state.js';
import {
  normalizeProviderType,
  isCompatibleProviderType,
  providerDisplayLabel,
  providerUrlPlaceholder,
  resolveUrlLabel,
  resolveKeyLabel,
  connectionApiTypeDetails,
  STANDARD_MODAL_PRESET,
  escapeHtml,
  formatHeadersValue,
} from './connection-modal-utils.js';

const CLOSE_ICON_SVG = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
          </svg>`;

const TEST_CONNECTION_ICON_SVG = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>
                </svg>`;

const SEARCH_ICON_SVG = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
          <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"></path>
        </svg>`;

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'google', label: 'Gemini' },
  { value: 'gemini-compatible', label: 'Gemini Compatible' },
  { value: 'anthropic', label: 'Claude' },
  { value: 'claude-compatible', label: 'Claude Compatible' },
];

const NO_KEY_HINT = 'Optional for providers that do not require a key.';
const URL_HINT_COMPAT = 'Required for compatible providers.';
const URL_HINT_DEFAULT = 'Uses the built-in default if left blank.';

function resolveUrlHint(providerType) {
  return isCompatibleProviderType(providerType) ? URL_HINT_COMPAT : URL_HINT_DEFAULT;
}

function resolveKeyHint(hasKey) {
  return hasKey ? 'A key is already saved. Leave this blank to keep it.' : NO_KEY_HINT;
}

function resolveKeyPlaceholder(hasKey) {
  return hasKey ? 'Leave blank to keep current key' : 'Enter API key';
}

function resolveNamePlaceholder(providerType) {
  return `e.g. ${providerDisplayLabel(providerType)}`;
}

function resolveDisabledAttrs(canManage) {
  return canManage ? '' : ' disabled aria-disabled="true"';
}

function resolveDisabledControlClass(canManage) {
  return canManage ? '' : ' opacity-50 cursor-not-allowed';
}

function resolveHiddenClass(isHidden) {
  return isHidden ? ' hidden' : '';
}

function resolveDeleteHiddenClass(connection, isEnvConnection) {
  return connection?.id && !isEnvConnection ? '' : ' hidden';
}

function resolveTestHiddenClass(isEnvConnection) {
  return isEnvConnection ? ' hidden' : '';
}

function resolveManualModelsHiddenClass(isEnvConnection) {
  return isEnvConnection ? ' hidden' : '';
}

function renderProviderOptions(providerType) {
  return PROVIDER_OPTIONS.map(
    (opt) =>
      `<option value="${escapeHtml(opt.value)}"${providerType === opt.value ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`
  ).join('');
}

function renderNameField({ name, providerType, disabledAttr, disabledControlClass }) {
  return `
          <div class="space-y-1">
            <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Name</label>
            <input id="modal-conn-name" type="text" value="${escapeHtml(name)}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(resolveNamePlaceholder(providerType))}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
          </div>`;
}

function renderTestConnectionButton({ testHiddenClass, disabledAttr, disabledControlClass }) {
  return `<button id="test-connection" class="p-1 text-gray-600 hover:text-gray-700${testHiddenClass}${disabledControlClass}" title="Test connection"${disabledAttr}>${TEST_CONNECTION_ICON_SVG}</button>`;
}

function renderUrlField({
  url,
  providerType,
  testHiddenClass,
  disabledAttr,
  disabledControlClass,
}) {
  return `
          <div class="space-y-1">
            <label id="modal-conn-url-label" class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveUrlLabel(providerType))}</label>
            <div class="flex items-center gap-2">
              <input id="modal-conn-url" type="text" value="${escapeHtml(url)}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(providerUrlPlaceholder(providerType))}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
              ${renderTestConnectionButton({ testHiddenClass, disabledAttr, disabledControlClass })}
            </div>
            <div id="connection-test-message" class="text-label-sm text-gray-700${testHiddenClass}"></div>
            <div id="modal-conn-url-hint" class="text-label-sm text-gray-700">${escapeHtml(resolveUrlHint(providerType))}</div>
          </div>`;
}

function renderKeyField({ hasKey, disabledAttr, disabledControlClass }) {
  return `
          <div class="space-y-1">
            <label id="modal-conn-key-label" class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveKeyLabel())}</label>
            <div class="flex items-center gap-3">
              <div class="flex-1 relative">
                <input id="modal-conn-key" type="password" value="" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="${escapeHtml(resolveKeyPlaceholder(hasKey))}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
                <button id="toggle-key-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-0.5 text-label-sm font-medium uppercase tracking-wide text-gray-600 hover:text-gray-700${disabledControlClass}" aria-label="Show key"${disabledAttr}>
                  <span data-password-toggle-label>Show</span>
                </button>
              </div>
            </div>
            <div class="mt-1 text-label-sm text-gray-700">${escapeHtml(resolveKeyHint(hasKey))}</div>
          </div>`;
}

function renderHeadersField({ resolvedHeaders, disabledAttr, disabledControlClass }) {
  return `
          <div class="space-y-1">
            <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Headers</label>
            <textarea id="modal-conn-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none${disabledControlClass}" placeholder="Enter additional headers in JSON format" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>${escapeHtml(resolvedHeaders)}</textarea>
          </div>`;
}

function renderProviderTypeField({ providerType, disabledAttr, disabledControlClass }) {
  return `
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Provider Type</label>
              <select id="modal-conn-provider" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}"${disabledAttr}>
                ${renderProviderOptions(providerType)}
              </select>
              <div id="modal-conn-provider-hint" class="text-label-sm text-gray-700">${escapeHtml(providerDisplayLabel(providerType))}</div>
            </div>`;
}

function renderApiTypeField({ apiType }) {
  return `
            <div class="space-y-1">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">API Type</label>
              <div id="modal-conn-api-type-label" class="text-sm text-gray-900">${escapeHtml(apiType.label)}</div>
              <div id="modal-conn-api-type-hint" class="text-label-sm text-gray-700">${escapeHtml(apiType.endpoint)}</div>
            </div>`;
}

function renderProviderApiTypeGrid({ providerType, apiType, disabledAttr, disabledControlClass }) {
  return `
          <div class="grid grid-cols-2 gap-4">
            ${renderProviderTypeField({ providerType, disabledAttr, disabledControlClass })}
            ${renderApiTypeField({ apiType })}
          </div>`;
}

function renderModelsSearchField({ disabledAttr, disabledControlClass }) {
  return `
            <div class="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
              ${SEARCH_ICON_SVG}
              <input id="modal-models-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Search models" value="" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
            </div>`;
}

function renderManualModelAddField({
  manualModelsHiddenClass,
  disabledAttr,
  disabledControlClass,
  canManage,
}) {
  return `
            <div class="flex items-center gap-2 rounded-md border border-dashed border-gray-200 bg-white px-3 py-2${manualModelsHiddenClass}">
              <input id="modal-manual-model-id" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Add model manually" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
              ${renderButton({ label: 'Add', variant: 'primary', id: 'modal-manual-model-add', className: `shrink-0 px-3 py-1 text-label-sm font-medium${disabledControlClass}`, disabled: !canManage })}
            </div>`;
}

function renderModelsSection({
  modelListMarkup,
  manualModelsHiddenClass,
  disabledAttr,
  disabledControlClass,
  canManage,
}) {
  return `
          <div class="space-y-2" id="modal-models-section">
            <div class="flex items-center justify-between">
              <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Models</label>
              <div class="flex items-center gap-2 text-label-sm text-gray-600">
                <button type="button" id="modal-models-select-all" class="px-2 py-1 rounded-md hover:bg-gray-50">All</button>
                <button type="button" id="modal-models-select-none" class="px-2 py-1 rounded-md hover:bg-gray-50">None</button>
              </div>
            </div>
            ${renderModelsSearchField({ disabledAttr, disabledControlClass })}
            ${renderManualModelAddField({ manualModelsHiddenClass, disabledAttr, disabledControlClass, canManage })}
            <div id="modal-models-list" class="rounded-lg border border-gray-100 bg-white max-h-48 overflow-y-auto scrollbar-hidden text-sm">${modelListMarkup}</div>
            <div id="modal-models-status" class="text-label-sm text-gray-600"></div>
          </div>`;
}

function renderModalFooter({
  deleteHiddenClass,
  disabledControlClass,
  canManage,
  showAccountHooks,
}) {
  const deleteDataAttrs = showAccountHooks ? { 'account-connection-delete-modal': '' } : {};
  const saveDataAttrs = showAccountHooks ? { 'account-connection-save': '' } : {};
  return `
        <div class="px-6 py-6 flex justify-end gap-3 border-t border-gray-50">
          ${renderButton({ label: 'Delete', variant: 'ghost', id: 'delete-connection', className: `px-5 py-1.5${deleteHiddenClass}${disabledControlClass}`, disabled: !canManage, dataAttrs: deleteDataAttrs })}
          ${renderButton({ label: 'Save', variant: 'primary', id: 'save-modal', className: `px-5 py-1.5${disabledControlClass}`, disabled: !canManage, dataAttrs: saveDataAttrs })}
        </div>`;
}

function renderModalHeader({ title }) {
  return `
        <div class="px-6 pt-6 pb-4 flex justify-between items-center border-b border-gray-50">
          <h3 id="modal-title" class="text-lg font-medium text-gray-900">${escapeHtml(title)}</h3>
          <button id="close-modal" class="p-1 text-gray-600 hover:text-gray-700 transition-colors">
            ${CLOSE_ICON_SVG}
          </button>
        </div>`;
}

function renderModalBody(ctx) {
  return `
        <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
          ${renderNameField(ctx)}
          ${renderUrlField(ctx)}
          ${renderKeyField(ctx)}
          ${renderHeadersField(ctx)}
          ${renderProviderApiTypeGrid(ctx)}
          ${renderModelsSection(ctx)}
        </div>
        ${renderModalFooter(ctx)}`;
}

function renderModalCard(ctx) {
  return `
      <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        ${renderModalHeader(ctx)}
        ${renderModalBody(ctx)}
      </div>`;
}

export function buildConnectionModalMarkup({
  rootId = 'edit-connection-modal',
  title = 'Add Connection',
  connection = null,
  isVisible = true,
  showAccountHooks = false,
  isEnvConnection = false,
  canManage = true,
} = {}) {
  const providerType = normalizeProviderType(
    connection?.providerType || connection?.provider_type || 'openai'
  );
  const resolvedName = String(connection?.name || '').trim();
  const resolvedUrl = String(
    connection?.url || connection?.base_url || connection?.baseUrl || ''
  ).trim();
  const hasKey = Boolean(
    connection?.has_key || String(connection?.key || connection?.keyMasked || '').trim()
  );
  const resolvedHeaders = formatHeadersValue(connection?.headers);
  const apiType = connectionApiTypeDetails(providerType);
  const hiddenClass = resolveHiddenClass(!isVisible);
  const testHiddenClass = resolveTestHiddenClass(isEnvConnection);
  const manualModelsHiddenClass = resolveManualModelsHiddenClass(isEnvConnection);
  const deleteHiddenClass = resolveDeleteHiddenClass(connection, isEnvConnection);
  const disabledAttr = resolveDisabledAttrs(canManage);
  const disabledControlClass = resolveDisabledControlClass(canManage);

  const ctx = {
    title,
    name: resolvedName,
    url: resolvedUrl,
    hasKey,
    resolvedHeaders,
    providerType,
    apiType,
    modelListMarkup: '',
    deleteHiddenClass,
    testHiddenClass,
    manualModelsHiddenClass,
    disabledAttr,
    disabledControlClass,
    canManage,
    showAccountHooks,
  };

  return `
    <div id="${escapeHtml(rootId)}" class="${STANDARD_MODAL_PRESET.outerClass}${hiddenClass}" style="z-index: ${STANDARD_MODAL_PRESET.zIndex};">
      <div class="${STANDARD_MODAL_PRESET.overlayClass}"></div>
      ${renderModalCard(ctx)}
    </div>
  `;
}
export function buildConnectionModalModelsMarkup(
  models = [],
  query = '',
  selection = new Set(),
  loading = false,
  error = ''
) {
  if (loading) {
    return '<div class="px-4 py-3 text-xs text-gray-600">Loading models...</div>';
  }
  if (error) {
    return `<div class="px-4 py-3 text-xs text-red-500">${escapeHtml(error)}</div>`;
  }
  return buildConnectionModelsListMarkup(models, query, selection);
}

export function buildConnectionModalBodyMarkup({
  providerType = 'openai',
  name = '',
  url = '',
  keyValue = '',
  hasKey = false,
  headers = '',
  apiType = null,
  showTestButton = true,
  testHiddenClass = '',
  manualModelsHiddenClass = '',
  disabledAttr = '',
  disabledControlClass = '',
  models = [],
  query = '',
  selection = new Set(),
  loadingModels = false,
  modelsError = '',
  showKeyHint = true,
  keyHintText = '',
  keyPlaceholder = null,
  urlPlaceholder = null,
  namePlaceholder = null,
  providerHint = null,
  urlHint = null,
  modelSectionTitle = 'Models',
  showManualModelAdd = true,
} = {}) {
  const resolvedProviderType = normalizeProviderType(providerType);
  const resolvedApiType = apiType || connectionApiTypeDetails(resolvedProviderType);
  const resolvedModelMarkup = buildConnectionModalModelsMarkup(
    models,
    query,
    selection,
    loadingModels,
    modelsError
  );

  const testButtonMarkup = showTestButton
    ? renderTestConnectionButton({ testHiddenClass, disabledAttr, disabledControlClass })
    : '';
  const providerOptionsMarkup = renderProviderOptions(resolvedProviderType);
  const keyHint = showKeyHint ? keyHintText || resolveKeyHint(hasKey) : '';
  const resolvedNamePlaceholder = namePlaceholder || resolveNamePlaceholder(resolvedProviderType);
  const resolvedUrlPlaceholder = urlPlaceholder || providerUrlPlaceholder(resolvedProviderType);
  const resolvedUrlHint = urlHint || resolveUrlHint(resolvedProviderType);
  const resolvedProviderHint = providerHint || providerDisplayLabel(resolvedProviderType);
  const manualAddClass = `${manualModelsHiddenClass}${showManualModelAdd ? '' : ' hidden'}`;

  return `
    <div class="space-y-1">
      <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Name</label>
      <input id="modal-conn-name" type="text" value="${escapeHtml(name)}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(resolvedNamePlaceholder)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Name"${disabledAttr}>
    </div>

    <div class="space-y-1">
      <label id="modal-conn-url-label" class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveUrlLabel(resolvedProviderType))}</label>
      <div class="flex items-center gap-2">
        <input id="modal-conn-url" type="text" value="${escapeHtml(url)}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(resolvedUrlPlaceholder)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="URL"${disabledAttr}>
        ${testButtonMarkup}
      </div>
      <div id="connection-test-message" class="text-label-sm text-gray-700${testHiddenClass}"></div>
      <div id="modal-conn-url-hint" class="text-label-sm text-gray-700">${escapeHtml(resolvedUrlHint)}</div>
    </div>

    <div class="space-y-1">
      <label id="modal-conn-key-label" class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveKeyLabel())}</label>
      <div class="flex items-center gap-3">
        <div class="flex-1 relative">
          <input id="modal-conn-key" type="password" value="${escapeHtml(keyValue)}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="${escapeHtml(keyPlaceholder || resolveKeyPlaceholder(hasKey))}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="API Key"${disabledAttr}>
          <button type="button" id="toggle-key-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-2 py-1 text-label-sm font-medium uppercase tracking-wide text-gray-700 hover:text-gray-900 rounded transition${disabledControlClass}" aria-label="Toggle API key visibility"${disabledAttr}>
            <span data-password-toggle-label>Show</span>
          </button>
        </div>
      </div>
      ${keyHint ? `<div id="modal-conn-key-hint" class="mt-1 text-label-sm text-gray-700">${escapeHtml(keyHint)}</div>` : ''}
    </div>

    <div class="space-y-1">
      <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Headers</label>
      <textarea id="modal-conn-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-500 min-h-[60px] resize-none${disabledControlClass}" placeholder="Enter additional headers in JSON format" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Headers"${disabledAttr}>${escapeHtml(headers)}</textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Provider Type</label>
        <select id="modal-conn-provider" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}"${disabledAttr}>
          ${providerOptionsMarkup}
        </select>
        <div id="modal-conn-provider-hint" class="text-label-sm text-gray-700">${escapeHtml(resolvedProviderHint)}</div>
      </div>
      <div class="space-y-1">
        <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">API Type</label>
        <div id="modal-conn-api-type-label" class="text-sm text-gray-900">${escapeHtml(resolvedApiType.label)}</div>
        <div id="modal-conn-api-type-hint" class="text-label-sm text-gray-700">${escapeHtml(resolvedApiType.endpoint)}</div>
      </div>
    </div>

    <div class="space-y-2" id="modal-models-section">
      <div class="flex items-center justify-between">
        <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(modelSectionTitle)}</label>
        <div class="flex items-center gap-2 text-label-sm text-gray-600">
          <button type="button" id="modal-models-select-all" class="px-2 py-1 rounded-md hover:bg-gray-50">All</button>
          <button type="button" id="modal-models-select-none" class="px-2 py-1 rounded-md hover:bg-gray-50">None</button>
        </div>
      </div>
      <div class="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2">
        ${SEARCH_ICON_SVG}
        <input id="modal-models-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Search models" value="${escapeHtml(query)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
      </div>
      <div class="flex items-center gap-2 rounded-md border border-dashed border-gray-200 bg-white px-3 py-2${manualAddClass}">
        <input id="modal-manual-model-id" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Add model manually" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
        ${renderButton({ label: 'Add', variant: 'primary', id: 'modal-manual-model-add', className: `shrink-0 px-3 py-1 text-label-sm font-medium${disabledControlClass}`, disabled: !!disabledAttr })}
      </div>
      <div id="modal-models-list" class="rounded-lg border border-gray-100 bg-white max-h-48 overflow-y-auto scrollbar-hidden text-sm">${resolvedModelMarkup}</div>
      <div id="modal-models-status" class="text-label-sm text-gray-700"></div>
    </div>
  `;
}

function buildConnectionModelsListMarkup(models, query, selection) {
  const sorted = sortModelsByActiveThenName(Array.isArray(models) ? models : []);
  if (!sorted.length) {
    return '<div class="px-4 py-3 text-xs text-gray-600">No models discovered for this connection.</div>';
  }
  const filtered = filterModelsBySearch(sorted, query);
  if (!filtered.length) {
    return String(query || '').trim()
      ? '<div class="px-4 py-3 text-xs text-gray-600">No models match the current search.</div>'
      : '<div class="px-4 py-3 text-xs text-gray-600">No models discovered for this connection.</div>';
  }
  return filtered.map((model) => renderConnectionModelRow(model, selection)).join('');
}

function renderConnectionModelRow(model, selection) {
  const checked = selection instanceof Set && selection.has(model.id);
  const manualBadge = model.manual
    ? '<span class="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-label-sm font-medium text-amber-700">Manual</span>'
    : '';
  const deleteButton = renderManualModelDeleteButton(model);
  const description = renderModelDescription(model);
  return `
      <div class="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
        <label class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover:bg-gray-50">
          <input type="checkbox" data-model-id="${escapeHtml(model.id)}" class="h-4 w-4 rounded border-gray-300 shrink-0" ${checked ? 'checked' : ''} />
          <div class="flex flex-col min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-gray-900">
              ${escapeHtml(model.name || model.id)}
              ${manualBadge}
            </div>
            <div class="truncate text-label-sm text-gray-700 font-mono">${escapeHtml(model.id)}</div>
            ${description}
          </div>
        </label>
        ${deleteButton}
      </div>
    `;
}

function renderManualModelDeleteButton(model) {
  if (!model.manual) return '';
  return (
    `<button type="button" data-delete-model-id="${escapeHtml(model.id)}" class="ml-auto shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Remove this manual model">` +
    `<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>` +
    `</button>`
  );
}

function renderModelDescription(model) {
  if (!model.description) return '';
  return `<div class="text-label-sm text-gray-700 mt-0.5">${escapeHtml(model.description)}</div>`;
}
