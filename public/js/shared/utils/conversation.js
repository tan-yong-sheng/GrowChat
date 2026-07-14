function safeTime(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const ROOT = '__root__';

function normalizeMessages(messages) {
  return Array.isArray(messages)
    ? messages.map((m, index) => ({ ...m, __sourceIndex: index }))
    : [];
}

function sortMessagesByTime(all) {
  all.sort((a, b) => {
    const delta = safeTime(a.created_at) - safeTime(b.created_at);
    if (delta !== 0) return delta;
    return Number(a.__sourceIndex || 0) - Number(b.__sourceIndex || 0);
  });
}

function backfillParentLinks(all) {
  // Legacy compatibility: only backfill parent links when the entire chat
  // has no parent_id data (old linear schema). Do not rewrite valid branch roots.
  const hasAnyParent = all.some((m) => Boolean(m.parent_id));
  if (!hasAnyParent) {
    for (let i = 1; i < all.length; i += 1) {
      all[i].parent_id = all[i - 1].id || null;
    }
  }
}

function buildMessageIndex(all) {
  const byId = new Map(all.map((m) => [String(m.id || ''), m]));
  const childrenByParent = new Map();
  for (const msg of all) {
    const parentKey = msg.parent_id ? String(msg.parent_id) : ROOT;
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey).push(msg);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => safeTime(a.created_at) - safeTime(b.created_at));
  }
  return { byId, childrenByParent };
}

function buildPreferredAncestry(leaf, byId, maxIterations) {
  const preferredAncestry = new Set();
  let cursor = leaf;
  let guard = 0;
  while (cursor && guard < maxIterations) {
    guard += 1;
    preferredAncestry.add(String(cursor.id));
    cursor = cursor.parent_id ? byId.get(String(cursor.parent_id)) : null;
  }
  return preferredAncestry;
}

function chooseSibling(siblings, preferredAncestry, selected) {
  const bySelection = selected ? siblings.find((s) => String(s.id) === String(selected)) : null;
  if (bySelection) return bySelection;
  return siblings.find((s) => preferredAncestry.has(String(s.id))) || siblings[siblings.length - 1];
}

function buildVisiblePath(
  childrenByParent,
  leaf,
  branchSelectionMap,
  preferredAncestry,
  maxIterations
) {
  const visible = [];
  let parentKey = ROOT;
  let guard = 0;
  while (guard < maxIterations) {
    guard += 1;
    const siblings = childrenByParent.get(parentKey) || [];
    if (!siblings.length) break;

    const selected = branchSelectionMap.get(parentKey);
    const chosen = chooseSibling(siblings, preferredAncestry, selected);
    visible.push(chosen);
    parentKey = String(chosen.id);
  }
  return visible;
}

function resolveSiblingRound(siblings, messageId) {
  const index = siblings.findIndex((s) => String(s.id) === messageId);
  return {
    total: siblings.length,
    index: index >= 0 ? index + 1 : 1,
    prevId: index > 0 ? String(siblings[index - 1].id) : null,
    nextId: index >= 0 && index < siblings.length - 1 ? String(siblings[index + 1].id) : null,
  };
}

function buildRoundForMessage(msg, childrenByParent) {
  const parent = msg.parent_id ? String(msg.parent_id) : ROOT;
  const siblings = childrenByParent.get(parent) || [msg];
  return {
    parentKey: parent,
    ...resolveSiblingRound(siblings, String(msg.id)),
  };
}

function buildRoundsByMessageId(visible, childrenByParent) {
  const roundsByMessageId = new Map();
  for (const msg of visible) {
    roundsByMessageId.set(String(msg.id), buildRoundForMessage(msg, childrenByParent));
  }
  return roundsByMessageId;
}

export function projectConversation(messages, preferredLeafId, branchSelectionMap) {
  const all = normalizeMessages(messages);
  if (all.length === 0) return { visible: [], roundsByMessageId: new Map() };

  sortMessagesByTime(all);
  backfillParentLinks(all);
  const { byId, childrenByParent } = buildMessageIndex(all);

  const fallbackLeaf = all[all.length - 1];
  const leaf =
    preferredLeafId && byId.has(String(preferredLeafId))
      ? byId.get(String(preferredLeafId))
      : fallbackLeaf;
  const preferredAncestry = buildPreferredAncestry(leaf, byId, all.length + 2);
  const visible = buildVisiblePath(
    childrenByParent,
    leaf,
    branchSelectionMap,
    preferredAncestry,
    all.length + 2
  );
  const roundsByMessageId = buildRoundsByMessageId(visible, childrenByParent);

  return { visible, roundsByMessageId };
}

export function resolveConversationLeafId(
  messages,
  {
    preferredLeafId = null,
    currentMessageId = null,
    fallbackMessageId = null,
    previousLeafId = null,
  } = {}
) {
  const all = Array.isArray(messages) ? messages : [];
  if (all.length === 0) return null;
  const byId = new Set(all.map((msg) => String(msg?.id || '')).filter(Boolean));
  const preferred = String(preferredLeafId || '').trim();
  if (preferred && byId.has(preferred)) return preferred;
  const current = String(currentMessageId || '').trim();
  if (current && byId.has(current)) return current;
  const fallback = String(fallbackMessageId || '').trim();
  if (fallback && byId.has(fallback)) return fallback;
  const previous = String(previousLeafId || '').trim();
  if (previous && byId.has(previous)) return previous;
  return String(all[all.length - 1]?.id || '').trim() || null;
}
