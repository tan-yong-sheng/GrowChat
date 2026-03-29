function getAdminDraftRegistry(data, mainTab) {
  if (mainTab === 'settings' || mainTab === 'system') {
    return {
      dirtyCheckers: data?.settingsDirtyCheckers || {},
      saveHandlers: data?.settingsSaveHandlers || {},
      discardHandlers: data?.settingsDiscardHandlers || {},
    };
  }

  if (mainTab === 'users') {
    return {
      dirtyCheckers: data?.usersDirtyCheckers || {},
      saveHandlers: data?.usersSaveHandlers || {},
      discardHandlers: data?.usersDiscardHandlers || {},
    };
  }

  return {
    dirtyCheckers: {},
    saveHandlers: {},
    discardHandlers: {},
  };
}

export function getAdminDraftHandlers(data, mainTab, subTab) {
  const registry = getAdminDraftRegistry(data, mainTab);
  return {
    dirtyFn: registry.dirtyCheckers?.[subTab] || null,
    saveFn: registry.saveHandlers?.[subTab] || null,
    discardFn: registry.discardHandlers?.[subTab] || null,
  };
}

export function isAdminDraftDirty(data, mainTab, subTab) {
  const { dirtyFn } = getAdminDraftHandlers(data, mainTab, subTab);
  return typeof dirtyFn === 'function' ? dirtyFn() : false;
}

export async function saveAdminDraft(data, mainTab, subTab) {
  const { saveFn } = getAdminDraftHandlers(data, mainTab, subTab);
  if (typeof saveFn !== 'function') return false;
  await saveFn();
  return isAdminDraftDirty(data, mainTab, subTab);
}

export function discardAdminDraft(data, mainTab, subTab) {
  const { discardFn } = getAdminDraftHandlers(data, mainTab, subTab);
  if (typeof discardFn === 'function') discardFn();
}
