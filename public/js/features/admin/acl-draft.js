function cloneRule(rule) {
  return { ...rule };
}

export function cloneAclRules(rules = [], normalizer = (rule) => rule) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => normalizer(cloneRule(rule)))
    .filter((rule) => rule !== null && rule !== undefined);
}

export function getAclRulesSignature(rules = [], normalizer) {
  return cloneAclRules(rules, normalizer)
    .map((rule) => ({
      principal_type: String(rule?.principal_type || '').trim().toLowerCase(),
      principal_id: String(rule?.principal_id || '').trim(),
      effect: String(rule?.effect || '').trim().toLowerCase(),
      action: String(rule?.action || '').trim().toLowerCase(),
    }))
    .sort((a, b) => (
      a.principal_type.localeCompare(b.principal_type)
      || a.principal_id.localeCompare(b.principal_id)
      || a.action.localeCompare(b.action)
      || a.effect.localeCompare(b.effect)
    ))
    .map((rule) => `${rule.principal_type}:${rule.principal_id}:${rule.action}:${rule.effect}`)
    .join('|');
}

export function createAclDraftRegistry(target, key = 'aclDrafts') {
  if (!target) {
    return {
      get: () => [],
      has: () => false,
      isDirty: () => false,
      stage: () => {},
      clear: () => {},
      entries: function* () {},
    };
  }

  if (!(target[key] instanceof Map)) {
    target[key] = new Map();
  }

  const map = target[key];

  return {
    get(resourceId) {
      return cloneAclRules(map.get(resourceId) || []);
    },
    has(resourceId) {
      return map.has(resourceId);
    },
    isDirty() {
      return map.size > 0;
    },
    stage(resourceId, rules) {
      const normalizedResourceId = String(resourceId || '').trim();
      if (!normalizedResourceId) return;
      if (rules == null) {
        map.delete(normalizedResourceId);
        return;
      }
      map.set(normalizedResourceId, cloneAclRules(rules));
    },
    clear(resourceId) {
      if (typeof resourceId === 'undefined') {
        map.clear();
        return;
      }
      map.delete(String(resourceId || '').trim());
    },
    entries() {
      return map.entries();
    },
  };
}
