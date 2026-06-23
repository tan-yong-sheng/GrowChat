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

  const onListClick = (event) => {
    const thinkingTarget = event.target?.closest?.('[data-thinking-toggle]');
    if (thinkingTarget) {
      const key = thinkingTarget.getAttribute('data-thinking-toggle');
      if (!key) return;
      const isCollapsed = thinkingCollapsedByKey.get(key) ?? false;
      thinkingCollapsedByKey.set(key, !isCollapsed);
      const body = messagesList?.querySelector(`[data-thinking-body="${key}"]`);
      if (body) body.classList.toggle('hidden', !isCollapsed);
      toggleChevron(messagesList, key, !isCollapsed);
      return;
    }

    const toolTarget = event.target?.closest?.('[data-tool-toggle]');
    if (toolTarget) {
      const key = toolTarget.getAttribute('data-tool-toggle');
      if (!key) return;
      const isExpanded = toolExpandedByKey.get(key) === true;
      toolExpandedByKey.set(key, !isExpanded);
      const body = messagesList?.querySelector(`[data-tool-body="${key}"]`);
      if (body) body.classList.toggle('hidden', isExpanded);
      toggleChevron(messagesList, key, isExpanded);
      return;
    }

    const citationTarget = event.target?.closest?.('[data-citation-id]');
    if (citationTarget) {
      const id = citationTarget.getAttribute('data-citation-id');
      if (!id) return;
      openCitation(id);
    }
  };

  messagesList?.addEventListener('click', onListClick);

  return () => {
    messagesList?.removeEventListener('click', onListClick);
  };
}
