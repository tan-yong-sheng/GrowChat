export function createChatMessageListController({
  messagesList = null,
  thinkingCollapsedByKey = new Map(),
  toolExpandedByKey = new Map(),
  openCitation = () => {},
} = {}) {
  const toggleChevron = (messagesList, key, collapsed) => {
    const chevron = messagesList?.querySelector(
      `[data-thinking-chevron="${key}"], [data-tool-chevron="${key}"]`
    );
    if (!chevron) return;
    chevron.classList.toggle('-rotate-90', collapsed);
    chevron.classList.toggle('rotate-0', !collapsed);
  };

  function handleThinkingToggle(event) {
    const thinkingTarget = event.target?.closest?.('[data-thinking-toggle]');
    if (!thinkingTarget) return false;
    const key = thinkingTarget.getAttribute('data-thinking-toggle');
    if (!key) return true;
    const isCollapsed = thinkingCollapsedByKey.get(key) ?? false;
    thinkingCollapsedByKey.set(key, !isCollapsed);
    const body = messagesList?.querySelector(`[data-thinking-body="${key}"]`);
    if (body) body.classList.toggle('hidden', !isCollapsed);
    toggleChevron(messagesList, key, !isCollapsed);
    return true;
  }

  function handleToolToggle(event) {
    const toolTarget = event.target?.closest?.('[data-tool-toggle]');
    if (!toolTarget) return false;
    const key = toolTarget.getAttribute('data-tool-toggle');
    if (!key) return true;
    const isExpanded = toolExpandedByKey.get(key) === true;
    toolExpandedByKey.set(key, !isExpanded);
    const body = messagesList?.querySelector(`[data-tool-body="${key}"]`);
    if (body) body.classList.toggle('hidden', isExpanded);
    toggleChevron(messagesList, key, isExpanded);
    return true;
  }

  function handleCitationClick(event) {
    const citationTarget = event.target?.closest?.('[data-citation-id]');
    if (!citationTarget) return;
    const id = citationTarget.getAttribute('data-citation-id');
    if (!id) return;
    openCitation(id);
  }

  const onListClick = (event) => {
    if (handleThinkingToggle(event)) return;
    if (handleToolToggle(event)) return;
    handleCitationClick(event);
  };

  messagesList?.addEventListener('click', onListClick);

  return () => {
    messagesList?.removeEventListener('click', onListClick);
  };
}
