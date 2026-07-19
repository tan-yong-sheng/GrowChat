function clonePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function cloneSubObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

function normalizeOverrideSection(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    hidden_ids: normalizeIdList(
      source.hidden_ids || source.hiddenIds || source.disabled_ids || source.disabledIds || []
    ),
  };
}

function normalizeToolOverrideMap(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const next = {};
  for (const [serverId, section] of Object.entries(source)) {
    const id = String(serverId || '').trim();
    if (!id) continue;
    next[id] = normalizeOverrideSection(section);
  }
  return next;
}

/**
 * Guard: return value only when it is a non-null object (not array).
 */
function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function collectHiddenModelIds(legacyModelSettings, source) {
  return normalizeIdList([
    ...(Array.isArray(legacyModelSettings.disabled_model_ids)
      ? legacyModelSettings.disabled_model_ids
      : []),
    ...(Array.isArray(source.models?.hidden_ids) ? source.models.hidden_ids : []),
    ...(Array.isArray(source.models?.disabled_ids) ? source.models.disabled_ids : []),
  ]);
}

export function normalizeUserResourceOverrides(preferences = {}) {
  const prefs = safeObject(preferences);
  const legacyModelSettings = safeObject(prefs.model_settings);
  const source = safeObject(prefs.resource_overrides);
  const modelsHidden = collectHiddenModelIds(legacyModelSettings, source);

  return {
    connections: normalizeOverrideSection(source.connections),
    tool_servers: {
      ...normalizeOverrideSection(source.tool_servers),
      tools: normalizeToolOverrideMap(source.tool_servers?.tools),
    },
    models: {
      hidden_ids: modelsHidden,
    },
  };
}

export async function loadUserResourceOverrides(db, userId) {
  if (!db || !userId) return normalizeUserResourceOverrides({});
  try {
    const row = await db.first('SELECT preferences FROM users WHERE id = ?', [
      String(userId).trim(),
    ]);
    if (!row?.preferences) return normalizeUserResourceOverrides({});
    const parsed = JSON.parse(row.preferences);
    return normalizeUserResourceOverrides(parsed);
  } catch {
    return normalizeUserResourceOverrides({});
  }
}

export function isResourceHidden(preferences = {}, kind = 'connections', resourceId = '') {
  const normalized = normalizeUserResourceOverrides(preferences);
  const hiddenIds = new Set(normalized?.[kind]?.hidden_ids || []);
  return hiddenIds.has(String(resourceId || '').trim());
}

function getToolHiddenIds(normalized, serverId) {
  return new Set(normalized?.tool_servers?.tools?.[serverId]?.hidden_ids || []);
}

export function isToolHidden(preferences = {}, serverId = '', toolName = '') {
  const id = String(serverId || '').trim();
  const tool = String(toolName || '').trim();
  if (!id || !tool) return false;
  const normalized = normalizeUserResourceOverrides(preferences);
  const hiddenIds = getToolHiddenIds(normalized, id);
  return hiddenIds.has(tool);
}

function applyHiddenIdsToOverrides(nextOverrides, kind, nextHiddenIds) {
  const ids = Array.from(nextHiddenIds);
  if (kind === 'tool_servers') {
    nextOverrides.tool_servers.hidden_ids = ids;
  } else {
    nextOverrides.connections.hidden_ids = ids;
  }
}

function applyModelVisibility(prefs, nextOverrides, nextHiddenIds) {
  const ids = Array.from(nextHiddenIds);
  nextOverrides.models.hidden_ids = ids;
  const currentModelSettings = cloneSubObject(prefs.model_settings);
  prefs.model_settings = {
    ...currentModelSettings,
    disabled_model_ids: ids,
    attachment_caps: currentModelSettings.attachment_caps || {},
  };
}

/**
 * Prepare the base structure for resource_overrides so nested keys exist.
 */
