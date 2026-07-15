import { filterModelsBySearch } from '../utils/model-search.js';
import { renderButton } from './button.js';
import { sortModelsByActiveThenName } from '../utils/model-state.js';
import {
  normalizeProviderType,
  isCompatibleProviderType,
  providerDisplayLabel,
  providerUrlPlaceholder,
  resolveUrlLabel,
  resolveKeyLabel,
  connectionApiTypeDetails,
  escapeHtml,
  formatHeadersValue,
} from './connection-modal-utils.js';

/**
 * Render a labeled key-hint field — extracted from buildConnectionModalBodyMarkup
 * to reduce its cyclomatic complexity.
 */
function resolveKeyHintField({ showKeyHint, keyHintText, hasKey }) {
  return showKeyHint
    ? `<div id="modal-conn-key-hint" class="mt-1 text-label-sm text-gray-700">${escapeHtml(keyHintText || (hasKey ? 'A key is already saved. Leave this blank to keep it.' : 'Leave blank if your provider does not require authentication.'))}</div>`
    : '';
}

/**
 * Render a test-connection button — extracted from buildConnectionModalBodyMarkup
 * to reduce its cyclomatic complexity.
 */
function resolveTestConnectionButton({
  showTestButton,
  testHiddenClass,
  disabledControlClass,
  disabledAttr,
}) {
  return showTestButton
    ? `<button type="button" id="test-connection" class="p-2 text-gray-600 hover:text-gray-700 rounded-lg transition${testHiddenClass}${disabledControlClass}" title="Test connection" aria-label="Test connection"${disabledAttr}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>
        </svg>
      </button>`
    : '';
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
  const resolvedModels = Array.isArray(models) ? models : [];
  const resolvedSelection = selection instanceof Set ? selection : new Set();
  const resolvedModelMarkup = buildConnectionModalModelsMarkup(
    resolvedModels,
    query,
    resolvedSelection,
    loadingModels,
    modelsError
  );
  const resolvedNamePlaceholder =
    namePlaceholder || `e.g. ${providerDisplayLabel(resolvedProviderType)}`;
  const resolvedUrlPlaceholder = urlPlaceholder || providerUrlPlaceholder(resolvedProviderType);
  const resolvedUrlHint =
    urlHint ||
    (isCompatibleProviderType(resolvedProviderType)
      ? 'Required for compatible providers.'
      : 'Uses the built-in default if left blank.');
  const resolvedProviderHint = providerHint || providerDisplayLabel(resolvedProviderType);
  const resolvedKeyPlaceholder =
    keyPlaceholder || (hasKey ? 'Leave blank to keep current key' : 'Enter API key');

  return `
    <div class="space-y-1">
      <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Name</label>
      <input id="modal-conn-name" type="text" value="${escapeHtml(name)}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(resolvedNamePlaceholder)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Name"${disabledAttr}>
    </div>

    <div class="space-y-1">
      <label id="modal-conn-url-label" class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveUrlLabel(resolvedProviderType))}</label>
      <div class="flex items-center gap-2">
        <input id="modal-conn-url" type="text" value="${escapeHtml(url)}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(resolvedUrlPlaceholder)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="URL"${disabledAttr}>
        ${resolveTestConnectionButton({ showTestButton, testHiddenClass, disabledControlClass, disabledAttr })}
      </div>
      <div id="connection-test-message" class="text-label-sm text-gray-700${testHiddenClass}"></div>
      <div id="modal-conn-url-hint" class="text-label-sm text-gray-700">${escapeHtml(resolvedUrlHint)}</div>
    </div>

    <div class="space-y-1">
      <label id="modal-conn-key-label" class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveKeyLabel())}</label>
      <div class="flex items-center gap-3">
        <div class="flex-1 relative">
          <input id="modal-conn-key" type="password" value="${escapeHtml(keyValue)}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="${escapeHtml(resolvedKeyPlaceholder)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="API Key"${disabledAttr}>
          <button type="button" id="toggle-key-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-2 py-1 text-label-sm font-medium uppercase tracking-wide text-gray-700 hover:text-gray-900 rounded transition${disabledControlClass}" aria-label="Toggle API key visibility"${disabledAttr}>
            <span data-password-toggle-label>Show</span>
          </button>
        </div>
      </div>
      ${resolveKeyHintField({ showKeyHint, keyHintText, hasKey })}
    </div>

    <div class="space-y-1">
      <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Headers</label>
      <textarea id="modal-conn-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-500 min-h-[60px] resize-none${disabledControlClass}" placeholder="Enter additional headers in JSON format" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Headers"${disabledAttr}>${escapeHtml(headers)}</textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="text-label-sm font-bold text-gray-600 uppercase tracking-wider">Provider Type</label>
        <select id="modal-conn-provider" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}"${disabledAttr}>
          <option value="openai"${resolvedProviderType === 'openai' ? ' selected' : ''}>OpenAI</option>
          <option value="openai-compatible"${resolvedProviderType === 'openai-compatible' ? ' selected' : ''}>OpenAI Compatible</option>
          <option value="google"${resolvedProviderType === 'google' ? ' selected' : ''}>Gemini</option>
          <option value="gemini-compatible"${resolvedProviderType === 'gemini-compatible' ? ' selected' : ''}>Gemini Compatible</option>
          <option value="anthropic"${resolvedProviderType === 'anthropic' ? ' selected' : ''}>Claude</option>
          <option value="claude-compatible"${resolvedProviderType === 'claude-compatible' ? ' selected' : ''}>Claude Compatible</option>
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
          <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"></path>
        </svg>
        <input id="modal-models-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Search models" value="${escapeHtml(query)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
      </div>
      <div class="flex items-center gap-2 rounded-md border border-dashed border-gray-200 bg-white px-3 py-2${manualModelsHiddenClass}${showManualModelAdd ? '' : ' hidden'}">
        <input id="modal-manual-model-id" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Add model manually" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
        ${renderButton({ label: 'Add', variant: 'primary', id: 'modal-manual-model-add', className: `shrink-0 px-3 py-1 text-label-sm font-medium${disabledControlClass}`, disabled: !!disabledAttr })}
      </div>
      <div id="modal-models-list" class="rounded-lg border border-gray-100 bg-white max-h-48 overflow-y-auto scrollbar-hidden text-sm">${resolvedModelMarkup}</div>
      <div id="modal-models-status" class="text-label-sm text-gray-700"></div>
    </div>
  `;
}

