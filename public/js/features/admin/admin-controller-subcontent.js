/**
 * Tab-specific sub-content renderers for the admin controller.
 * Extracted from createAdminController to reduce renderSubContent complexity.
 */
import { apiFetch } from '../../shared/api.js';
import { renderErrorState, renderLoadingState, renderUnderDevPlaceholder } from './admin-layout.js';
import { escapeHtml } from '../../shared/utils/dom-escape.js';

function placeholderTitle(prefix, subTab) {
  return subTab.charAt(0).toUpperCase() + subTab.slice(1) + ' ' + prefix;
}

const settingsRenderers = {
  connections: (el, data, modules) => modules.renderConnectionsSettings(el, data),
  models: (el, data, modules) => modules.renderModelsSettings(el, data),
  integrations: (el, data, modules) => modules.renderIntegrationsSettings(el, data),
};

const systemTabRenderers = {
  registration: (el, data, modules) => modules.renderRegistrationSettings(el, data),
  email: (el, data, modules) => modules.renderEmailDeliverySettings(el, data),
  security: (el, _data, modules) => modules.renderSecuritySettings(el),
};

function renderAuditLogsTab(ctx, subContentEl) {
  subContentEl.innerHTML =
    '<div class="p-8 text-center text-gray-500"><i class="bi bi-arrow-repeat animate-spin"></i> Loading audit logs...</div>';
  ctx.systemModules
    .renderAuditLogs({
      apiFetch,
      showToast: (msg, type) => alert(`${type.toUpperCase()}: ${msg}`),
    })
    .then((el) => {
      subContentEl.innerHTML = '';
      subContentEl.appendChild(el);
    })
    .catch((err) => {
      // fallow-ignore-next-line security-sink
      subContentEl.innerHTML = `<div class="p-8 text-center text-red-500">Failed to load audit logs: ${escapeHtml(String(err?.message || ''))}</div>`;
    });
}

export function renderSettingsSubContent(ctx, subContentEl) {
  const renderer = settingsRenderers[ctx.subTab];
  if (renderer) {
    renderer(subContentEl, ctx.data, ctx.settingsModules);
    return;
  }
  // fallow-ignore-next-line security-sink
  subContentEl.innerHTML = renderUnderDevPlaceholder(placeholderTitle('Settings', ctx.subTab));
}

export function renderSystemSubContent(ctx, subContentEl) {
  if (ctx.subTab === 'activity') {
    renderAuditLogsTab(ctx, subContentEl);
    return;
  }
  const renderer = systemTabRenderers[ctx.subTab];
  if (renderer) {
    renderer(subContentEl, ctx.data, ctx.systemModules);
    return;
  }
  // fallow-ignore-next-line security-sink
  subContentEl.innerHTML = renderUnderDevPlaceholder(placeholderTitle('System', ctx.subTab));
}

function buildUserOverviewCallbacks(ctx, callbacks) {
  return {
    reload: callbacks.loadUsers,
    setUsers(nextUsers, total = nextUsers.length) {
      ctx.data.users = nextUsers;
      ctx.data.total = total;
      ctx.clearUsersCache();
      callbacks.renderSubContent();
    },
    updateUser(updatedUser) {
      ctx.updateCachedUser(updatedUser);
      ctx.data.users = ctx.sortUsers(
        ctx.data.users.map((user) =>
          user.id === updatedUser.id ? { ...user, ...updatedUser } : user
        )
      );
      callbacks.renderSubContent();
    },
    removeUser(userId) {
      ctx.removeCachedUser(userId);
      callbacks.renderSubContent();
    },
    prependUser(user) {
      ctx.prependCachedUser(user);
      callbacks.renderSubContent();
    },
    invalidateCache() {
      ctx.clearUsersCache();
      callbacks.renderSubContent();
    },
  };
}

function buildGroupsOverviewCallbacks(ctx, callbacks) {
  return {
    reload: callbacks.loadGroups,
    onSortChange(nextSort) {
      ctx.data.groupsSort = nextSort;
      callbacks.renderSubContent();
    },
    onCreate(group) {
      ctx.data.groups = ctx.usersModules.upsertGroup?.(ctx.data.groups, group) || ctx.data.groups;
      callbacks.renderSubContent();
    },
    onUpdate(group) {
      ctx.data.groups = ctx.usersModules.upsertGroup?.(ctx.data.groups, group) || ctx.data.groups;
      callbacks.renderSubContent();
    },
    onDelete(groupId) {
      ctx.data.groups =
        ctx.usersModules.removeGroupById?.(ctx.data.groups, groupId) || ctx.data.groups;
      callbacks.renderSubContent();
    },
    onMemberDelta(groupId, delta) {
      if (!delta) return;
      ctx.data.groups =
        ctx.usersModules.updateGroupMemberCount?.(ctx.data.groups, groupId, delta) ||
        ctx.data.groups;
      callbacks.renderSubContent();
    },
  };
}

function resolveOverviewRenderer(ctx) {
  if (ctx.data.error) {
    return (subContentEl) => {
      // fallow-ignore-next-line security-sink
      subContentEl.innerHTML = renderErrorState(ctx.data.error);
    };
  }
  if (ctx.subTab === 'overview') {
    return (subContentEl, callbacks) =>
      ctx.usersModules.renderUserOverview(
        subContentEl,
        ctx.data,
        buildUserOverviewCallbacks(ctx, callbacks)
      );
  }
  if (ctx.data.loading && ctx.data.loadingMode === 'initial') {
    return (subContentEl) => {
      // fallow-ignore-next-line security-sink
      subContentEl.innerHTML = renderLoadingState();
    };
  }
  return (subContentEl, callbacks) =>
    ctx.usersModules.renderGroupsOverview(
      subContentEl,
      ctx.data,
      buildGroupsOverviewCallbacks(ctx, callbacks)
    );
}

function renderUsersOverviewOrGroups(ctx, subContentEl, callbacks) {
  const render = resolveOverviewRenderer(ctx);
  render(subContentEl, callbacks);
}

export function renderUsersSubContent(ctx, subContentEl, callbacks) {
  const usersRenderers = {
    roles: (el, data, modules) => modules.renderRolesPage(el, data),
    policies: (el, data, modules) => modules.renderPoliciesSettings(el, data),
  };
  const renderer = usersRenderers[ctx.subTab];
  if (renderer) {
    renderer(subContentEl, ctx.data, ctx.usersModules);
    return;
  }
  renderUsersOverviewOrGroups(ctx, subContentEl, callbacks);
}
