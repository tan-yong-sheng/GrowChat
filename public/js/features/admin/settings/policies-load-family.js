/**
 * Fetch a family payload via the appropriate endpoint.
 * Returns the raw JSON payload; callers extract the resource array.
 */
async function fetchFamilyPayload(familyKey, signal, fetchAdminModels, apiFetch) {
  if (familyKey === 'models') {
    return fetchAdminModels({
      limit: 1000,
      offset: 0,
      includeDisabled: true,
      signal,
    });
  }
  const endpoints = {
    connections: '/api/admin/openai/connections?include_disabled=1',
  };
  const fallbackEndpoint = '/api/admin/tool-servers?include_disabled=1';
  const url = endpoints[familyKey] || fallbackEndpoint;
  const errorMessage =
    familyKey === 'connections' ? 'Failed to load connections' : 'Failed to load MCP servers';
  const res = await apiFetch(url, { signal });
  if (!res.ok) throw new Error(errorMessage);
  return res.json();
}

function extractFamilyResources(familyKey, payload) {
  if (familyKey === 'models') return payload.models;
  if (familyKey === 'connections') return payload.connections;
  return payload.servers;
}

/**
 * Factory for the loadFamilyResources function used by policies.js.
 *
 * @param {object} deps – closure dependencies from the parent module
 * @returns {function} loadFamilyResources
 */
export function createLoadFamilyResources(deps) {
  const {
    state,
    familyLoadSeq,
    familyAbortControllers,
    abortFamilyLoad,
    isActiveTab,
    container,
    render,
    apiFetch,
    fetchAdminModels,
    loadFamilyAccess,
    cloneAclRules,
    normalizeAclRule,
    sortResourcesByVisibility,
    openDeepLinkedAccessModal,
  } = deps;

  return async (familyKey, { force = false } = {}) => {
    if (!force && state.familyStatus[familyKey] === 'loaded') return;
    if (state.familyStatus[familyKey] === 'loading' && !force) return;
    abortFamilyLoad(familyKey);
    const controller = new AbortController();
    familyAbortControllers[familyKey] = controller;
    const seq = familyLoadSeq[familyKey] + 1;
    familyLoadSeq[familyKey] = seq;
    state.error = null;
    state.familyError[familyKey] = null;
    state.familyStatus[familyKey] = 'loading';
    if (isActiveTab(container)) render();

    let payload;
    try {
      payload = await fetchFamilyPayload(familyKey, controller.signal, fetchAdminModels, apiFetch);
      if (controller.signal.aborted || familyLoadSeq[familyKey] !== seq) return;

      const rawResources = extractFamilyResources(familyKey, payload);
      const resources = Array.isArray(rawResources) ? rawResources : [];
      const ids = resources.map((r) => r.id).filter(Boolean);

      let accessRules = [];
      let connectionAccessRules = [];
      if (ids.length) {
        const accessPayload = await loadFamilyAccess({
          familyKey,
          resourceIds: ids,
          signal: controller.signal,
        });
        accessRules = Array.isArray(accessPayload.rules) ? accessPayload.rules : [];
      }
      if (familyKey === 'models') {
        const connectionIds = Array.from(
          new Set(resources.map((r) => String(r?.connection_id || '').trim()).filter(Boolean))
        );
        if (connectionIds.length) {
          try {
            const cap = await loadFamilyAccess({
              familyKey: 'connections',
              resourceIds: connectionIds,
              signal: controller.signal,
            });
            connectionAccessRules = Array.isArray(cap.rules) ? cap.rules : [];
          } catch (err) {
            console.warn(
              'Failed to load connection dependency access for models:',
              err?.message || err
            );
            connectionAccessRules = [];
          }
        }
      }
      if (controller.signal.aborted || familyLoadSeq[familyKey] !== seq) return;

      const rulesByResource = new Map();
      for (const rule of accessRules) {
        const rid = String(
          rule?.model_id || rule?.connection_id || rule?.tool_server_id || ''
        ).trim();
        if (!rid) continue;
        if (!rulesByResource.has(rid)) rulesByResource.set(rid, []);
        rulesByResource.get(rid).push(rule);
      }
      if (familyKey === 'models') {
        const connMap = new Map();
        for (const rule of connectionAccessRules) {
          const cid = String(rule?.connection_id || '').trim();
          if (!cid) continue;
          if (!connMap.has(cid)) connMap.set(cid, []);
          connMap.get(cid).push(rule);
        }
        state.modelConnectionRulesById = connMap;
      }
      state.resources[familyKey] = sortResourcesByVisibility(
        resources,
        state.selectedGroupId === 'all' ? '' : state.selectedGroupId
      ).map((r) => ({
        ...r,
        rules: cloneAclRules(rulesByResource.get(r.id) || [], normalizeAclRule),
      }));

      if (state.pendingDeepLink && state.pendingDeepLink.familyKey === familyKey) {
        void openDeepLinkedAccessModal(familyKey).catch((err) =>
          console.warn('Failed to open deep-linked ACL modal:', err)
        );
      }
      state.familyStatus[familyKey] = 'loaded';
    } catch (err) {
      if (controller.signal.aborted || String(err?.name || '').toLowerCase() === 'aborterror')
        return;
      if (familyLoadSeq[familyKey] === seq) {
        state.familyStatus[familyKey] = 'error';
        state.familyError[familyKey] = err?.message || 'Failed to load policies';
      }
    } finally {
      if (familyLoadSeq[familyKey] === seq && familyAbortControllers[familyKey] === controller) {
        familyAbortControllers[familyKey] = null;
      }
      if (familyLoadSeq[familyKey] === seq && isActiveTab(container)) render();
    }
  };
}
