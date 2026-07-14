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

function resolveResourceId(rule) {
  const idKey = ['model_id', 'connection_id', 'tool_server_id'].find((key) => rule?.[key]);
  return String(idKey ? rule[idKey] : '').trim();
}

function pushRuleToGroup(byResource, rid, rule) {
  if (!byResource.has(rid)) byResource.set(rid, []);
  byResource.get(rid).push(rule);
}

function groupRulesByResourceId(rules) {
  const byResource = new Map();
  for (const rule of rules) {
    const rid = resolveResourceId(rule);
    if (!rid) continue;
    pushRuleToGroup(byResource, rid, rule);
  }
  return byResource;
}

function groupConnectionRulesById(rules) {
  const byConnId = new Map();
  for (const rule of rules) {
    const cid = String(rule?.connection_id || '').trim();
    if (!cid) continue;
    if (!byConnId.has(cid)) byConnId.set(cid, []);
    byConnId.get(cid).push(rule);
  }
  return byConnId;
}

function buildResourcesForFamily(resources, rulesByResource, state, helpers) {
  const { sortResourcesByVisibility, cloneAclRules, normalizeAclRule } = helpers;
  const selectedGroupId = state.selectedGroupId === 'all' ? '' : state.selectedGroupId;
  return sortResourcesByVisibility(resources, selectedGroupId).map((r) => ({
    ...r,
    rules: cloneAclRules(rulesByResource.get(r.id) || [], normalizeAclRule),
  }));
}

function startFamilyLoad(familyKey, deps) {
  const {
    state,
    familyLoadSeq,
    familyAbortControllers,
    abortFamilyLoad,
    isActiveTab,
    container,
    render,
  } = deps;
  abortFamilyLoad(familyKey);
  const controller = new AbortController();
  familyAbortControllers[familyKey] = controller;
  const seq = familyLoadSeq[familyKey] + 1;
  familyLoadSeq[familyKey] = seq;
  state.error = null;
  state.familyError[familyKey] = null;
  state.familyStatus[familyKey] = 'loading';
  if (isActiveTab(container)) render();
  return { controller, seq };
}

function isStaleLoad(controller, familyLoadSeq, familyKey, seq) {
  return controller.signal.aborted || familyLoadSeq[familyKey] !== seq;
}

async function loadModelsConnectionAccess(resources, deps, signal) {
  const connectionIds = Array.from(
    new Set(resources.map((r) => String(r?.connection_id || '').trim()).filter(Boolean))
  );
  if (!connectionIds.length) return [];
  try {
    const cap = await deps.loadFamilyAccess({
      familyKey: 'connections',
      resourceIds: connectionIds,
      signal,
    });
    return Array.isArray(cap.rules) ? cap.rules : [];
  } catch (err) {
    console.warn('Failed to load connection dependency access for models:', err?.message || err);
    return [];
  }
}

async function loadFamilyAccessRules(familyKey, ids, deps, signal) {
  if (!ids.length) return [];
  const accessPayload = await deps.loadFamilyAccess({
    familyKey,
    resourceIds: ids,
    signal,
  });
  return Array.isArray(accessPayload.rules) ? accessPayload.rules : [];
}

function finalizeFamilyLoad(familyKey, deps, controller, seq) {
  const {
    state,
    familyLoadSeq,
    familyAbortControllers,
    isActiveTab,
    container,
    render,
    openDeepLinkedAccessModal,
  } = deps;
  const rulesByResource = groupRulesByResourceId(deps._accessRules);
  if (familyKey === 'models') {
    state.modelConnectionRulesById = groupConnectionRulesById(deps._connectionAccessRules);
  }
  state.resources[familyKey] = buildResourcesForFamily(deps._resources, rulesByResource, state, {
    sortResourcesByVisibility: deps.sortResourcesByVisibility,
    cloneAclRules: deps.cloneAclRules,
    normalizeAclRule: deps.normalizeAclRule,
  });

  if (state.pendingDeepLink && state.pendingDeepLink.familyKey === familyKey) {
    void openDeepLinkedAccessModal(familyKey).catch((err) =>
      console.warn('Failed to open deep-linked ACL modal:', err)
    );
  }
  state.familyStatus[familyKey] = 'loaded';

  if (familyLoadSeq[familyKey] === seq && familyAbortControllers[familyKey] === controller) {
    familyAbortControllers[familyKey] = null;
  }
  if (familyLoadSeq[familyKey] === seq && isActiveTab(container)) render();
}

function handleFamilyLoadError(familyKey, err, deps, controller, seq) {
  const { state, familyLoadSeq } = deps;
  if (controller.signal.aborted || String(err?.name || '').toLowerCase() === 'aborterror') return;
  if (familyLoadSeq[familyKey] !== seq) return;
  state.familyStatus[familyKey] = 'error';
  state.familyError[familyKey] = err?.message || 'Failed to load policies';
}

function handleFamilyLoadFinally(familyKey, deps, controller, seq) {
  const { familyLoadSeq, familyAbortControllers, isActiveTab, container, render } = deps;
  if (familyLoadSeq[familyKey] === seq && familyAbortControllers[familyKey] === controller) {
    familyAbortControllers[familyKey] = null;
  }
  if (familyLoadSeq[familyKey] === seq && isActiveTab(container)) render();
}

/**
 * Factory for the loadFamilyResources function used by policies.js.
 *
 * @param {object} deps – closure dependencies from the parent module
 * @returns {function} loadFamilyResources
 */
function shouldSkipFamilyLoad(state, familyKey, force) {
  if (!force && state.familyStatus[familyKey] === 'loaded') return true;
  if (state.familyStatus[familyKey] === 'loading' && !force) return true;
  return false;
}

async function loadFamilyConnectionAccessRules(familyKey, resources, deps, signal) {
  if (familyKey !== 'models') return [];
  return loadModelsConnectionAccess(resources, deps, signal);
}

async function loadFamilyResourcesCore(familyKey, deps, controller, seq) {
  const payload = await fetchFamilyPayload(
    familyKey,
    controller.signal,
    deps.fetchAdminModels,
    deps.apiFetch
  );
  if (isStaleLoad(controller, deps.familyLoadSeq, familyKey, seq)) return;

  const rawResources = extractFamilyResources(familyKey, payload);
  const resources = Array.isArray(rawResources) ? rawResources : [];
  const ids = resources.map((r) => r.id).filter(Boolean);

  const accessRules = await loadFamilyAccessRules(familyKey, ids, deps, controller.signal);
  const connectionAccessRules = await loadFamilyConnectionAccessRules(
    familyKey,
    resources,
    deps,
    controller.signal
  );
  if (isStaleLoad(controller, deps.familyLoadSeq, familyKey, seq)) return;

  Object.assign(deps, {
    _accessRules: accessRules,
    _connectionAccessRules: connectionAccessRules,
    _resources: resources,
  });
  finalizeFamilyLoad(familyKey, deps, controller, seq);
}

export function createLoadFamilyResources(deps) {
  return async (familyKey, { force = false } = {}) => {
    if (shouldSkipFamilyLoad(deps.state, familyKey, force)) return;
    const { controller, seq } = startFamilyLoad(familyKey, deps);

    try {
      await loadFamilyResourcesCore(familyKey, deps, controller, seq);
    } catch (err) {
      handleFamilyLoadError(familyKey, err, deps, controller, seq);
    } finally {
      handleFamilyLoadFinally(familyKey, deps, controller, seq);
    }
  };
}
