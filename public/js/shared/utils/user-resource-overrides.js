function clonePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
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

export function normalizeUserResourceOverrides(preferences = {}) {
  const prefs =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? preferences
      : {};
  const legacyModelSettings =
    prefs.model_settings &&
    typeof prefs.model_settings === 'object' &&
    !Array.isArray(prefs.model_settings)
      ? prefs.model_settings
      : {};
  const source =
    prefs.resource_overrides &&
    typeof prefs.resource_overrides === 'object' &&
    !Array.isArray(prefs.resource_overrides)
      ? prefs.resource_overrides
      : {};
  const modelsHidden = normalizeIdList([
    ...(Array.isArray(legacyModelSettings.disabled_model_ids)
      ? legacyModelSettings.disabled_model_ids
      : []),
    ...(Array.isArray(source.models?.hidden_ids) ? source.models.hidden_ids : []),
    ...(Array.isArray(source.models?.disabled_ids) ? source.models.disabled_ids : []),
  ]);

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

export function isToolHidden(preferences = {}, serverId = '', toolName = '') {
  const normalized = normalizeUserResourceOverrides(preferences);
  const id = String(serverId || '').trim();
  const tool = String(toolName || '').trim();
  if (!id || !tool) return false;
  const hiddenIds = new Set(normalized?.tool_servers?.tools?.[id]?.hidden_ids || []);
  return hiddenIds.has(tool);
}

export function setResourceVisibility(
  preferences = {},
  kind = 'connections',
  resourceId = '',
  visible = true
) {
  const prefs = clonePlainObject(preferences);
  const id = String(resourceId || '').trim();
  if (!id) return prefs;

  const overrides = normalizeUserResourceOverrides(prefs);
  const nextHiddenIds = new Set(overrides?.[kind]?.hidden_ids || []);
  if (visible) {
    nextHiddenIds.delete(id);
  } else {
    nextHiddenIds.add(id);
  }

  const nextOverrides = clonePlainObject(prefs.resource_overrides);
  nextOverrides.connections =
    nextOverrides.connections &&
    typeof nextOverrides.connections === 'object' &&
    !Array.isArray(nextOverrides.connections)
      ? { ...nextOverrides.connections }
      : {};
  nextOverrides.tool_servers =
    nextOverrides.tool_servers &&
    typeof nextOverrides.tool_servers === 'object' &&
    !Array.isArray(nextOverrides.tool_servers)
      ? { ...nextOverrides.tool_servers }
      : {};
  nextOverrides.models =
    nextOverrides.models &&
    typeof nextOverrides.models === 'object' &&
    !Array.isArray(nextOverrides.models)
      ? { ...nextOverrides.models }
      : {};

  if (kind === 'models') {
    nextOverrides.models.hidden_ids = Array.from(nextHiddenIds);
    prefs.model_settings = {
      ...(prefs.model_settings &&
      typeof prefs.model_settings === 'object' &&
      !Array.isArray(prefs.model_settings)
        ? prefs.model_settings
        : {}),
      disabled_model_ids: Array.from(nextHiddenIds),
      attachment_caps:
        prefs.model_settings &&
        typeof prefs.model_settings === 'object' &&
        !Array.isArray(prefs.model_settings)
          ? prefs.model_settings.attachment_caps || {}
          : {},
    };
  } else if (kind === 'tool_servers') {
    nextOverrides.tool_servers.hidden_ids = Array.from(nextHiddenIds);
  } else {
    nextOverrides.connections.hidden_ids = Array.from(nextHiddenIds);
  }

  prefs.resource_overrides = nextOverrides;
  return prefs;
}

export function setToolVisibility(preferences = {}, serverId = '', toolName = '', visible = true) {
  const prefs = clonePlainObject(preferences);
  const id = String(serverId || '').trim();
  const tool = String(toolName || '').trim();
  if (!id || !tool) return prefs;

  const overrides = normalizeUserResourceOverrides(prefs);
  const nextHiddenIds = new Set(overrides?.tool_servers?.tools?.[id]?.hidden_ids || []);
  if (visible) {
    nextHiddenIds.delete(tool);
  } else {
    nextHiddenIds.add(tool);
  }

  const nextOverrides = clonePlainObject(prefs.resource_overrides);
  nextOverrides.tool_servers =
    nextOverrides.tool_servers &&
    typeof nextOverrides.tool_servers === 'object' &&
    !Array.isArray(nextOverrides.tool_servers)
      ? { ...nextOverrides.tool_servers }
      : {};
  nextOverrides.tool_servers.tools =
    nextOverrides.tool_servers.tools &&
    typeof nextOverrides.tool_servers.tools === 'object' &&
    !Array.isArray(nextOverrides.tool_servers.tools)
      ? { ...nextOverrides.tool_servers.tools }
      : {};
  nextOverrides.tool_servers.tools[id] = {
    ...(nextOverrides.tool_servers.tools[id] &&
    typeof nextOverrides.tool_servers.tools[id] === 'object' &&
    !Array.isArray(nextOverrides.tool_servers.tools[id])
      ? nextOverrides.tool_servers.tools[id]
      : {}),
    hidden_ids: Array.from(nextHiddenIds),
  };

  prefs.resource_overrides = nextOverrides;
  return prefs;
}

export function getVisibleResourceIds(preferences = {}, kind = 'connections', items = []) {
  const hiddenIds = new Set(normalizeUserResourceOverrides(preferences)?.[kind]?.hidden_ids || []);
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item?.id || '').trim())
    .filter((id) => id && !hiddenIds.has(id));
}

export function applyResourceVisibility(
  items = [],
  preferences = {},
  kind = 'connections',
  { sourceKey = 'source', hiddenSourceValue = 'user' } = {}
) {
  const hiddenIds = new Set(normalizeUserResourceOverrides(preferences)?.[kind]?.hidden_ids || []);
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      ...item,
      visible_for_user: !hiddenIds.has(String(item?.id || '').trim()),
      hidden_for_user: hiddenIds.has(String(item?.id || '').trim()),
    }))
    .filter(
      (item) => String(item?.[sourceKey] || '') === hiddenSourceValue || item.visible_for_user
    );
}
