export function createPromptPickerController({
  input,
  promptPicker,
  fetchPrompts,
  fetchPromptByCommand,
  applyPromptVariables,
  filterPromptsByQuery,
  renderPromptPickerMarkup,
}) {
  let promptsCache = [];
  let promptIndex = 0;
  let promptQuery = '';
  let promptOptions = [];

  async function ensurePromptsLoaded() {
    if (promptsCache.length > 0) return;
    try {
      const data = await fetchPrompts();
      promptsCache = data.prompts || [];
    } catch {
      promptsCache = [];
    }
  }

  function hidePromptPicker() {
    if (!promptPicker) return;
    promptPicker.classList.add('hidden');
    promptOptions = [];
    promptQuery = '';
    promptIndex = 0;
  }

  function renderPromptPicker() {
    if (!promptPicker) return;
    promptPicker.innerHTML = renderPromptPickerMarkup(promptOptions, promptIndex);
    promptPicker.classList.remove('hidden');
    promptPicker.querySelectorAll('[data-prompt-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-prompt-idx'));
        const selected = promptOptions[idx];
        if (!selected) return;
        const applied = applyPromptVariables(selected.content || '', (variable) => window.prompt(`Value for "${variable}"`, '') ?? '');
        input.value = applied;
        input.dispatchEvent(new Event('input'));
        hidePromptPicker();
        input.focus();
      });
    });
  }

  async function handleInput(value) {
    const trimmedStart = String(value || '').trimStart();
    if (!trimmedStart.startsWith('/')) {
      hidePromptPicker();
      return;
    }

    await ensurePromptsLoaded();
    promptQuery = trimmedStart.slice(1).trim().toLowerCase();
    promptOptions = filterPromptsByQuery(promptsCache, promptQuery);
    promptIndex = 0;
    renderPromptPicker();
  }

  async function handleKeydown(event) {
    if (!promptPicker || promptPicker.classList.contains('hidden')) return false;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      promptIndex = Math.min(promptIndex + 1, Math.max(promptOptions.length - 1, 0));
      renderPromptPicker();
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      promptIndex = Math.max(promptIndex - 1, 0);
      renderPromptPicker();
      return true;
    }
    if (event.key === 'Enter' && promptOptions[promptIndex]) {
      event.preventDefault();
      const selected = promptOptions[promptIndex];
      let selectedPrompt = selected;
      if (selected?.command) {
        try {
          const fromApi = await fetchPromptByCommand(selected.command);
          selectedPrompt = fromApi.prompt || selected;
        } catch {
          selectedPrompt = selected;
        }
      }
      const applied = applyPromptVariables(selectedPrompt.content || '', (variable) => window.prompt(`Value for "${variable}"`, '') ?? '');
      input.value = applied;
      input.dispatchEvent(new Event('input'));
      hidePromptPicker();
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      hidePromptPicker();
      return true;
    }
    return false;
  }

  return {
    ensurePromptsLoaded,
    handleInput,
    handleKeydown,
    hidePromptPicker,
  };
}
