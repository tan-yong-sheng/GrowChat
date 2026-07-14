/**
 * State operation helpers for the policies settings view.
 *
 * Factory function that creates selection, pagination, filtering,
 * optimistic save, and deep-link modal helpers bound to the
 * shared state object.
 */

import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import { broadcastConnectionsInvalidation } from '../../../shared/utils/connection-sync.js';
import { broadcastToolServersInvalidation } from '../../../shared/utils/tool-server-sync.js';
import {
  cloneAclRules,
  normalizeAclRule,
  getResourceAccessState,
  buildModelAccessModalWarning,
} from './policies-acl-helpers.js';
import { saveFamilyAccess, openAccessModal } from './policies-acl-modal.js';

export function createPoliciesStateOps(deps) {
  const {
    state,
    DEFAULT_SELECTION,
    PAGE_SIZES,
    container,
    render,
    cloneAclRules: _clone,
    normalizeAclRule: _norm,
    getConnectionRulesByIdForWarnings,
  } = deps;

  const getSelectedSet = (familyKey) => state.selectionByFamily[familyKey] || DEFAULT_SELECTION();

  const setSelectedSet = (familyKey, values) => {
    state.selectionByFamily[familyKey] = new Set(
      Array.isArray(values) ? values : Array.from(values || [])
    );
  };

  const getPagination = (familyKey) =>
    state.paginationByFamily[familyKey] || { page: 1, pageSize: 20 };

  const setPagination = (familyKey, next) => {
    state.paginationByFamily[familyKey] = {
      page: Math.max(1, Number.parseInt(next?.page || 1, 10) || 1),
      pageSize: PAGE_SIZES.includes(Number.parseInt(next?.pageSize, 10))
        ? Number.parseInt(next.pageSize, 10)
        : 20,
    };
  };

  const buildIdSet = (resourceIds) =>
    new Set(
      (Array.isArray(resourceIds) ? resourceIds : [resourceIds])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    );

  const resolveTargetResources = (familyKey, ids) =>
    (state.resources[familyKey] || []).filter((r) => ids.has(String(r.id || '').trim()));

  const resolveIdKey = (familyKey) =>
    familyKey === 'models'
      ? 'model_id'
      : familyKey === 'connections'
        ? 'connection_id'
        : 'tool_server_id';

  const buildUpdatePayload = (familyKey, targetResources, nextRules) => {
    const key = resolveIdKey(familyKey);
    return targetResources.map((r) => ({
      [key]: r.id,
      rules: cloneAclRules(nextRules, normalizeAclRule),
    }));
  };

  const applyResourceRulesImmediate = async (familyKey, resourceIds, nextRules) => {
    const ids = buildIdSet(resourceIds);
    if (!ids.size) return;
    const targetResources = resolveTargetResources(familyKey, ids);
    if (!targetResources.length) return;

    const previousState = targetResources.map((r) => ({
      id: r.id,
      rules: cloneAclRules(r.rules || [], normalizeAclRule),
    }));

    state.resources[familyKey] = (state.resources[familyKey] || []).map((r) => {
      if (!ids.has(String(r.id || '').trim())) return r;
      return { ...r, rules: cloneAclRules(nextRules, normalizeAclRule) };
    });
    render();

    try {
      const updates = buildUpdatePayload(familyKey, targetResources, nextRules);
      await saveFamilyAccess({ familyKey, updates });
      broadcastModelsInvalidation();
      broadcastConnectionsInvalidation();
      broadcastToolServersInvalidation();
    } catch (err) {
      state.resources[familyKey] = (state.resources[familyKey] || []).map((r) => {
        const prev = previousState.find((p) => p.id === r.id);
        return prev ? { ...r, rules: cloneAclRules(prev.rules, normalizeAclRule) } : r;
      });
      render();
      const banner = container.querySelector('[data-policy-error-banner]');
      if (banner) {
        banner.textContent = err?.message || 'Failed to save policy changes';
        banner.classList.remove('hidden');
        setTimeout(() => banner.classList.add('hidden'), 5000);
      }
      throw err;
    }
  };

  const filterResources = (familyKey, resources = []) => {
    const query = state.query.trim().toLowerCase();
    return (Array.isArray(resources) ? resources : []).filter((resource) => {
      if (resource?.enabled === false && !state.visibilityFilters.disabled) return false;
      const text = [
        resource.id,
        resource.name,
        resource.title,
        resource.provider,
        resource.providerType,
        resource.base_url,
        resource.url,
      ]
        .join(' ')
        .toLowerCase();
      if (query && !text.includes(query)) return false;
      const category = getResourceAccessState(
        resource,
        state.selectedGroupId === 'all' ? '' : state.selectedGroupId
      );
      return Boolean(state.visibilityFilters[category]);
    });
  };

  const getPagedResources = (familyKey) => {
    const list = state.resources[familyKey] || [];
    const filtered = filterResources(familyKey, list);
    const pagination = getPagination(familyKey);
    const pageSize = pagination.pageSize || 20;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(pagination.page || 1, 1), totalPages);
    const start = total === 0 ? 0 : (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return {
      filtered,
      items,
      total,
      totalPages,
      page,
      pageSize,
      start,
      end: Math.min(start + pageSize, total),
    };
  };

  const openDeepLinkedAccessModal = async (familyKey) => {
    if (
      state.deepLinkOpened ||
      !state.pendingDeepLink ||
      state.pendingDeepLink.familyKey !== familyKey
    )
      return;
    const targetResource = (state.resources[familyKey] || []).find(
      (r) => String(r.id || '').trim() === state.pendingDeepLink.resourceId
    );
    if (!targetResource) return;
    state.deepLinkOpened = true;
    const connectionRulesById = getConnectionRulesByIdForWarnings();
    await openAccessModal({
      familyKey,
      resource: targetResource,
      groups: state.groups,
      selectedGroupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
      resourceWarning:
        familyKey === 'models'
          ? buildModelAccessModalWarning(
              [targetResource],
              state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
              connectionRulesById
            )
          : null,
      onSaved: async (nextRules, targetResources) => {
        await applyResourceRulesImmediate(
          familyKey,
          targetResources.map((item) => item.id),
          nextRules
        );
      },
    });
  };

  return {
    getSelectedSet,
    setSelectedSet,
    getPagination,
    setPagination,
    applyResourceRulesImmediate,
    filterResources,
    getPagedResources,
    openDeepLinkedAccessModal,
  };
}
