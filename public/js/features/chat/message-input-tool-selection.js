/**
 * Tool selection controller for the message input.
 * Manages MCP tool server selection state, rendering, and interaction.
 */

import { state } from '../../shared/store.js';
import { escapeHtml } from '../../shared/utils.js';

export function createToolSelectionController({
  toolsMenu,
  toolsMenuAllOnBtn,
  toolsMenuAllOffBtn,
  toolsMenuList,
  openToolsBtn,
  setState,
}) {
  let expandedToolServerIds = new Set();

  function buildToolKey(serverId, toolName) {
    const safeName = String(toolName || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `mcp__${serverId}__${safeName}`;
  }

  function getToolServerScopeLabel(server) {
    const source = String(server?.source || '')
      .trim()
      .toLowerCase();
    const accessVariant = String(server?.access_variant || '')
      .trim()
      .toLowerCase();
    const accessLabel = String(server?.access_label || '')
      .trim()
      .toLowerCase();
    if (source === 'user' || accessVariant === 'personal' || accessLabel === 'personal') {
      return 'Personal';
    }
    return 'Shared';
  }

  function getToolServerScopeBadgeClass(server) {
    const label = getToolServerScopeLabel(server);
    return label === 'Personal'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : 'border-gray-200 bg-gray-50 text-gray-500';
  }

  function getAllowedToolServers(currentState = state) {
    return (Array.isArray(currentState.toolServers) ? currentState.toolServers : [])
      .filter(
        (server) =>
          server?.enabled !== false &&
          String(server?.id || '').trim() &&
          String(server?.name || '').trim()
      )
      .map((server) => ({
        ...server,
        tools: (Array.isArray(server.tools) ? server.tools : [])
          .filter(
            (tool) =>
              tool?.enabled !== false &&
              tool?.visible_for_user !== false &&
              String(tool?.name || '').trim()
          )
          .map((tool) => ({
            ...tool,
            name: String(tool.name || '').trim(),
            title: String(tool.title || '').trim(),
            description: String(tool.description || '').trim(),
          })),
      }))
      .filter((server) => server.tools.length > 0);
  }

  function getAllowedToolKeys(currentState = state) {
    return getAllowedToolServers(currentState).flatMap((server) =>
      server.tools.map((tool) => buildToolKey(server.id, tool.name))
    );
  }

  function getServerToolKeys(server) {
    return (Array.isArray(server?.tools) ? server.tools : [])
      .map((tool) => buildToolKey(server.id, tool.name))
      .filter(Boolean);
  }

  function getCurrentToolSelection(currentState = state) {
    const chatId = currentState.activeChatId;
    if (chatId) {
      const stored = currentState.toolSelectionsByChat?.[chatId];
      return stored === undefined ? null : stored;
    }
    return currentState.newChatToolSelection;
  }

  function getServerSelectionState(server, selection = getCurrentToolSelection()) {
    const keys = getServerToolKeys(server);
    if (!keys.length) return { enabled: false, partial: false };
    if (selection === null) return { enabled: true, partial: false };
    const selected = new Set(Array.isArray(selection) ? selection : []);
    let selectedCount = 0;
    for (const key of keys) {
      if (selected.has(key)) selectedCount += 1;
    }
    return {
      enabled: selectedCount === keys.length,
      partial: selectedCount > 0 && selectedCount < keys.length,
    };
  }

  function setCurrentToolSelection(nextSelection, currentState = state) {
    const chatId = currentState.activeChatId;
    const normalized = Array.isArray(nextSelection) ? nextSelection.filter(Boolean) : null;
    if (chatId) {
      setState((prev) => {
        const nextMap = { ...(prev.toolSelectionsByChat || {}) };
        if (normalized === null) {
          delete nextMap[chatId];
        } else {
          nextMap[chatId] = normalized;
        }
        return { toolSelectionsByChat: nextMap };
      });
      return;
    }
    setState({ newChatToolSelection: normalized });
  }

  function setToolSelectionForCurrentChat(serverId, toolName) {
    const currentState = state;
    const allowedKeys = getAllowedToolKeys(currentState);
    const key = buildToolKey(serverId, toolName);
    const selection = getCurrentToolSelection(currentState);
    let nextSelection;
    if (selection === null) {
      nextSelection = allowedKeys.filter((item) => item !== key);
    } else {
      const nextSet = new Set(selection);
      if (nextSet.has(key)) {
        nextSet.delete(key);
      } else {
        nextSet.add(key);
      }
      const deduped = [...nextSet];
      nextSelection =
        allowedKeys.length > 0 && allowedKeys.every((allowed) => nextSet.has(allowed))
          ? null
          : deduped;
    }
    if (Array.isArray(nextSelection) && nextSelection.length === 0) {
      nextSelection = [];
    }
    setCurrentToolSelection(nextSelection, currentState);
    renderToolsMenu();
  }

  function setServerSelectionForCurrentChat(serverId, enabled) {
    const currentState = state;
    const servers = getAllowedToolServers(currentState);
    const server = servers.find((entry) => String(entry.id) === String(serverId));
    if (!server) return;
    const serverKeys = getServerToolKeys(server);
    if (!serverKeys.length) return;
    const allowedKeys = getAllowedToolKeys(currentState);
    const selection = getCurrentToolSelection(currentState);
    let nextSelection;
    if (enabled) {
      if (selection === null) {
        nextSelection = null;
      } else {
        const nextSet = new Set(Array.isArray(selection) ? selection : []);
        for (const key of serverKeys) nextSet.add(key);
        nextSelection =
          allowedKeys.length > 0 && allowedKeys.every((allowed) => nextSet.has(allowed))
            ? null
            : [...nextSet];
      }
    } else if (selection === null) {
      nextSelection = allowedKeys.filter((key) => !serverKeys.includes(key));
    } else {
      nextSelection = (Array.isArray(selection) ? selection : []).filter(
        (key) => !serverKeys.includes(key)
      );
    }
    if (Array.isArray(nextSelection) && nextSelection.length === 0) {
      nextSelection = [];
    }
    setCurrentToolSelection(nextSelection, currentState);
    renderToolsMenu();
  }

  function setAllToolSelectionsForCurrentChat(enabled) {
    const currentState = state;
    const servers = getAllowedToolServers(currentState);
    if (!servers.length) return;
    setCurrentToolSelection(enabled ? null : [], currentState);
    renderToolsMenu();
  }

  function toggleToolServerExpansion(serverId) {
    const id = String(serverId || '').trim();
    if (!id) return;
    const next = new Set(expandedToolServerIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedToolServerIds = next;
    renderToolsMenu();
  }

  function renderToolsMenu(currentState = state) {
    if (!toolsMenu || !toolsMenuList) return;
    const servers = getAllowedToolServers(currentState);
    const selection = getCurrentToolSelection(currentState);
    const allowedKeys = servers.flatMap((server) =>
      server.tools.map((tool) => buildToolKey(server.id, tool.name))
    );
    if (!servers.length) {
      toolsMenuList.innerHTML =
        '<div class="px-3 py-4 text-sm text-gray-400">No tools are enabled for this workspace.</div>';
      return;
    }
    toolsMenuList.innerHTML = servers
      .map((server) => {
        const serverId = String(server.id || '');
        const serverExpanded = expandedToolServerIds.has(serverId);
        const selectionState = getServerSelectionState(server, selection);
        const anyEnabled = selectionState.enabled || selectionState.partial;
        const selectedSet =
          selection === null
            ? new Set(allowedKeys)
            : new Set(Array.isArray(selection) ? selection : []);
        const enabledToolCount = server.tools.length;
        const scopeLabel = getToolServerScopeLabel(server);
        const scopeBadgeClass = getToolServerScopeBadgeClass(server);
        const toolRows = server.tools
          .map((tool) => {
            const key = buildToolKey(server.id, tool.name);
            const enabled = selectedSet.has(key);
            return `
          <button type="button" data-tool-toggle data-tool-server-id="${escapeHtml(server.id)}" data-tool-name="${escapeHtml(tool.name)}" aria-pressed="${enabled ? 'true' : 'false'}" class="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50">
            <span class="min-w-0 flex-1 truncate">${escapeHtml(tool.title || tool.name)}</span>
            <span class="ml-3 inline-flex h-5 w-9 items-center rounded-full px-0.5 transition ${enabled ? 'bg-emerald-500' : 'bg-gray-200'}" aria-hidden="true">
              <span class="h-4 w-4 rounded-full bg-white shadow-sm transition ${enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
            </span>
          </button>
        `;
          })
          .join('');
        return `
        <section class="rounded-2xl border border-gray-100 bg-white overflow-hidden" data-tool-server-card data-tool-server-id="${escapeHtml(server.id)}">
          <div class="flex items-center gap-2 px-2 py-1.5">
            <button type="button" data-tool-server-toggle data-tool-server-id="${escapeHtml(server.id)}" aria-pressed="${anyEnabled ? 'true' : 'false'}" aria-label="${anyEnabled ? 'Disable' : 'Enable'} ${escapeHtml(server.name)}" title="${anyEnabled ? 'Disable' : 'Enable'} ${escapeHtml(server.name)}" class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full p-0.5 transition ${anyEnabled ? 'bg-emerald-500' : 'bg-gray-200'}">
              <span class="h-4 w-4 rounded-full bg-white shadow-sm transition ${anyEnabled ? 'translate-x-4' : 'translate-x-0'}" aria-hidden="true"></span>
            </button>
            <button type="button" data-tool-server-expand data-tool-server-id="${escapeHtml(server.id)}" class="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-2 py-2 text-left hover:bg-gray-50 transition">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <div class="min-w-0 text-sm font-medium text-gray-900 truncate">${escapeHtml(server.name)}</div>
                  <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scopeBadgeClass}">${escapeHtml(scopeLabel)}</span>
                </div>
                <div class="text-xs text-gray-400">${enabledToolCount} tool${enabledToolCount === 1 ? '' : 's'}</div>
              </div>
              <i class="bi ${serverExpanded ? 'bi-chevron-down' : 'bi-chevron-right'} text-gray-400 text-sm leading-none flex-shrink-0" aria-hidden="true"></i>
            </button>
          </div>
          <div class="${serverExpanded ? '' : 'hidden'} px-2 pb-2">
            <div class="space-y-1">
              ${toolRows}
            </div>
          </div>
        </section>
      `;
      })
      .join('');
  }

  const closeToolsMenu = () => {
    if (!toolsMenu || !openToolsBtn) return;
    toolsMenu.classList.add('hidden');
    openToolsBtn.setAttribute('aria-expanded', 'false');
    expandedToolServerIds = new Set();
  };

  const openToolsMenu = () => {
    if (!toolsMenu || !openToolsBtn || openToolsBtn.disabled) return;
    toolsMenu.classList.remove('hidden');
    openToolsBtn.setAttribute('aria-expanded', 'true');
    renderToolsMenu();
  };

  function updateToolControls(currentState) {
    if (!openToolsBtn) return;
    const servers = getAllowedToolServers(currentState);
    const hasAny = servers.length > 0 && hasSelectableModels(currentState);
    const loading = currentState.toolServersLoading === true;
    const selection = getCurrentToolSelection(currentState);
    const allowedKeys = servers.flatMap((server) =>
      server.tools.map((tool) => buildToolKey(server.id, tool.name))
    );
    const allEnabled =
      selection === null ||
      (Array.isArray(selection) &&
        allowedKeys.length > 0 &&
        allowedKeys.every((key) => selection.includes(key)));
    const allDisabled = Array.isArray(selection) && selection.length === 0;
    openToolsBtn.disabled = loading || !hasAny;
    openToolsBtn.classList.toggle('opacity-40', loading || !hasAny);
    openToolsBtn.classList.toggle('cursor-not-allowed', loading || !hasAny);
    if (toolsMenuAllOnBtn) {
      toolsMenuAllOnBtn.disabled = loading || !hasAny;
      toolsMenuAllOnBtn.classList.toggle('hidden', !hasAny || allEnabled);
      toolsMenuAllOnBtn.classList.toggle('opacity-40', loading || !hasAny);
      toolsMenuAllOnBtn.classList.toggle('cursor-not-allowed', loading || !hasAny);
    }
    if (toolsMenuAllOffBtn) {
      toolsMenuAllOffBtn.disabled = loading || !hasAny;
      toolsMenuAllOffBtn.classList.toggle('hidden', !hasAny || allDisabled);
      toolsMenuAllOffBtn.classList.toggle('opacity-40', loading || !hasAny);
      toolsMenuAllOffBtn.classList.toggle('cursor-not-allowed', loading || !hasAny);
    }
    if (!hasAny && !toolsMenu?.classList.contains('hidden')) {
      closeToolsMenu();
    }
    if (toolsMenu && !toolsMenu.classList.contains('hidden')) {
      renderToolsMenu(currentState);
    }
  }

  function hasSelectableModels(currentState = state) {
    if (currentState.modelsLoading) return true;
    return Array.isArray(currentState.models) && currentState.models.length > 0;
  }

  function bindToolsMenuEvents() {
    if (!toolsMenu) return;
    toolsMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const allOnBtn = e.target.closest?.('#tools-menu-all-on');
      if (allOnBtn) {
        setAllToolSelectionsForCurrentChat(true);
        return;
      }
      const allOffBtn = e.target.closest?.('#tools-menu-all-off');
      if (allOffBtn) {
        setAllToolSelectionsForCurrentChat(false);
        return;
      }
      const serverToggleBtn = e.target.closest?.('[data-tool-server-toggle]');
      if (serverToggleBtn) {
        const serverId = serverToggleBtn.getAttribute('data-tool-server-id');
        const server = getAllowedToolServers(state).find(
          (entry) => String(entry.id) === String(serverId)
        );
        if (serverId && server) {
          const selectionState = getServerSelectionState(server);
          const anyEnabled = selectionState.enabled || selectionState.partial;
          setServerSelectionForCurrentChat(serverId, !anyEnabled);
        }
        return;
      }
      const serverExpandBtn = e.target.closest?.('[data-tool-server-expand]');
      if (serverExpandBtn) {
        const serverId = serverExpandBtn.getAttribute('data-tool-server-id');
        if (serverId) {
          toggleToolServerExpansion(serverId);
        }
        return;
      }
      const toggleBtn = e.target.closest?.('[data-tool-toggle]');
      if (toggleBtn) {
        const serverId = toggleBtn.getAttribute('data-tool-server-id');
        const toolName = toggleBtn.getAttribute('data-tool-name');
        if (serverId && toolName) {
          setToolSelectionForCurrentChat(serverId, toolName);
        }
      }
    });
  }

  return {
    buildToolKey,
    getToolServerScopeLabel,
    getToolServerScopeBadgeClass,
    getAllowedToolServers,
    getAllowedToolKeys,
    getServerToolKeys,
    getCurrentToolSelection,
    getServerSelectionState,
    setCurrentToolSelection,
    setToolSelectionForCurrentChat,
    setServerSelectionForCurrentChat,
    setAllToolSelectionsForCurrentChat,
    toggleToolServerExpansion,
    renderToolsMenu,
    closeToolsMenu,
    openToolsMenu,
    updateToolControls,
    hasSelectableModels,
    bindToolsMenuEvents,
  };
}
