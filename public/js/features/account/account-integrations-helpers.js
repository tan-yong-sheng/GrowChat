/**
 * Helper functions for the account integrations section.
 */
import { escapeHtml } from '../../shared/utils/dom-escape.js';
import { renderStatusBadge } from '../../shared/components/status-badge.js';
import { clonePreferences as clonePreferencesImpl } from '../../shared/utils/clone-preferences.js';
import { updateToolToggle } from '../../shared/components/tool-toggle.js';
import { buildMcpServerModalMarkup } from '../../shared/components/server-modal.js';
import { renderLoadingSkeleton } from '../admin/settings/acl-modal-shared.js';
import { prepareToolPreview } from '../../shared/components/tool-preview.js';

export { clonePreferencesImpl as clonePreferences };
// Re-export so existing callers don't need to change.
export { renderLoadingSkeleton, updateToolToggle };

function pickFirstPresentString(tool, keys) {
  for (const key of keys) {
    const value = tool && tool[key];
    if (value) return String(value).trim();
  }
  return '';
}

function pickToolObject(tool, keys) {
  for (const key of keys) {
    const value = tool && tool[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return undefined;
}

function isToolFlagEnabled(tool, key) {
  return (tool && tool[key]) !== false;
}

export function normalizeTool(tool = {}) {
  const name = pickFirstPresentString(tool, ['name', 'id', 'title']);
  if (!name) return null;
  const title = pickFirstPresentString(tool, ['title', 'name']) || name;
  const parameters = pickToolObject(tool, ['parameters', 'inputSchema']);
  return {
    name,
    title,
    description: pickFirstPresentString(tool, ['description']),
    parameters,
    enabled: isToolFlagEnabled(tool, 'enabled'),
    visible_for_user: isToolFlagEnabled(tool, 'visible_for_user'),
    hidden_for_user: tool && tool.hidden_for_user === true,
    _expanded: Boolean(tool._expanded),
  };
}

export function normalizeToolList(tools = []) {
  return (Array.isArray(tools) ? tools : []).map(normalizeTool).filter(Boolean);
}

function normalizeServerHeaders(server) {
  return server.headers && typeof server.headers === 'object' && !Array.isArray(server.headers)
    ? server.headers
    : server.headers || '';
}

function normalizeServerId(server) {
  return String(server.id || '').trim();
}

function normalizeServerName(server) {
  return String(server.name || server.id || '').trim();
}

function normalizeServerUrl(server) {
  return String(server.url || '').trim();
}

function normalizeServerAuthField(server, field) {
  return String(server[field] || '').trim();
}

function normalizeServerOAuthField(server, field) {
  return String(server[field] || '').trim();
}

function normalizeServerNote(server) {
  return String(server.note || server.url || '').trim();
}

function normalizeServerTools(server) {
  return normalizeToolList(server.tools);
}

export function normalizeServer(server = {}) {
  return {
    id: normalizeServerId(server),
    name: normalizeServerName(server),
    url: normalizeServerUrl(server),
    headers: normalizeServerHeaders(server),
    enabled: server.enabled !== false,
    auth_type: String(server.auth_type || 'none').toLowerCase(),
    auth_bearer_token: normalizeServerAuthField(server, 'auth_bearer_token'),
    auth_basic_username: normalizeServerAuthField(server, 'auth_basic_username'),
    auth_basic_password: normalizeServerAuthField(server, 'auth_basic_password'),
    oauth_client_name: normalizeServerOAuthField(server, 'oauth_client_name'),
    oauth_scope: normalizeServerOAuthField(server, 'oauth_scope'),
    oauth_client_id: normalizeServerOAuthField(server, 'oauth_client_id'),
    oauth_client_secret: normalizeServerOAuthField(server, 'oauth_client_secret'),
    oauth_token_auth_method: normalizeServerOAuthField(server, 'oauth_token_auth_method'),
    note: normalizeServerNote(server),
    oauth_connected: Boolean(server.oauth_connected),
    oauth_connected_at: server.oauth_connected_at || null,
    tools: normalizeServerTools(server),
    toolsExpanded: Boolean(server.toolsExpanded),
    toolsError: String(server.toolsError || '').trim(),
    visible_for_user: server.visible_for_user !== false,
    hidden_for_user: server.hidden_for_user === true,
  };
}

export function shouldShowAuthField(authType, fieldType) {
  return String(authType || 'none').toLowerCase() === fieldType;
}

export function buildFormMarkup(server = null, modalMode = 'create', canManage = true) {
  return buildMcpServerModalMarkup({
    rootId: 'account-integration-modal',
    server,
    isVisible: true,
    modalMode,
    canManage,
  });
}

export function buildListCard(
  server,
  canManageToolServers = true,
  { scope = 'personal', hiddenForUser = false } = {}
) {
  const serverEnabled = server.enabled !== false;
  const tools = Array.isArray(server.tools) ? server.tools : [];
  const visibleTools = tools.filter(
    (tool) => tool.enabled !== false && tool.visible_for_user !== false
  );
  const totalCount = tools.filter((tool) => tool.enabled !== false).length;
  const enabledCount = visibleTools.length;
  const actionButtonClass = canManageToolServers
    ? 'p-1 text-gray-600 hover:text-gray-700 transition-colors'
    : 'p-1 text-gray-300 opacity-50 cursor-not-allowed';
  const isShared = scope === 'shared';
  const sharedToggleClass =
    'relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none';
  const toggleClass =
    canManageToolServers || isShared
      ? `relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${serverEnabled ? 'bg-primary' : 'bg-gray-200'}`
      : 'relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-gray-200 opacity-50';
  const toggleOn = isShared ? !hiddenForUser : serverEnabled;
  const toggleLabel = isShared
    ? hiddenForUser
      ? 'Show for me'
      : 'Hide for me'
    : serverEnabled
      ? 'Disable server'
      : 'Enable server';
  const toolRows = tools.map((tool) => {
    const { description, preview, hasMore, isExpanded } = prepareToolPreview(tool);
    const toolEnabled = tool.enabled !== false;
    if (isShared) {
      const toolVisible = tool.visible_for_user !== false;
      const canToggleVisibility = tool.enabled !== false;
      return `
        <div class="rounded-md border border-gray-100 px-3 py-2 ${toolVisible ? 'bg-white' : 'bg-gray-50/60 opacity-75'}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs font-medium text-gray-900">${escapeHtml(tool.title || tool.name || 'Tool')}</div>
              <div class="text-label-sm text-gray-600 font-mono">${escapeHtml(tool.name || '')}</div>
            </div>
            <button
              type="button"
              data-tool-toggle-scope="shared"
              data-server-id="${escapeHtml(server.id)}"
              data-tool-name="${escapeHtml(tool.name || '')}"
              aria-pressed="${toolVisible ? 'true' : 'false'}"
              aria-label="${escapeHtml(toolVisible ? 'Hide for me' : 'Show for me')}"
              title="${escapeHtml(toolVisible ? 'Hide for me' : 'Show for me')}"
              class="relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${toolVisible ? 'bg-primary' : 'bg-gray-200'} ${canToggleVisibility ? '' : 'opacity-40 cursor-not-allowed'}"
              ${canToggleVisibility ? '' : 'disabled aria-disabled="true"'}
            >
              <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toolVisible ? 'translate-x-4' : 'translate-x-0'}"></span>
            </button>
          </div>
          ${description ? `<div class="text-label-sm text-gray-600 mt-1">${escapeHtml(preview)}</div>` : ''}
        </div>
      `;
    }
    return `
      <div class="rounded-md border border-gray-100 px-3 py-2 ${serverEnabled ? '' : 'bg-gray-50/70'}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-medium text-gray-900">${escapeHtml(tool.title || tool.name || 'Tool')}</div>
            <div class="text-label-sm text-gray-600 font-mono">${escapeHtml(tool.name || '')}</div>
          </div>
          <button
            data-server-id="${escapeHtml(server.id)}"
            data-tool-name="${escapeHtml(tool.name || '')}"
            class="tool-toggle relative inline-flex h-6 w-11 sm:h-5 sm:w-9 items-center shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${toolEnabled ? 'bg-primary' : 'bg-gray-200'} ${serverEnabled && canManageToolServers ? '' : 'opacity-40 cursor-not-allowed'}"
            ${serverEnabled && canManageToolServers ? '' : 'disabled aria-disabled="true"'}
            aria-pressed="${toolEnabled ? 'true' : 'false'}"
            aria-disabled="${serverEnabled && canManageToolServers ? 'false' : 'true'}"
            title="${serverEnabled && canManageToolServers ? (toolEnabled ? 'Disable tool' : 'Enable tool') : 'Enable the server to edit tools'}"
          >
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toolEnabled ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
        </div>
        ${
          description
            ? `
          <div class="text-label-sm text-gray-700 mt-1">${escapeHtml(preview)}</div>
          ${hasMore ? `<button data-server-id="${escapeHtml(server.id)}" data-tool-name="${escapeHtml(tool.name || '')}" class="tool-desc-toggle text-label-sm text-gray-600 hover:text-gray-700 mt-1">${isExpanded ? 'Less' : 'More'}</button>` : ''}
        `
            : ''
        }
      </div>
    `;
  });
  return `
    <div data-tool-server-row="${escapeHtml(server.id)}" data-id="${escapeHtml(server.id)}" class="border-b border-gray-50 last:border-0 ${serverEnabled ? '' : 'opacity-70'} ${isShared && hiddenForUser ? 'opacity-70' : ''}">
      <div class="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pr-2">
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-xs font-medium text-gray-900">${escapeHtml(server.name || server.id || 'Integration')}</div>
            ${renderStatusBadge({ text: isShared ? 'Shared' : 'Personal', tone: isShared ? 'gray' : 'green' }).trim()}
            <span data-server-disabled-badge class="inline-flex items-center rounded-full border px-1.5 py-0.5 text-label-xs font-semibold uppercase tracking-wide ${serverEnabled ? 'hidden' : ''} border-gray-200 bg-gray-100 text-gray-700">Disabled</span>
          </div>
          <div class="text-label-sm text-gray-600 font-mono">${escapeHtml(server.url || '')}</div>
          <div class="text-label-sm text-gray-600 mt-1">
            Tools: <span class="text-gray-900">${serverEnabled ? enabledCount : 0}</span> / <span class="text-gray-900">${totalCount}</span> ${serverEnabled ? 'enabled' : 'available'}
            ${server.toolsError ? '<span class="text-red-500 ml-2">Last verify failed</span>' : ''}
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 self-end sm:self-auto flex-wrap">
          ${
            !isShared
              ? `
            <button
              type="button"
              data-list-action="edit"
              data-account-integration-edit="${escapeHtml(server.id)}"
              class="${actionButtonClass}"
              ${canManageToolServers ? '' : 'disabled aria-disabled="true"'}
            >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.59c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.75 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.59c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          `
              : ''
          }
          <button data-id="${escapeHtml(server.id)}" data-toggle-scope="${scope}" class="server-toggle ${isShared ? `${sharedToggleClass} ${toggleOn ? 'bg-primary' : 'bg-gray-200'}` : toggleClass}" ${isShared || canManageToolServers ? '' : 'disabled aria-disabled="true"'} aria-pressed="${toggleOn ? 'true' : 'false'}" aria-label="${escapeHtml(toggleLabel)}">
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${toggleOn ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
          ${
            tools.length
              ? `
            <button data-id="${escapeHtml(server.id)}" class="tools-toggle p-1 text-gray-600 hover:text-gray-700 transition-colors ml-1" title="Toggle tools">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4 ${server.toolsExpanded ? 'rotate-180' : ''}">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          `
              : ''
          }
        </div>
      </div>
      ${
        tools.length
          ? `
        <div class="px-2 pb-3 ${server.toolsExpanded ? '' : 'hidden'}">
          ${server.toolsError ? `<div class="text-label-sm text-red-500 mb-2">${escapeHtml(server.toolsError)}</div>` : ''}
          <div class="space-y-2">
            ${toolRows.join('')}
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;
}
