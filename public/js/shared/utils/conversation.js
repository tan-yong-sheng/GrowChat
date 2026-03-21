function safeTime(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function projectConversation(messages, preferredLeafId, branchSelectionMap) {
  const all = Array.isArray(messages)
    ? messages.map((m, index) => ({ ...m, __sourceIndex: index }))
    : [];
  if (all.length === 0) return { visible: [], roundsByMessageId: new Map() };

  all.sort((a, b) => {
    const delta = safeTime(a.created_at) - safeTime(b.created_at);
    if (delta !== 0) return delta;
    return Number(a.__sourceIndex || 0) - Number(b.__sourceIndex || 0);
  });

  // Legacy compatibility: only backfill parent links when the entire chat
  // has no parent_id data (old linear schema). Do not rewrite valid branch roots.
  const hasAnyParent = all.some((m) => Boolean(m.parent_id));
  if (!hasAnyParent) {
    for (let i = 1; i < all.length; i += 1) {
      all[i].parent_id = all[i - 1].id || null;
    }
  }
  const byId = new Map(all.map((m) => [String(m.id || ''), m]));
  const ROOT = '__root__';
  const childrenByParent = new Map();
  for (const msg of all) {
    const parentKey = msg.parent_id ? String(msg.parent_id) : ROOT;
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(msg);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => safeTime(a.created_at) - safeTime(b.created_at));
  }

  const fallbackLeaf = all[all.length - 1];
  const leaf = preferredLeafId && byId.has(String(preferredLeafId))
    ? byId.get(String(preferredLeafId))
    : fallbackLeaf;
  const preferredAncestry = new Set();
  let cursor = leaf;
  let guard = 0;
  while (cursor && guard < all.length + 2) {
    guard += 1;
    preferredAncestry.add(String(cursor.id));
    cursor = cursor.parent_id ? byId.get(String(cursor.parent_id)) : null;
  }

  const visible = [];
  let parentKey = ROOT;
  guard = 0;
  while (guard < all.length + 2) {
    guard += 1;
    const siblings = childrenByParent.get(parentKey) || [];
    if (!siblings.length) break;

    const selected = branchSelectionMap.get(parentKey);
    let chosen = selected ? siblings.find((s) => String(s.id) === String(selected)) : null;
    if (!chosen) {
      chosen = siblings.find((s) => preferredAncestry.has(String(s.id))) || siblings[siblings.length - 1];
    }
    visible.push(chosen);
    parentKey = String(chosen.id);
  }

  const roundsByMessageId = new Map();
  for (const msg of visible) {
    const parent = msg.parent_id ? String(msg.parent_id) : ROOT;
    const siblings = childrenByParent.get(parent) || [msg];
    const index = siblings.findIndex((s) => String(s.id) === String(msg.id));
    roundsByMessageId.set(String(msg.id), {
      total: siblings.length,
      index: index >= 0 ? index + 1 : 1,
      prevId: index > 0 ? String(siblings[index - 1].id) : null,
      nextId: index >= 0 && index < siblings.length - 1 ? String(siblings[index + 1].id) : null,
      parentKey: parent,
    });
  }

  return { visible, roundsByMessageId };
}

export function resolveConversationLeafId(messages, {
  currentMessageId = null,
  fallbackMessageId = null,
  previousLeafId = null,
} = {}) {
  const all = Array.isArray(messages) ? messages : [];
  if (all.length === 0) return null;
  const byId = new Set(all.map((msg) => String(msg?.id || '')).filter(Boolean));
  const current = String(currentMessageId || '').trim();
  if (current && byId.has(current)) return current;
  const fallback = String(fallbackMessageId || '').trim();
  if (fallback && byId.has(fallback)) return fallback;
  const previous = String(previousLeafId || '').trim();
  if (previous && byId.has(previous)) return previous;
  return String(all[all.length - 1]?.id || '').trim() || null;
}
