import { filterModelsBySearch } from '../utils/model-search.js';
import { sortModelsByActiveThenName } from '../utils/model-state.js';
import { getAdminModalPreset } from '../../features/admin/modal-shell.js';
import {
  connectionApiTypeDetails,
  isCompatibleProviderType,
  providerDisplayLabel as adminProviderDisplayLabel,
  providerUrlPlaceholder as adminProviderUrlPlaceholder,
  resolveKeyLabel,
  resolveUrlLabel,
} from '../../features/admin/settings/connections-helpers.js';

const STANDARD_MODAL_PRESET = getAdminModalPreset('standard');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeProviderType(value) {
  return String(value || '').trim().toLowerCase() || 'openai';
}

function formatHeadersValue(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers) || !Object.keys(headers).length) {
    return String(headers || '').trim();
  }
  try {
    return JSON.stringify(headers, null, 2);
  } catch {
    return '';
  }
}

function buildButtonAttrs(attrs = []) {
  return attrs.filter(Boolean).map((attr) => ` ${attr}`).join('');
}

export function buildConnectionModalBodyMarkup({
  providerType = 'openai',
  name = '',
  url = '',
  keyValue = '',
  hasKey = false,
  headers = '',
  apiType = null,
  canManage = true,
  showTestButton = true,
  testHiddenClass = '',
  manualModelsHiddenClass = '',
  disabledAttr = '',
  disabledControlClass = '',
  testButtonAttrs = '',
  testMessageAttrs = '',
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
    modelsError,
  );
  const resolvedNamePlaceholder = namePlaceholder || `e.g. ${adminProviderDisplayLabel(resolvedProviderType)}`;
  const resolvedUrlPlaceholder = urlPlaceholder || adminProviderUrlPlaceholder(resolvedProviderType);
  const resolvedUrlHint = urlHint || (isCompatibleProviderType(resolvedProviderType)
    ? 'Required for compatible providers.'
    : 'Uses the built-in default if left blank.');
  const resolvedProviderHint = providerHint || adminProviderDisplayLabel(resolvedProviderType);
  const resolvedKeyPlaceholder = keyPlaceholder || (hasKey ? 'Leave blank to keep current key' : 'Enter API key');

  return `
    <div class="space-y-1">
      <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Name</label>
      <input id="modal-conn-name" type="text" value="${escapeHtml(name)}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(resolvedNamePlaceholder)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Name"${disabledAttr}>
    </div>

    <div class="space-y-1">
      <label id="modal-conn-url-label" class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveUrlLabel(resolvedProviderType))}</label>
      <div class="flex items-center gap-2">
        <input id="modal-conn-url" type="text" value="${escapeHtml(url)}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(resolvedUrlPlaceholder)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="URL"${disabledAttr}>
        ${showTestButton ? `<button type="button" id="test-connection" class="p-1 text-gray-600 hover:text-gray-700${testHiddenClass}${disabledControlClass}" title="Test connection"${disabledAttr}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>
          </svg>
        </button>` : ''}
      </div>
      <div id="connection-test-message" class="text-[11px] text-gray-600${testHiddenClass}"${testMessageAttrs}></div>
      <div id="modal-conn-url-hint" class="text-[11px] text-gray-600">${escapeHtml(resolvedUrlHint)}</div>
    </div>

    <div class="space-y-1">
      <label id="modal-conn-key-label" class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveKeyLabel())}</label>
      <div class="flex items-center gap-3">
        <div class="flex-1 relative">
          <input id="modal-conn-key" type="password" value="${escapeHtml(keyValue)}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="${escapeHtml(resolvedKeyPlaceholder)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="API Key"${disabledAttr}>
          <button type="button" id="toggle-key-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600 hover:text-gray-700${disabledControlClass}" aria-label="Show key"${disabledAttr}>
            <span data-password-toggle-label>Show</span>
          </button>
        </div>
      </div>
      ${showKeyHint ? `<div id="modal-conn-key-hint" class="mt-1 text-[11px] text-gray-600">${escapeHtml(keyHintText || (hasKey ? 'A key is already saved. Leave this blank to keep it.' : 'Optional for providers that do not require a key.'))}</div>` : ''}
    </div>

    <div class="space-y-1">
      <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Headers</label>
      <textarea id="modal-conn-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none${disabledControlClass}" placeholder="Enter additional headers in JSON format" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" aria-label="Headers"${disabledAttr}>${escapeHtml(headers)}</textarea>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Provider Type</label>
        <select id="modal-conn-provider" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}"${disabledAttr}>
          <option value="openai"${resolvedProviderType === 'openai' ? ' selected' : ''}>OpenAI</option>
          <option value="openai-compatible"${resolvedProviderType === 'openai-compatible' ? ' selected' : ''}>OpenAI Compatible</option>
          <option value="google"${resolvedProviderType === 'google' ? ' selected' : ''}>Gemini</option>
          <option value="gemini-compatible"${resolvedProviderType === 'gemini-compatible' ? ' selected' : ''}>Gemini Compatible</option>
          <option value="anthropic"${resolvedProviderType === 'anthropic' ? ' selected' : ''}>Claude</option>
          <option value="claude-compatible"${resolvedProviderType === 'claude-compatible' ? ' selected' : ''}>Claude Compatible</option>
        </select>
        <div id="modal-conn-provider-hint" class="text-[11px] text-gray-600">${escapeHtml(resolvedProviderHint)}</div>
      </div>
      <div class="space-y-1">
        <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">API Type</label>
        <div id="modal-conn-api-type-label" class="text-sm text-gray-900">${escapeHtml(resolvedApiType.label)}</div>
        <div id="modal-conn-api-type-hint" class="text-[11px] text-gray-600">${escapeHtml(resolvedApiType.endpoint)}</div>
      </div>
    </div>

    <div class="space-y-2" id="modal-models-section">
      <div class="flex items-center justify-between">
        <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(modelSectionTitle)}</label>
        <div class="flex items-center gap-2 text-[11px] text-gray-600">
          <button type="button" id="modal-models-select-all" class="px-2 py-1 rounded-md hover:bg-gray-50">All</button>
          <button type="button" id="modal-models-select-none" class="px-2 py-1 rounded-md hover:bg-gray-50">None</button>
        </div>
      </div>
      <div class="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
          <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"></path>
        </svg>
        <input id="modal-models-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Search models" value="${escapeHtml(query)}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
      </div>
      <div class="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2${manualModelsHiddenClass}${showManualModelAdd ? '' : ' hidden'}">
        <input id="modal-manual-model-id" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Add model manually" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
        <button type="button" id="modal-manual-model-add" class="shrink-0 rounded-full bg-black px-3 py-1 text-[11px] font-medium text-white hover:bg-gray-900 transition${disabledControlClass}"${disabledAttr}>Add</button>
      </div>
      <div id="modal-models-list" class="rounded-2xl border border-gray-100 bg-white max-h-48 overflow-y-auto scrollbar-hidden text-sm">${resolvedModelMarkup}</div>
      <div id="modal-models-status" class="text-[11px] text-gray-600"></div>
    </div>
  `;
}

