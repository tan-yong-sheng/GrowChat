/* global openToolServerAccessModal, aclDraftRegistry */
/**
 * UI sync and event binding for the account integrations section.
 */
import {
  updateToolToggle,
  renderLoadingSkeleton,
  buildListCard,
  clonePreferences,
} from './account-integrations-helpers.js';
import { updateAllToolToggles } from '../../shared/components/integrations-shared.js';
import { broadcastToolServersInvalidation } from '../../shared/utils/tool-server-sync.js';
import { buildTraceAttrs } from '../../shared/utils/trace-attrs.js';
import { updateUserMcpServer } from '../../shared/api/resources.js';
import {
  isResourceHidden,
  isToolHidden,
  setResourceVisibility,
  setToolVisibility,
  normalizeUserResourceOverrides,
} from '../../shared/utils/user-resource-overrides.js';
import { sortResourcesByEnabledThenVisibilityThenLabel } from '../../shared/utils/resource-sort.js';

export function createIntegrationsEvents(ctx) {
  const {
    container,
    sectionState,
    state,
    persistPreferences,
    footerHost,
    escapeHtml,
    escapeSelector,
    canManageToolServers,
    canManageAcls,
  } = ctx;

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
    row.classList.toggle(
      'opacity-70',
      !serverEnabled ||
        (isShared && isResourceHidden(state.settings?.preferences || {}, 'tool_servers', serverId))
    );
    const badge = row.querySelector('[data-server-disabled-badge]');
    if (badge) badge.classList.toggle('hidden', serverEnabled);
    const accessBtn = row.querySelector('.tool-access-btn');
    if (accessBtn)
      accessBtn.classList.toggle('hidden', !serverEnabled || !canManageAcls || isShared);
    const serverToggle = row.querySelector('.server-toggle');
    if (serverToggle) {
      const toggleOn = isShared
        ? !isResourceHidden(state.settings?.preferences || {}, 'tool_servers', serverId)
        : serverEnabled;
      serverToggle.classList.toggle('bg-primary', toggleOn);
      serverToggle.classList.toggle('bg-gray-200', !toggleOn);
      serverToggle.setAttribute('aria-pressed', toggleOn ? 'true' : 'false');
      const knob = serverToggle.querySelector('span');
      if (knob) {
        knob.classList.toggle('translate-x-4', toggleOn);
        knob.classList.toggle('translate-x-0', !toggleOn);
      }
    }
    updateAllToolToggles(row, server, serverEnabled);
    const toolsToggle = row.querySelector('.tools-toggle svg');
    if (toolsToggle) {
      toolsToggle.classList.toggle('rotate-180', Boolean(server.toolsExpanded));
    }
  };

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
                  hidden_for_user: hiddenToolIds.has(String(tool?.name || '').trim()),
                })),
              },
              canManageToolServers,
              {
                scope: 'shared',
                hiddenForUser: hiddenSharedIds.has(server.id),
              }
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

  const handleToolToggle = (toolToggle, target, deps) => {
    const {
      sectionState,
      state,
      syncListShell,
      syncListState,
      syncActionFooter,
      syncFeedback,
      persistPreferences,
      canManageToolServers,
    } = deps;
    void canManageToolServers;
    const id =
      toolToggle.dataset.serverId ||
      toolToggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
    const toolName = toolToggle.dataset.toolName;
    const scope = toolToggle.dataset.toolToggleScope || 'personal';
    if (scope === 'shared') {
      const previousPreferences = clonePreferences(state.settings?.preferences || {});
      const currentHidden = isToolHidden(state.settings?.preferences || {}, id, toolName);
      const nextVisible = currentHidden;
      const nextPreferences = setToolVisibility(
        state.settings?.preferences || {},
        id,
        toolName,
        nextVisible
      );
      state.settings = {
        ...(state.settings || {}),
        preferences: nextPreferences,
      };
      sectionState.error = '';
      syncListShell();
      void persistPreferences({
        rollback: { preferences: previousPreferences },
      });
      return;
    }
    const server = sectionState.servers.find((entry) => entry.id === id);
    if (!server || server.enabled === false || !Array.isArray(server.tools)) return;
    const tool = server.tools.find((entry) => entry.name === toolName);
    if (!tool) return;
    const previousEnabled = tool.enabled !== false;
    const nextEnabled = !previousEnabled;
    tool.enabled = nextEnabled;
    syncListState(id);
    syncActionFooter();
    void (async () => {
      try {
        await updateUserMcpServer(server.id, {
          tools: Array.isArray(server.tools)
            ? server.tools.map((entry) => ({
                ...entry,
                enabled: entry.name === toolName ? nextEnabled : entry.enabled !== false,
              }))
            : [],
        });
        broadcastToolServersInvalidation();
      } catch (err) {
        tool.enabled = previousEnabled;
        sectionState.error = err?.message || 'Failed to update integration';
      } finally {
        syncListState(id);
        syncFeedback();
        syncActionFooter();
      }
    })();
  };

  const handleServerToggle = (toggle, target, deps) => {
    const {
      sectionState,
      state,
      syncListShell,
      syncListState,
      syncActionFooter,
      syncFeedback,
      persistPreferences,
      canManageToolServers,
    } = deps;
    void target;
    const id = toggle.dataset.id || toggle.closest('[data-tool-server-row]')?.dataset.toolServerRow;
    const scope = toggle.dataset.toggleScope || 'personal';
    if (scope === 'shared') {
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
        preferences: nextPreferences,
      };
      sectionState.error = '';
      syncListShell();
      void persistPreferences({
        rollback: { preferences: previousPreferences },
      });
      return;
    }
    if (!canManageToolServers) return;
    const server = sectionState.servers.find((entry) => entry.id === id);
    if (!server) return;
    const previousEnabled = server.enabled !== false;
    const nextEnabled = !previousEnabled;
    server.enabled = nextEnabled;
    syncListState(id);
    syncActionFooter();
    void (async () => {
      try {
        await updateUserMcpServer(server.id, { enabled: nextEnabled });
        broadcastToolServersInvalidation();
      } catch (err) {
        server.enabled = previousEnabled;
        sectionState.error = err?.message || 'Failed to update integration';
      } finally {
        syncListState(id);
        syncFeedback();
        syncActionFooter();
      }
    })();
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
      },
    });
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
    canManageAcls,
  });

  const bindDelegatedEvents = () => {
    if (container.dataset.integrationsEventsBound === '1') return;
    container.dataset.integrationsEventsBound = '1';

    const list = container.querySelector('#tool-servers-list');
    const deps = buildDelegatedDeps();
    list?.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const toolToggle = target.closest('.tool-toggle, [data-tool-toggle-scope]');
      if (toolToggle) {
        handleToolToggle(toolToggle, target, deps);
        return;
      }

      const toggle = target.closest('.server-toggle');
      if (toggle) {
        handleServerToggle(toggle, target, deps);
        return;
      }

      const toolsToggle = target.closest('.tools-toggle');
      if (toolsToggle) {
        handleToolsExpandToggle(toolsToggle, target, deps);
        return;
      }

      const descToggle = target.closest('.tool-desc-toggle');
      if (descToggle) {
        handleToolDescToggle(descToggle, target, deps);
        return;
      }

      const editBtn = target.closest('[data-account-integration-edit], .edit-server-btn');
      if (editBtn) {
        const id =
          editBtn.dataset.accountIntegrationEdit ||
          editBtn.dataset.id ||
          editBtn.closest('[data-tool-server-row]')?.dataset.id;
        const server = deps.sectionState.servers.find((entry) => entry.id === id);
        deps.ctx.openModal(server || null);
        return;
      }

      const accessBtn = target.closest('.tool-access-btn');
      if (accessBtn) {
        handleAccessButton(accessBtn, deps);
      }
    });

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
    bindDelegatedEvents,
  };
}
