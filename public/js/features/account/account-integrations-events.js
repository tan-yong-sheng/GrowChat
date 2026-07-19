/* global openToolServerAccessModal, aclDraftRegistry */
/**
 * UI sync and event binding for the account integrations section.
 */
import {
  renderLoadingSkeleton,
  buildListCard,
  clonePreferences} from './account-integrations-helpers.js';
import { updateAllToolToggles } from '../../shared/components/integrations-shared.js';
import { broadcastToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import { updateUserMcpServer } from '../../shared/api/resources.js';
import {
  isResourceHidden,
  isToolHidden,
  setResourceVisibility,
  setToolVisibility,
  normalizeUserResourceOverrides} from '../../shared/utils/user-resource-overrides.js';
import { sortResourcesByEnabledThenVisibilityThenLabel } from '../../shared/utils/resource-sort.js';

export function createIntegrationsEvents(ctx) {
  const {
    container,
    sectionState,
    state,
    persistPreferences,
    footerHost,
    escapeSelector,
    canManageToolServers,
    canManageAcls} = ctx;

  const ensureMounted = () =>
    container.dataset.integrationsMounted === '1' &&
    Boolean(container.querySelector('#tool-servers-list'));

  const syncFeedback = () => {
    const feedback = container.querySelector('#integrations-feedback');
    if (!feedback) return;
    feedback.classList.toggle('hidden', !sectionState.error);
    feedback.textContent = sectionState.error || '';
    if (sectionState.error) {
      feedback.className =
        'rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600';
    }
  };

  const syncHeaderButtons = () => {
    const addBtn = container.querySelector('#add-tool-server');
    if (addBtn) {
      addBtn.classList.toggle('text-gray-300', !canManageToolServers);
      addBtn.classList.toggle('opacity-50', !canManageToolServers);
      addBtn.classList.toggle('cursor-not-allowed', !canManageToolServers);
      addBtn.disabled = !canManageToolServers;
      addBtn.setAttribute('aria-disabled', canManageToolServers ? 'false' : 'true');
    }
  };

  const syncListState = (serverId) => {
    const row = container.querySelector(`[data-tool-server-row="${escapeSelector(serverId)}"]`);
    const server =
      sectionState.servers.find((entry) => entry.id === serverId) ||
      sectionState.sharedServers.find((entry) => entry.id === serverId);
    if (!row || !server) return;
    const serverEnabled = server.enabled !== false;
    const isShared = row.querySelector('[data-toggle-scope="shared"]') !== null;
    applyRowFadedState(row, serverEnabled, isShared, serverId);
    applyDisabledBadgeVisibility(row, serverEnabled);
    applyAccessButtonVisibility(row, serverEnabled, canManageAcls, isShared);
    applyServerToggleState(row, serverEnabled, isShared, serverId);
    updateAllToolToggles(row, server, serverEnabled);
    applyToolsToggleRotation(row, server);
  };

  function applyRowFadedState(row, serverEnabled, isShared, serverId) {
    const isHiddenShared =
      isShared && isResourceHidden(state.settings?.preferences || {}, 'tool_servers', serverId);
    row.classList.toggle('opacity-70', !serverEnabled || isHiddenShared);
  }

  function applyDisabledBadgeVisibility(row, serverEnabled) {
    const badge = row.querySelector('[data-server-disabled-badge]');
    if (badge) badge.classList.toggle('hidden', serverEnabled);
  }

  function applyAccessButtonVisibility(row, serverEnabled, canManageAclsLocal, isShared) {
    const btn = row.querySelector('.tool-access-btn');
    if (!btn) return;
    const shouldHide = !serverEnabled || !canManageAclsLocal || isShared;
    btn.classList.toggle('hidden', shouldHide);
  }

  function applyServerToggleState(row, serverEnabled, isShared, serverId) {
    const toggle = row.querySelector('.server-toggle');
    if (!toggle) return;
    const toggleOn = isShared
      ? !isResourceHidden(state.settings?.preferences || {}, 'tool_servers', serverId)
      : serverEnabled;
    toggle.classList.toggle('bg-primary', toggleOn);
    toggle.classList.toggle('bg-gray-200', !toggleOn);
    toggle.setAttribute('aria-pressed', toggleOn ? 'true' : 'false');
    const knob = toggle.querySelector('span');
    if (knob) {
      knob.classList.toggle('translate-x-4', toggleOn);
      knob.classList.toggle('translate-x-0', !toggleOn);
    }
  }

  function applyToolsToggleRotation(row, server) {
    const toolsToggle = row.querySelector('.tools-toggle svg');
    if (toolsToggle) {
      toolsToggle.classList.toggle('rotate-180', Boolean(server.toolsExpanded));
    }
  }

  const syncListShell = () => {
    const list = container.querySelector('#tool-servers-list');
    if (!list) return;
    const normalizedOverrides = normalizeUserResourceOverrides(state.settings?.preferences);
    const hiddenSharedIds = new Set(normalizedOverrides.tool_servers.hidden_ids || []);
    const hiddenSharedToolIdsByServer = normalizedOverrides.tool_servers.tools || {};
    const sortedPersonalServers = sortResourcesByEnabledThenVisibilityThenLabel(
      sectionState.servers
    );
    const sortedSharedServers = sortResourcesByEnabledThenVisibilityThenLabel(
      sectionState.sharedServers
    );
    const personalMarkup = sectionState.loading
      ? renderLoadingSkeleton()
      : sortedPersonalServers.length
        ? sortedPersonalServers
            .map((server) => buildListCard(server, canManageToolServers))
            .join('')
        : '<div class="py-10 text-center text-sm text-gray-400">No tool servers configured. Click + to add one.</div>';
    const sharedMarkup = sortedSharedServers.length
      ? sortedSharedServers
          .map((server) => {
            const serverId = String(server.id || '').trim();
            const hiddenToolIds = new Set(
              hiddenSharedToolIdsByServer?.[serverId]?.hidden_ids || []
            );
            return buildListCard(
              {
                ...server,
                tools: (Array.isArray(server.tools) ? server.tools : []).map((tool) => ({
                  ...tool,
                  visible_for_user: !hiddenToolIds.has(String(tool?.name || '').trim()),
                  hidden_for_user: hiddenToolIds.has(String(tool?.name || '').trim())}))},
              canManageToolServers,
              {
                scope: 'shared',
                hiddenForUser: hiddenSharedIds.has(server.id)}
            );
          })
          .join('')
      : '';
    list.innerHTML = `${personalMarkup}${sharedMarkup ? `<div class="mt-3 space-y-2">${sharedMarkup}</div>` : ''}`;
  };

  const syncActionFooter = () => {
    if (!footerHost) return;
    footerHost.innerHTML = '';
  };

  function handleToolToggleShared(context, id, toolName) {
    const { state, sectionState, syncListShell, persistPreferences } = context;
    const previousPreferences = clonePreferences(state.settings?.preferences || {});
    const currentHidden = isToolHidden(state.settings?.preferences || {}, id, toolName);
    const nextPreferences = setToolVisibility(
      state.settings?.preferences || {},
      id,
      toolName,
      currentHidden
    );
    state.settings = {
      ...(state.settings || {}),
      preferences: nextPreferences};
    sectionState.error = '';
    syncListShell();
    void persistPreferences({
      rollback: { preferences: previousPreferences }});
  }

  function handleToolTogglePersonal(server, toolName, deps) {
    const { syncListState, syncActionFooter } = deps;
    const tool = server.tools.find((entry) => entry.name === toolName);
    if (!tool) return;
    const previousEnabled = tool.enabled !== false;
    const nextEnabled = !previousEnabled;
    tool.enabled = nextEnabled;
    syncListState();
    syncActionFooter();
    return previousEnabled;
  }

  async function callMcpUpdateAndRollback(server, toolName, previousEnabled, serverId, deps) {
    const { sectionState, syncListState, syncFeedback, syncActionFooter } = deps;
    try {
      await updateUserMcpServer(server.id, {
        tools: Array.isArray(server.tools)
          ? server.tools.map((entry) => ({
              ...entry,
              enabled: entry.name === toolName ? !previousEnabled : entry.enabled !== false}))
          : []});
      broadcastToolServersInvalidation();
    } catch (err) {
      sectionState.error = err?.message || 'Failed to update integration';
    } finally {
      syncListState(serverId);
      syncFeedback();
      syncActionFooter();
    }
  }

  const handleToolToggle = (toolToggle, target, deps) => {
    const {
      sectionState,
      canManageToolServers
    } = deps;
    void canManageToolServers;
    const id =
      toolToggle.dataset.serverId ||
      toolToggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
    const toolName = toolToggle.dataset.toolName;
    const scope = toolToggle.dataset.toolToggleScope || 'personal';

    if (scope === 'shared') {
      handleToolToggleShared(deps, id, toolName);
      return;
    }
    const server = sectionState.servers.find((entry) => entry.id === id);
    if (!server || server.enabled === false || !Array.isArray(server.tools)) return;
    const prevEnabled = handleToolTogglePersonal(server, toolName, deps);
    if (prevEnabled === undefined) return;
    void callMcpUpdateAndRollback(server, toolName, prevEnabled, server.id, deps);
  };

  const handleSharedServerToggle = (deps, id) => {
    const { state, syncListShell, persistPreferences, sectionState } = deps;
    const previousPreferences = clonePreferences(state.settings?.preferences || {});
    const currentHidden = isResourceHidden(state.settings?.preferences || {}, 'tool_servers', id);
    const nextVisible = currentHidden;
    const nextPreferences = setResourceVisibility(
      state.settings?.preferences || {},
      'tool_servers',
      id,
      nextVisible
    );
    state.settings = {
      ...(state.settings || {}),
      preferences: nextPreferences};
    sectionState.error = '';
    syncListShell();
    void persistPreferences({
      rollback: { preferences: previousPreferences }});
  };

  const runPersonalServerToggleUpdate = async (server, nextEnabled, deps) => {
    const { sectionState, syncListState, syncFeedback, syncActionFooter } = deps;
    try {
      await updateUserMcpServer(server.id, { enabled: nextEnabled });
      broadcastToolServersInvalidation();
    } catch (err) {
      server.enabled = !nextEnabled;
      sectionState.error = err?.message || 'Failed to update integration';
    } finally {
      syncListState(server.id);
      syncFeedback();
      syncActionFooter();
    }
  };

  const handlePersonalServerToggle = (deps, id, canManageToolServers) => {
    const { sectionState, syncListState, syncActionFooter } = deps;
    if (!canManageToolServers) return;
    const server = sectionState.servers.find((entry) => entry.id === id);
    if (!server) return;
    const previousEnabled = server.enabled !== false;
    const nextEnabled = !previousEnabled;
    server.enabled = nextEnabled;
    syncListState(id);
    syncActionFooter();
    void runPersonalServerToggleUpdate(server, nextEnabled, deps);
  };

  const handleServerToggle = (toggle, target, deps) => {
    void target;
    const { canManageToolServers } = deps;
    const id = toggle.dataset.id || toggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
    const scope = toggle.dataset.toggleScope || 'personal';
    if (scope === 'shared') {
      handleSharedServerToggle(deps, id);
      return;
    }
    handlePersonalServerToggle(deps, id, canManageToolServers);
  };

  const handleToolsExpandToggle = (toolsToggle, target, deps) => {
    void target;
    const { sectionState, syncListShell } = deps;
    const id =
      toolsToggle.dataset.id ||
      toolsToggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
    const server =
      sectionState.servers.find((entry) => entry.id === id) ||
      sectionState.sharedServers.find((entry) => entry.id === id);
    if (!server) return;
    server.toolsExpanded = !server.toolsExpanded;
    syncListShell();
  };

  const handleToolDescToggle = (descToggle, target, deps) => {
    void target;
    const { sectionState, syncListShell } = deps;
    const serverId =
      descToggle.dataset.serverId ||
      descToggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
    const toolName = descToggle.dataset.toolName;
    const server =
      sectionState.servers.find((entry) => entry.id === serverId) ||
      sectionState.sharedServers.find((entry) => entry.id === serverId);
    if (!server || !Array.isArray(server.tools)) return;
    const tool = server.tools.find((entry) => entry.name === toolName);
    if (!tool) return;
    tool._expanded = !tool._expanded;
    syncListShell();
  };

  const handleAccessButton = (accessBtn, deps) => {
    const { sectionState, syncActionFooter, canManageAcls } = deps;
    if (!canManageAcls) return;
    const id = accessBtn.dataset.id;
    const server = sectionState.servers.find((entry) => entry.id === id);
    if (!server) return;
    void openToolServerAccessModal(server, {
      onApply: async (rules) => {
        aclDraftRegistry.stage(server.id, rules);
        syncActionFooter();
      }});
  };

  const buildDelegatedDeps = () => ({
    sectionState,
    state,
    ctx,
    syncListShell,
    syncListState,
    syncActionFooter,
    syncFeedback,
    persistPreferences,
    canManageToolServers,
    canManageAcls});

  const handleEditButtonClick = (editBtn, _target, deps) => {
    const id =
      editBtn.dataset.accountIntegrationEdit ||
      editBtn.dataset.id ||
      editBtn.closest('[data-tool-server-row]')?.dataset.id;
    const server = deps.sectionState.servers.find((entry) => entry.id === id);
    deps.ctx.openModal(server || null);
  };

  const CLICK_HANDLERS = [
    { selector: '.tool-toggle, [data-tool-toggle-scope]', handler: handleToolToggle },
    { selector: '.server-toggle', handler: handleServerToggle },
    { selector: '.tools-toggle', handler: handleToolsExpandToggle },
    { selector: '.tool-desc-toggle', handler: handleToolDescToggle },
    {
      selector: '.tool-access-btn',
      handler: (accessBtn, _target, deps) => handleAccessButton(accessBtn, deps)},
  ];

  const handleListClick = (e, deps) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    for (const { selector, handler } of CLICK_HANDLERS) {
      const el = target.closest(selector);
      if (el) {
        handler(el, target, deps);
        return;
      }
    }

    const editBtn = target.closest('[data-account-integration-edit], .edit-server-btn');
    if (editBtn) {
      handleEditButtonClick(editBtn, target, deps);
    }
  };

  const bindDelegatedEvents = () => {
    if (container.dataset.integrationsEventsBound === '1') return;
    container.dataset.integrationsEventsBound = '1';

    const list = container.querySelector('#tool-servers-list');
    const deps = buildDelegatedDeps();
    list?.addEventListener('click', (e) => handleListClick(e, deps));

    container.querySelector('#add-tool-server')?.addEventListener('click', () => {
      if (!canManageToolServers) return;
      ctx.openModal(null);
    });
  };

  return {
    ensureMounted,
    syncFeedback,
    syncHeaderButtons,
    syncListState,
    syncListShell,
    syncActionFooter,
    bindDelegatedEvents};
}