export function buildConnectionModalModelsMarkup(models = [], query = '', selection = new Set(), loading = false, error = '') {
  if (loading) {
    return '<div class="px-4 py-3 text-xs text-gray-600">Loading models...</div>';
  }
  if (error) {
    return `<div class="px-4 py-3 text-xs text-red-500">${escapeHtml(error)}</div>`;
  }

  const normalizedModels = sortModelsByActiveThenName(Array.isArray(models) ? models : []);
  if (!normalizedModels.length) {
    return '<div class="px-4 py-3 text-xs text-gray-600">No models discovered for this connection.</div>';
  }

  const filtered = filterModelsBySearch(normalizedModels, query);
  if (!filtered.length) {
    return String(query || '').trim()
      ? '<div class="px-4 py-3 text-xs text-gray-600">No models match the current search.</div>'
      : '<div class="px-4 py-3 text-xs text-gray-600">No models discovered for this connection.</div>';
  }

  return filtered.map((model) => {
    const checked = selection instanceof Set && selection.has(model.id);
    const manualBadge = model.manual
      ? '<span class="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Manual</span>'
      : '';
    const description = model.description
      ? `<div class="text-[10px] text-gray-400 mt-0.5">${escapeHtml(model.description)}</div>`
      : '';
    return `
      <label class="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
        <input type="checkbox" data-model-id="${escapeHtml(model.id)}" class="h-4 w-4 rounded border-gray-300" ${checked ? 'checked' : ''} />
        <div class="flex flex-col min-w-0">
          <div class="truncate text-sm font-medium text-gray-900">
            ${escapeHtml(model.name || model.id)}
            ${manualBadge}
          </div>
          <div class="truncate text-[10px] text-gray-400 font-mono">${escapeHtml(model.id)}</div>
          ${description}
        </div>
      </label>
    `;
  }).join('');
}