function buildConnectionModalModelsMarkup(
  models = [],
  query = '',
  selection = new Set(),
  loadingModels = false,
  modelsError = ''
) {
  const filteredModels = filterModelsBySearch(models, query);
  const hasSelection = selection.size > 0;

  if (loadingModels) {
    return `<div class="py-4 text-center text-label-sm text-gray-500">
      <svg class="w-5 h-5 animate-spin inline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4"></path>
      </svg>
      Loading models…
    </div>`;
  }

  if (modelsError) {
    return `<div class="py-4 text-center text-label-sm text-red-500">${escapeHtml(modelsError)}</div>`;
  }

  if (filteredModels.length === 0) {
    return query
      ? `<div class="py-4 text-center text-label-sm text-gray-500">No models found matching '${escapeHtml(query)}'.</div>`
      : `<div class="py-4 text-center text-label-sm text-gray-500">No models configured.</div>`;
  }

  if (hasSelection) {
    return `<div class="py-4 text-center text-label-sm text-gray-500">${filteredModels.length} models selected.</div>`;
  }

  const sorted = sortModelsByActiveThenName(filteredModels);
  return sorted
    .map(
      (model) => `
        <div class="flex items-center gap-3 rounded-md border border-gray-100 bg-white px-3 py-2 text-sm">
          <div class="w-4 h-4 rounded-full border-2 ${selection.has(model.id) ? 'border-primary bg-primary' : 'border-gray-200 bg-white'}" data-model-check="${escapeHtml(model.id)}"></div>
          <div class="min-w-0">
            <div class="text-label-sm font-medium text-gray-900">${escapeHtml(model.name || model.id)}</div>
            <div class="text-label-xs text-gray-500">${escapeHtml(model.type || '')}</div>
          </div>
          <div class="ml-auto">
            <label class="text-label-xs text-gray-400">
              <input type="checkbox" data-model-check="${escapeHtml(model.id)}" ${selection.has(model.id) ? 'checked' : ''} class="sr-only peer">
              <span class="w-4 h-4 rounded border-2 ${selection.has(model.id) ? 'border-primary' : 'border-gray-200'}"></span>
            </label>
          </div>
        </div>`
    )
    .join('');
}