function prepareOverridesStructure(prefs) {
  const nextOverrides = clonePlainObject(prefs.resource_overrides);
  nextOverrides.connections = cloneSubObject(nextOverrides.connections);
  nextOverrides.tool_servers = cloneSubObject(nextOverrides.tool_servers);
  nextOverrides.models = cloneSubObject(nextOverrides.models);
  return nextOverrides;
}

function getHiddenIdsForKind(overrides, kind) {
  if (!overrides || !kind) return new Set();
  const section = overrides[kind];
  return new Set(section ? section.hidden_ids || [] : []);
}

function toggleHiddenSet(set, id, visible) {
  if (visible !== false) {
    set.delete(id);
  } else {
    set.add(id);
  }
}

export function setResourceVisibility(preferences, kind, resourceId, visible) {
  const prefs = clonePlainObject(preferences || {});
  const id = String(resourceId || '').trim();
  if (!id) return prefs;

  const overrides = normalizeUserResourceOverrides(prefs);
  const k = kind || 'connections';
  const nextHiddenIds = getHiddenIdsForKind(overrides, k);
  toggleHiddenSet(nextHiddenIds, id, visible);

  const nextOverrides = prepareOverridesStructure(prefs);

  if (k === 'models') {
    applyModelVisibility(prefs, nextOverrides, nextHiddenIds);
  } else {
    applyHiddenIdsToOverrides(nextOverrides, k, nextHiddenIds);
  }

  prefs.resource_overrides = nextOverrides;
  return prefs;
}

/**
 * Deep-clone and patch a single tool server entry in the overrides tree.
 */
function getToolHiddenSet(overrides, serverId) {
  if (!overrides || !overrides.tool_servers) return new Set();
  const entry = overrides.tool_servers.tools ? overrides.tool_servers.tools[serverId] : null;
  return new Set(entry ? entry.hidden_ids || [] : []);
}

function prepareToolServerEntry(nextOverrides, id, nextHiddenIds) {
  const servers = safeObject(nextOverrides.tool_servers);
  const tools = safeObject(servers.tools);
  const entry = safeObject(tools[id]);
  nextOverrides.tool_servers = {
    ...servers,
    tools: { ...tools, [id]: { ...entry, hidden_ids: Array.from(nextHiddenIds) } },
  };
}

export function setToolVisibility(preferences, serverId, toolName, visible) {
  const prefs = clonePlainObject(preferences || {});
  const id = String(serverId || '').trim();
  const tool = String(toolName || '').trim();
  if (!id || !tool) return prefs;

  const overrides = normalizeUserResourceOverrides(prefs);
  const nextHiddenIds = getToolHiddenSet(overrides, id);
  toggleHiddenSet(nextHiddenIds, tool, visible);

  const nextOverrides = clonePlainObject(prefs.resource_overrides);
  prepareToolServerEntry(nextOverrides, id, nextHiddenIds);

  prefs.resource_overrides = nextOverrides;
  return prefs;
}

export function getVisibleResourceIds(preferences = {}, kind = 'connections', items = []) {
  const hiddenIds = new Set(normalizeUserResourceOverrides(preferences)?.[kind]?.hidden_ids || []);
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.id || '').trim())
    .filter((id) => id && !hiddenIds.has(id));
}

function computeResourceVisibility(items, hiddenIds) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    visible_for_user: !hiddenIds.has(String(item?.id || '').trim()),
    hidden_for_user: hiddenIds.has(String(item?.id || '').trim()),
  }));
}

function filterBySource(items, sourceKey, hiddenSourceValue) {
  return items.filter(
    (item) => String(item?.[sourceKey] || '') === hiddenSourceValue || item.visible_for_user
  );
}

export function applyResourceVisibility(
  items = [],
  preferences = {},
  kind = 'connections',
  { sourceKey = 'source', hiddenSourceValue = 'user' } = {}
) {
  const hiddenIds = new Set(normalizeUserResourceOverrides(preferences)?.[kind]?.hidden_ids || []);
  const annotated = computeResourceVisibility(items, hiddenIds);
  return filterBySource(annotated, sourceKey, hiddenSourceValue);
}