export function buildConnectionModalMarkup({
  rootId = 'edit-connection-modal',
  title = 'Add Connection',
  connection = null,
  isVisible = true,
  showAccountHooks = false,
  isEnvConnection = false,
  modalState = {},
  canManage = true,
} = {}) {
  const providerType = normalizeProviderType(connection?.providerType || connection?.provider_type || 'openai');
  const resolvedName = String(connection?.name || '').trim();
  const resolvedUrl = String(connection?.url || connection?.base_url || connection?.baseUrl || '').trim();
  const hasKey = Boolean(connection?.has_key || String(connection?.key || connection?.keyMasked || '').trim());
  const resolvedHeaders = formatHeadersValue(connection?.headers);
  const apiType = connectionApiTypeDetails(providerType);
  const modelListMarkup = '';
  const testButtonAttrs = buildButtonAttrs([
    showAccountHooks ? 'data-account-connection-test' : '',
  ]);
  const testMessageAttrs = buildButtonAttrs([
    showAccountHooks ? 'data-account-connection-test-message' : '',
  ]);
  const deleteButtonAttrs = buildButtonAttrs([
    showAccountHooks ? 'data-account-connection-delete-modal' : '',
  ]);
  const saveButtonAttrs = buildButtonAttrs([
    showAccountHooks ? 'data-account-connection-save' : '',
  ]);
  const hiddenClass = isVisible ? '' : ' hidden';
  const deleteHiddenClass = connection?.id && !isEnvConnection ? '' : ' hidden';
  const testHiddenClass = isEnvConnection ? ' hidden' : '';
  const manualModelsHiddenClass = isEnvConnection ? ' hidden' : '';
  const disabledAttr = canManage ? '' : ' disabled aria-disabled="true"';
  const disabledControlClass = canManage ? '' : ' opacity-50 cursor-not-allowed';

  return `
    <div id="${escapeHtml(rootId)}" class="${STANDARD_MODAL_PRESET.outerClass}${hiddenClass}" style="z-index: ${STANDARD_MODAL_PRESET.zIndex};">
      <div class="${STANDARD_MODAL_PRESET.overlayClass}"></div>
      <div class="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="px-6 pt-6 pb-4 flex justify-between items-center border-b border-gray-50">
          <h3 id="modal-title" class="text-lg font-medium text-gray-900">${escapeHtml(title)}</h3>
          <button id="close-modal" class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hidden">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Name</label>
            <input id="modal-conn-name" type="text" value="${escapeHtml(resolvedName)}" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="e.g. ${escapeHtml(adminProviderDisplayLabel(providerType))}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
          </div>

          <div class="space-y-1">
            <label id="modal-conn-url-label" class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">${escapeHtml(resolveUrlLabel(providerType))}</label>
            <div class="flex items-center gap-2">
              <input id="modal-conn-url" type="text" value="${escapeHtml(resolvedUrl)}" class="flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400${disabledControlClass}" placeholder="${escapeHtml(adminProviderUrlPlaceholder(providerType))}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
              <button id="test-connection" class="p-1 text-gray-400 hover:text-gray-600${testHiddenClass}${disabledControlClass}" title="Test connection"${disabledAttr}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>
                </svg>
              </button>
            </div>
            <div id="connection-test-message" class="text-[11px] text-gray-400${testHiddenClass}"${testMessageAttrs}></div>
            <div id="modal-conn-url-hint" class="text-[11px] text-gray-400">${isCompatibleProviderType(providerType) ? 'Required for compatible providers.' : 'Uses the built-in default if left blank.'}</div>
          </div>

          <div class="space-y-1">
            <label id="modal-conn-key-label" class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">${escapeHtml(resolveKeyLabel())}</label>
            <div class="flex items-center gap-3">
              <div class="flex-1 relative">
                <input id="modal-conn-key" type="password" value="" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 pr-8${disabledControlClass}" placeholder="${hasKey ? 'Leave blank to keep current key' : 'Enter API key'}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
                <button id="toggle-key-visibility" class="absolute right-0 top-1/2 -translate-y-1/2 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600${disabledControlClass}" aria-label="Show key"${disabledAttr}>
                  <span data-password-toggle-label>Show</span>
                </button>
              </div>
            </div>
            <div class="mt-1 text-[11px] text-gray-400">${hasKey ? 'A key is already saved. Leave this blank to keep it.' : 'Optional for providers that do not require a key.'}</div>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Headers</label>
            <textarea id="modal-conn-headers" class="w-full bg-transparent border-none outline-none py-0.5 text-sm text-gray-900 placeholder-gray-400 min-h-[60px] resize-none${disabledControlClass}" placeholder="Enter additional headers in JSON format" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>${escapeHtml(resolvedHeaders)}</textarea>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Provider Type</label>
              <select id="modal-conn-provider" class="w-full bg-transparent border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900${disabledControlClass}"${disabledAttr}>
                <option value="openai"${providerType === 'openai' ? ' selected' : ''}>OpenAI</option>
                <option value="openai-compatible"${providerType === 'openai-compatible' ? ' selected' : ''}>OpenAI Compatible</option>
                <option value="google"${providerType === 'google' ? ' selected' : ''}>Gemini</option>
                <option value="gemini-compatible"${providerType === 'gemini-compatible' ? ' selected' : ''}>Gemini Compatible</option>
                <option value="anthropic"${providerType === 'anthropic' ? ' selected' : ''}>Claude</option>
                <option value="claude-compatible"${providerType === 'claude-compatible' ? ' selected' : ''}>Claude Compatible</option>
              </select>
              <div id="modal-conn-provider-hint" class="text-[11px] text-gray-400">${escapeHtml(adminProviderDisplayLabel(providerType))}</div>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-gray-600 uppercase tracking-wider">API Type</label>
              <div id="modal-conn-api-type-label" class="text-sm text-gray-900">${escapeHtml(apiType.label)}</div>
              <div id="modal-conn-api-type-hint" class="text-[11px] text-gray-400">${escapeHtml(apiType.endpoint)}</div>
            </div>
          </div>

          <div class="space-y-2" id="modal-models-section">
            <div class="flex items-center justify-between">
              <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Models</label>
              <div class="flex items-center gap-2 text-[11px] text-gray-600">
                <button type="button" id="modal-models-select-all" class="px-2 py-1 rounded-md hover:bg-gray-50">All</button>
                <button type="button" id="modal-models-select-none" class="px-2 py-1 rounded-md hover:bg-gray-50">None</button>
              </div>
            </div>
            <div class="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"></path>
              </svg>
              <input id="modal-models-search" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Search models" value="" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
            </div>
            <div class="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-3 py-2${manualModelsHiddenClass}">
              <input id="modal-manual-model-id" class="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 outline-none${disabledControlClass}" placeholder="Add model manually" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"${disabledAttr}>
              <button id="modal-manual-model-add" class="shrink-0 rounded-full bg-black px-3 py-1 text-[11px] font-medium text-white hover:bg-gray-900 transition${disabledControlClass}"${disabledAttr}>Add</button>
            </div>
            <div id="modal-models-list" class="rounded-2xl border border-gray-100 bg-white max-h-48 overflow-y-auto scrollbar-hidden text-sm">${modelListMarkup}</div>
            <div id="modal-models-status" class="text-[11px] text-gray-600"></div>
          </div>
        </div>

        <div class="px-6 py-6 flex justify-end gap-3 border-t border-gray-50">
          <button type="button" id="delete-connection"${deleteButtonAttrs} class="px-5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition rounded-full${deleteHiddenClass}${disabledControlClass}"${canManage ? '' : ' disabled'}>Delete</button>
          <button type="button" id="save-modal"${saveButtonAttrs} class="px-5 py-1.5 text-sm font-medium text-white bg-black hover:bg-gray-900 transition rounded-full${disabledControlClass}"${canManage ? '' : ' disabled'}>Save</button>
        </div>
      </div>
    </div>
  `;
}
