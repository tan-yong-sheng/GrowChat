export function upsertItemById(items, item, key = 'id') {
  const next = Array.isArray(items) ? items.slice() : [];
  const itemId = String(item?.[key] || '').trim();
  if (!itemId) return next;

  const index = next.findIndex((entry) => String(entry?.[key] || '').trim() === itemId);
  if (index >= 0) {
    next[index] = item;
  } else {
    next.push(item);
  }
  return next;
}

export function removeItemById(items, id, key = 'id') {
  const targetId = String(id || '').trim();
  if (!targetId) return Array.isArray(items) ? items.slice() : [];

  return (Array.isArray(items) ? items : []).filter((entry) => String(entry?.[key] || '').trim() !== targetId);
}
