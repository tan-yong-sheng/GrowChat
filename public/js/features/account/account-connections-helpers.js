/**
 * Helper functions for the account connections section.
 */
import { escapeHtml } from '../../shared/utils/dom-escape.js';
import { renderStatusBadge } from '../../shared/components/status-badge.js';
import { normalizeConnectionModelSelectionMode } from '../../shared/utils/connection-model-selection.js';

export function normalizeProviderType(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() || 'openai-compatible'
  );
}

export function providerDisplayLabel(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'openai':
    case 'openai-compatible':
      return 'OpenAI Compatible';
    case 'anthropic':
    case 'claude-compatible':
      return 'Claude Compatible';
    case 'google':
    case 'gemini-compatible':
      return 'Gemini Compatible';
    default:
      return 'OpenAI Compatible';
  }
}

export function providerUrlPlaceholder(providerType) {
  switch (normalizeProviderType(providerType)) {
    case 'anthropic':
    case 'claude-compatible':
      return 'https://api.anthropic.com/v1';
    case 'google':
    case 'gemini-compatible':
      return 'https://generativelanguage.googleapis.com/v1beta';
    default:
      return 'https://api.openai.com/v1';
  }
}

export function normalizePersonalConnection(connection = {}) {
  const headers =
    connection.headers &&
    typeof connection.headers === 'object' &&
    !Array.isArray(connection.headers)
      ? connection.headers
      : {};
  return {
    id: String(connection.id || '').trim(),
    name: String(connection.name || connection.id || '').trim(),
    provider_type: normalizeProviderType(
      connection.provider_type || connection.providerType || 'openai-compatible'
    ),
    provider_family:
      String(connection.provider_family || connection.providerFamily || 'openai')
        .trim()
        .toLowerCase() || 'openai',
    base_url: String(connection.base_url || connection.baseUrl || '').trim(),
    auth_type: String(connection.auth_type || connection.authType || '')
      .trim()
      .toLowerCase(),
    enabled: connection.enabled !== false,
    has_key:
      connection.has_key !== undefined
        ? Boolean(connection.has_key)
        : Boolean(String(connection.key || '').trim()),
    manualModelsMode:
      normalizeConnectionModelSelectionMode(
        connection.manual_models_mode || connection.manualModelsMode
      ) || 'all',
    headers,
    manual_models: Array.isArray(connection.manual_models || connection.manualModels)
      ? [...(connection.manual_models || connection.manualModels)]
      : [],
    note: connection.note || connection.base_url || connection.baseUrl || '',
  };
}

export function clonePreferences(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(source);
    } catch {
      return { ...source };
    }
  }
  try {
    return JSON.parse(JSON.stringify(source));
  } catch {
    return { ...source };
  }
}

export function formatHeadersValue(headers) {
  if (
    !headers ||
    typeof headers !== 'object' ||
    Array.isArray(headers) ||
    !Object.keys(headers).length
  ) {
    return '';
  }
  try {
    return JSON.stringify(headers, null, 2);
  } catch {
    return '';
  }
}

export function renderSummaryPill(text, tone = 'gray') {
  return renderStatusBadge({ text: escapeHtml(text), tone }).trim();
}

export function buildListCard(connection, canManageConnections = true) {
  const providerLabel = connection.provider_label || providerDisplayLabel(connection.provider_type);
  const baseUrl = connection.base_url || connection.note || '';
  const readOnlyText = connection.readOnly ? connection.readOnlyLabel || 'Shared from admin' : '';
  const actionButtonClass = canManageConnections
    ? 'p-1 text-gray-400 hover:text-gray-600 transition-colors'
    : 'p-1 text-gray-300 opacity-50 cursor-not-allowed';
  const toggleClass = canManageConnections
    ? `relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${connection.enabled === false ? 'bg-gray-200' : 'bg-primary'}`
    : 'relative inline-flex h-5 w-9 items-center shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-200 opacity-50';
  return `
    <div data-connection-row="${escapeHtml(connection.id)}" data-id="${escapeHtml(connection.id)}" class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2 border-b border-gray-50 last:border-0 ${connection.enabled === false ? 'opacity-70' : ''}">
      <div class="flex flex-col min-w-0">
        <div class="flex items-center gap-2">
          <div class="text-xs font-medium text-gray-900">${escapeHtml(connection.name || providerLabel)}</div>
          ${renderSummaryPill('Personal', 'green')}
        </div>
        <div class="text-label-sm text-gray-500 font-mono">${escapeHtml(baseUrl)}</div>
        <div class="text-label-sm text-gray-500 mt-0.5">${escapeHtml(providerLabel)}</div>
        <div class="mt-0.5 inline-flex w-fit items-center rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-label-xs font-semibold uppercase tracking-wide text-gray-500 ${connection.enabled === false ? '' : 'hidden'}">Disabled</div>
        ${readOnlyText ? `<div class="text-label-sm text-gray-500 mt-0.5">${escapeHtml(readOnlyText)}</div>` : ''}
      </div>
      <div class="flex items-center justify-end gap-3 self-end sm:self-auto flex-wrap">
        <button
          type="button"
          data-list-action="edit"
          data-account-connection-edit="${escapeHtml(connection.id)}"
          class="${actionButtonClass}"
          ${canManageConnections ? '' : 'disabled aria-disabled="true"'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
        <button data-id="${escapeHtml(connection.id)}" class="connection-toggle ${toggleClass}" ${canManageConnections ? '' : 'disabled aria-disabled="true"'}>
          <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${connection.enabled === false ? 'translate-x-0' : 'translate-x-4'}"></span>
        </button>
      </div>
    </div>
  `;
}

export function buildAccessibleCard(connection, hiddenForUser = false) {
  const toggleClass = `relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${hiddenForUser ? 'bg-gray-200' : 'bg-primary'}`;
  return `
    <div data-connection-row="${escapeHtml(connection.id)}" data-id="${escapeHtml(connection.id)}" class="py-2.5 border-b border-gray-50 last:border-0 ${hiddenForUser ? 'opacity-70' : ''}">
      <div class="flex items-center gap-2">
        <div class="truncate text-sm font-semibold text-gray-900">${escapeHtml(connection.name || connection.id || 'Connection')}</div>
        ${renderSummaryPill('Shared', 'gray')}
        ${hiddenForUser ? renderSummaryPill('Hidden for you', 'amber') : ''}
      </div>
      <div class="mt-1 truncate text-xs text-gray-500">${escapeHtml(connection.note || connection.base_url || '')}</div>
      <div class="mt-2 flex items-center justify-end">
        <button data-id="${escapeHtml(connection.id)}" data-toggle-scope="shared" class="connection-toggle ${toggleClass}" aria-pressed="${hiddenForUser ? 'false' : 'true'}" aria-label="${hiddenForUser ? 'Show for me' : 'Hide for me'}">
          <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${hiddenForUser ? 'translate-x-0' : 'translate-x-4'}"></span>
        </button>
      </div>
    </div>
  `;
}
