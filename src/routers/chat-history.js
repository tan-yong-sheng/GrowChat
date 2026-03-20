export function trimTrailingAssistantMessages(history = []) {
  const next = Array.isArray(history) ? history.map((row) => ({ ...row })) : [];
  while (next.length > 0 && String(next[next.length - 1]?.role || '') === 'assistant') {
    next.pop();
  }
  return next;
}
