/**
 * DOM event listener binding for the policies settings view.
 *
 * All handlers receive the shared state + helper callbacks so they
 * remain decoupled from the main renderPoliciesSettings closure.
 */

import { buildModelAccessModalWarning, sortResourcesByVisibility } from './policies-acl-helpers.js';
import { openAccessModal } from './policies-acl-modal.js';

/**
 * Bind all interactive event listeners after a render pass.
 *
 * @param {HTMLElement} container
 * @param {object}      ctx – shared state + helpers
 */
export function bindPolicyEventListeners(container, ctx) {
  const {
    state,
    FAMILIES,
    PAGE_SIZES,
    getSelectedSet,
    setSelectedSet,
    getPagination,
    setPagination,
    getPagedResources,
    render,
    getConnectionRulesByIdForWarnings,
    applyResourceRulesImmediate,
    abortAllFamilyLoads,
    loadFamilyResources,
  } = ctx;

  container.querySelector('#policy-group-filter')?.addEventListener('change', (event) => {
    state.selectedGroupId = event.target.value || 'all';
    const url = new URL(window.location.href);
    if (state.selectedGroupId === 'all') {
      url.searchParams.delete('group');
    } else {
      url.searchParams.set('group', state.selectedGroupId);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    for (const family of FAMILIES) {
      if (state.resources[family.key]) {
        state.resources[family.key] = sortResourcesByVisibility(
          state.resources[family.key],
          state.selectedGroupId === 'all' ? '' : state.selectedGroupId
        );
      }
    }
    for (const family of FAMILIES) {
      setPagination(family.key, { ...getPagination(family.key), page: 1 });
    }
    render();
  });

  container.querySelector('#policy-search')?.addEventListener('input', (event) => {
    state.query = event.target.value || '';
    for (const family of FAMILIES) {
      setPagination(family.key, { ...getPagination(family.key), page: 1 });
    }
    render();
  });

  container.querySelector('#policy-visibility-toggle')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.filtersOpen = !state.filtersOpen;
    render();
  });

  container.querySelector('#policy-family-select')?.addEventListener('change', (event) => {
    const nextFamily = event.target.value || 'models';
    if (!FAMILIES.some((family) => family.key === nextFamily)) return;
    abortAllFamilyLoads();
    state.activeFamily = nextFamily;
    if (state.familyStatus[state.activeFamily] === 'idle') {
      void loadFamilyResources(state.activeFamily);
    }
    render();
  });

  container.querySelectorAll('[data-policy-filter]').forEach((input) => {
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('change', () => {
      const filterKey = input.getAttribute('data-policy-filter');
      if (filterKey && filterKey in state.visibilityFilters) {
        state.visibilityFilters[filterKey] = input.checked;
      }
      for (const family of FAMILIES) {
        setPagination(family.key, { ...getPagination(family.key), page: 1 });
      }
      render();
    });
  });

  container.querySelectorAll('[data-edit-resource]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const familyKey = btn.dataset.family || 'models';
      const resourceId = btn.dataset.editResource || '';
      const resource = (state.resources[familyKey] || []).find(
        (item) => String(item.id) === resourceId
      );
      if (!resource) return;
      try {
        const connectionRulesById = getConnectionRulesByIdForWarnings();
        await openAccessModal({
          familyKey,
          resource,
          groups: state.groups,
          selectedGroupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
          resourceWarning:
            familyKey === 'models'
              ? buildModelAccessModalWarning(
                  [resource],
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
      } catch (err) {
        console.warn('Failed to open access modal:', err);
      }
    });
  });

  container.querySelectorAll('[data-select-resource]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const familyKey = state.activeFamily;
      const resourceId = checkbox.getAttribute('data-select-resource');
      if (!resourceId) return;
      const next = new Set(getSelectedSet(familyKey));
      if (checkbox.checked) next.add(resourceId);
      else next.delete(resourceId);
      setSelectedSet(familyKey, next);
      render();
    });
  });

  container.querySelectorAll('[data-select-visible-family]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const familyKey = btn.getAttribute('data-select-visible-family') || state.activeFamily;
      const visible = getPagedResources(familyKey).items.map((resource) => resource.id);
      setSelectedSet(familyKey, visible);
      render();
    });
  });

  container.querySelectorAll('[data-clear-selection-family]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const familyKey = btn.getAttribute('data-clear-selection-family') || state.activeFamily;
      setSelectedSet(familyKey, []);
      render();
    });
  });

  container.querySelectorAll('[data-bulk-edit-family]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const familyKey = btn.getAttribute('data-bulk-edit-family') || state.activeFamily;
      const selectedIds = getSelectedSet(familyKey);
      const resources = (state.resources[familyKey] || []).filter((resource) =>
        selectedIds.has(resource.id)
      );
      if (!resources.length) return;
      try {
        const connectionRulesById = getConnectionRulesByIdForWarnings();
        await openAccessModal({
          familyKey,
          resource: resources[0],
          resources,
          groups: state.groups,
          selectedGroupId: state.selectedGroupId === 'all' ? '' : state.selectedGroupId,
          resourceWarning:
            familyKey === 'models'
              ? buildModelAccessModalWarning(
                  resources,
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
            setSelectedSet(familyKey, []);
          },
        });
      } catch (err) {
        console.warn('Failed to open bulk access modal:', err);
      }
    });
  });

  container.querySelectorAll('[data-page-size-family]').forEach((select) => {
    select.addEventListener('change', () => {
      const familyKey = select.getAttribute('data-page-size-family') || state.activeFamily;
      const nextSize = Number.parseInt(select.value, 10);
      setPagination(familyKey, {
        page: 1,
        pageSize: PAGE_SIZES.includes(nextSize) ? nextSize : 20,
      });
      render();
    });
  });

  container.querySelectorAll('[data-prev-page-family]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const familyKey = btn.getAttribute('data-prev-page-family') || state.activeFamily;
      const pagination = getPagination(familyKey);
      setPagination(familyKey, { ...pagination, page: Math.max(1, pagination.page - 1) });
      render();
    });
  });

  container.querySelectorAll('[data-next-page-family]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const familyKey = btn.getAttribute('data-next-page-family') || state.activeFamily;
      const pagination = getPagination(familyKey);
      const { totalPages } = getPagedResources(familyKey);
      setPagination(familyKey, {
        ...pagination,
        page: Math.min(totalPages, pagination.page + 1),
      });
      render();
    });
  });
}
