function getDraftBucket(data, scope) {
  const bucketKey = `${scope}Drafts`;
  if (!data[bucketKey] || typeof data[bucketKey] !== 'object') {
    data[bucketKey] = {};
  }
  return data[bucketKey];
}

export function getAdminDraft(data, scope, key) {
  return getDraftBucket(data, scope)[key] || null;
}

export function setAdminDraft(data, scope, key, value) {
  getDraftBucket(data, scope)[key] = value;
}

export function clearAdminDraft(data, scope, key) {
  delete getDraftBucket(data, scope)[key];
}

export function bindAdminDraftHandlers(data, scope, key, {
  isDirty,
  save,
  discard,
  requestFooterSync,
} = {}) {
  if (!data) return () => {};

  const dirtyKey = `${scope}DirtyCheckers`;
  const saveKey = `${scope}SaveHandlers`;
  const discardKey = `${scope}DiscardHandlers`;

  data[dirtyKey] = data[dirtyKey] || {};
  data[saveKey] = data[saveKey] || {};
  data[discardKey] = data[discardKey] || {};

  if (typeof isDirty === 'function') data[dirtyKey][key] = isDirty;
  if (typeof save === 'function') data[saveKey][key] = save;
  if (typeof discard === 'function') data[discardKey][key] = discard;

  requestFooterSync?.();

  return () => {
    if (typeof isDirty === 'function' && data[dirtyKey]?.[key] === isDirty) {
      delete data[dirtyKey][key];
    }
    if (typeof save === 'function' && data[saveKey]?.[key] === save) {
      delete data[saveKey][key];
    }
    if (typeof discard === 'function' && data[discardKey]?.[key] === discard) {
      delete data[discardKey][key];
    }
    requestFooterSync?.();
  };
}
