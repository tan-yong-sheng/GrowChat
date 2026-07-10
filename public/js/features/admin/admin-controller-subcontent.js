/**
 * Tab-specific sub-content renderers for the admin controller.
 * Extracted from createAdminController to reduce renderSubContent complexity.
 */
import { apiFetch } from '../../shared/api.js';
import { renderErrorState, renderLoadingState, renderUnderDevPlaceholder } from './admin-layout.js';

function placeholderTitle(prefix, subTab) {
  return subTab.charAt(0).toUpperCase() + subTab.slice(1) + ' ' + prefix;
}

export function renderSettingsSubContent(ctx, subContentEl) {
  if (ctx.subTab === 'connections') {
    ctx.settingsModules.renderConnectionsSettings?.(subContentEl, ctx.data);
  } else if (ctx.subTab === 'models') {
    ctx.settingsModules.renderModelsSettings?.(subContentEl, ctx.data);
  } else if (ctx.subTab === 'integrations') {
    ctx.settingsModules.renderIntegrationsSettings?.(subContentEl, ctx.data);
  } else {
    subContentEl.innerHTML = renderUnderDevPlaceholder(placeholderTitle('Settings', ctx.subTab));
  }
}

export function renderSystemSubContent(ctx, subContentEl) {
  if (ctx.subTab === 'registration') {
    ctx.systemModules.renderRegistrationSettings?.(subContentEl, ctx.data);
  } else if (ctx.subTab === 'email') {
    ctx.systemModules.renderEmailDeliverySettings?.(subContentEl, ctx.data);
  } else if (ctx.subTab === 'security') {
    ctx.systemModules.renderSecuritySettings?.(subContentEl);
  } else if (ctx.subTab === 'activity') {
    subContentEl.innerHTML =
      '<div class="p-8 text-center text-gray-500"><i class="bi bi-arrow-repeat animate-spin"></i> Loading audit logs...</div>';
    ctx.systemModules
      .renderAuditLogs?.({
        apiFetch,
        showToast: (msg, type) => alert(`${type.toUpperCase()}: ${msg}`),
      })
      .then((el) => {
        subContentEl.innerHTML = '';
        subContentEl.appendChild(el);
      })
      .catch((err) => {
        subContentEl.innerHTML = `<div class="p-8 text-center text-red-500">Failed to load audit logs: ${err.message}</div>`;
      });
  } else {
    subContentEl.innerHTML = renderUnderDevPlaceholder(placeholderTitle('System', ctx.subTab));
  }
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

function renderUsersOverviewOrGroups(ctx, subContentEl, callbacks) {
  if (ctx.data.error) {
    subContentEl.innerHTML = renderErrorState(ctx.data.error);
    return;
  }
  if (ctx.subTab === 'overview') {
    ctx.usersModules.renderUserOverview?.(
      subContentEl,
      ctx.data,
      buildUserOverviewCallbacks(ctx, callbacks)
    );
    return;
  }
  if (ctx.data.loading && ctx.data.loadingMode === 'initial') {
    subContentEl.innerHTML = renderLoadingState();
    return;
  }
  ctx.usersModules.renderGroupsOverview?.(
    subContentEl,
    ctx.data,
    buildGroupsOverviewCallbacks(ctx, callbacks)
  );
}

export function renderUsersSubContent(ctx, subContentEl, callbacks) {
  if (ctx.subTab === 'roles') {
    ctx.usersModules.renderRolesPage?.(subContentEl, ctx.data);
    return;
  }
  if (ctx.subTab === 'policies') {
    ctx.usersModules.renderPoliciesSettings?.(subContentEl, ctx.data);
    return;
  }
  renderUsersOverviewOrGroups(ctx, subContentEl, callbacks);
}
