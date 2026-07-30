/**
 * Handle thinking-section toggle click events on a chat message list.
 *
 * @param {Event} event - The DOM click event.
 * @param {HTMLElement} messagesList - The messages list container to query for body/chevron elements.
 * @param {Map<string, boolean>} thinkingCollapsedByKey - Map of thinking section keys to collapsed state.
 * @returns {boolean} true if the event was handled, false otherwise.
 */
export function toggleThinkingSection(event, messagesList, thinkingCollapsedByKey) {
  const thinkingTarget = event.target.closest?.('[data-thinking-toggle]');
  if (!thinkingTarget) return false;
  const key = thinkingTarget.getAttribute('data-thinking-toggle');
  if (!key) return true;
  const next = !thinkingCollapsedByKey.get(key);
  thinkingCollapsedByKey.set(key, next);
  applyThinkingCollapsedState(messagesList, key, next);
  return true;
}

function applyThinkingCollapsedState(messagesList, key, isCollapsed) {
  const body = messagesList?.querySelector(`[data-thinking-body="${key}"]`);
  const chevron = messagesList?.querySelector(`[data-thinking-chevron="${key}"]`);
  if (body) body.classList.toggle('hidden', isCollapsed);
  if (chevron) {
    chevron.classList.toggle('-rotate-90', isCollapsed);
    chevron.classList.toggle('rotate-0', !isCollapsed);
  }
}

/**
 * Handle tool-section toggle click events on a chat message list.
 *
 * @param {Event} event - The DOM click event.
 * @param {HTMLElement} messagesList - The messages list container to query for body/chevron elements.
 * @param {Map<string, boolean>} toolExpandedByKey - Map of tool section keys to expanded state.
 * @returns {boolean} true if the event was handled, false otherwise.
 */
export function toggleToolSection(event, messagesList, toolExpandedByKey) {
  const toolTarget = event.target.closest?.('[data-tool-toggle]');
  if (!toolTarget) return false;
  const key = toolTarget.getAttribute('data-tool-toggle');
  if (!key) return true;
  const expanded = toolExpandedByKey.get(key) === true;
  const next = !expanded;
  toolExpandedByKey.set(key, next);
  const body = messagesList?.querySelector(`[data-tool-body="${key}"]`);
  const chevron = messagesList?.querySelector(`[data-tool-chevron="${key}"]`);
  if (body) body.classList.toggle('hidden', !next);
  if (chevron) {
    chevron.classList.toggle('-rotate-90', !next);
    chevron.classList.toggle('rotate-0', next);
  }
  return true;
}
