export function createChatMessageListController({
  messagesList = null,
  thinkingCollapsedByKey = new Map(),
  toolExpandedByKey = new Map(),
  openCitation = () => {},
} = {}) {
  const onListClick = (event) => {
    const thinkingTarget = event.target?.closest?.('[data-thinking-toggle]');
    if (thinkingTarget) {
      const key = thinkingTarget.getAttribute('data-thinking-toggle');
      if (!key) return;
      const isCollapsed = thinkingCollapsedByKey.get(key) ?? false;
      const next = !isCollapsed;
      thinkingCollapsedByKey.set(key, next);
      const body = messagesList?.querySelector(`[data-thinking-body="${key}"]`);
      const chevron = messagesList?.querySelector(`[data-thinking-chevron="${key}"]`);
      if (body) body.classList.toggle('hidden', next);
      if (chevron) {
        chevron.classList.toggle('-rotate-90', next);
        chevron.classList.toggle('rotate-0', !next);
      }
      return;
    }

    const toolTarget = event.target?.closest?.('[data-tool-toggle]');
    if (toolTarget) {
      const key = toolTarget.getAttribute('data-tool-toggle');
      if (!key) return;
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
