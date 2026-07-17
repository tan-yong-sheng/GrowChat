import { subscribe } from '../store.js';

export function renderPlaceholder(container, options = {}) {
  const opts =
    typeof options === 'function' ? { onSuggestionClick: options, model: null } : options;
  const { onSuggestionClick } = opts;
  const allSuggestions = [
    { title: 'Summarize an article', subtitle: 'on recent tech news' },
    { title: 'Help me write', subtitle: 'a thank you email' },
    { title: 'Suggest a recipe', subtitle: 'with chicken and rice' },
    { title: 'Debug Python code', subtitle: 'with a syntax error' },
    { title: 'Plan a travel itinerary', subtitle: 'for a 3-day trip to Tokyo' },
    { title: 'Explain quantum physics', subtitle: "like I'm five years old" },
    { title: 'Create a workout plan', subtitle: 'for a home gym' },
    { title: 'Write a short story', subtitle: 'about a time-traveling cat' },
  ];

  let unsubscribe;
  let lastQuery = null;
  let lastModelId = null;

  function hasActiveChatMessages(currentState) {
    return (
      currentState.activeChatId &&
      (currentState.messagesByChat[currentState.activeChatId] || []).length > 0
    );
  }

  function clearPlaceholder() {
    if (container.innerHTML === '') return;
    container.innerHTML = '';
    lastQuery = null;
    lastModelId = null;
  }

  function computeDraftQuery(currentState) {
    return (
      currentState.activeChatId
        ? currentState.drafts?.[currentState.activeChatId] || ''
        : currentState.newChatDraft || ''
    )
      .toLowerCase()
      .trim();
  }

  function computeActiveModel(currentState) {
    return (
      currentState.models.find((m) => m.id === currentState.activeModelId) || opts.model || null
    );
  }

  function shouldSkipRender(query, currentModelId) {
    return (
      query === lastQuery &&
      currentModelId === lastModelId &&
      !!container.querySelector('#welcome-screen')
    );
  }

  function filterSuggestions(query) {
    if (!query) return allSuggestions.slice(0, 4);
    return allSuggestions
      .filter(
        (s) => s.title.toLowerCase().includes(query) || s.subtitle.toLowerCase().includes(query)
      )
      .slice(0, 4);
  }

  function renderWelcomeMarkup(modelName, modelDesc) {
    return `
      <div id="welcome-screen" class="flex flex-col items-center justify-center text-center min-h-[40vh] px-6">
         <div class="w-full max-w-[720px] flex flex-col items-center">
           <div class="w-14 h-14 rounded-xl bg-surface flex items-center justify-center mb-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden group">
              <img src="/logo.png" alt="GrowChat" class="w-9 h-9 object-contain" />
           </div>

           <div class="mb-4">
             <h1 class="text-4xl font-semibold mb-2 text-gray-900 tracking-tight font-primary max-w-[600px]">How can I help you today?</h1>
             <div class="flex items-center justify-center gap-2 text-gray-600 text-sm font-medium">
                <span id="welcome-model-name" class="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-700">${modelName}</span>
                <span>&middot;</span>
                <span id="welcome-model-desc" class="text-gray-700">${modelDesc}</span>
             </div>
           </div>

           <div id="welcome-suggestions-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
           </div>
         </div>
      </div>
    `;
  }

  function updateWelcomeText(modelName, modelDesc) {
    const nameEl = container.querySelector('#welcome-model-name');
    const descEl = container.querySelector('#welcome-model-desc');
    if (nameEl && nameEl.textContent !== modelName) nameEl.textContent = modelName;
    if (descEl && descEl.textContent !== modelDesc) descEl.textContent = modelDesc;
  }

  function ensureWelcomeScreen(modelName, modelDesc) {
    if (!container.querySelector('#welcome-screen')) {
      container.innerHTML = renderWelcomeMarkup(modelName, modelDesc);
      return;
    }
    updateWelcomeText(modelName, modelDesc);
  }

  function renderSuggestionMarkup(displayed) {
    return displayed
      .map(
        (s) => `
      <button class="suggestion-btn group p-5 border border-gray-200 hover:border-gray-300 hover:bg-surface rounded-[18px] text-left transition-all duration-200 active:scale-[0.95] bg-surface-container">
         <div class="font-semibold text-[15px] text-gray-800 group-hover:text-black transition-colors mb-1">${s.title}</div>
         <div class="text-gray-600 text-sm transition-colors group-hover:text-gray-700 line-clamp-2">${s.subtitle}</div>
      </button>
    `
      )
      .join('');
  }

  function bindSuggestionClicks(grid) {
    grid.querySelectorAll('.suggestion-btn').forEach((btn) => {
      btn.onclick = () => {
        const text = btn.querySelector('div:first-child')?.textContent || '';
        if (onSuggestionClick) onSuggestionClick(text);
      };
    });
  }

  function renderSuggestions(displayed) {
    const grid = container.querySelector('#welcome-suggestions-grid');
    if (!grid) return;
    grid.innerHTML = renderSuggestionMarkup(displayed);
    bindSuggestionClicks(grid);
  }

  function getModelDisplayInfo(model) {
    return {
      id: model?.id || null,
      name: model?.name || 'GrowChat',
      desc: model?.info?.description || 'The smarter way to chat.',
    };
  }

  function render(currentState) {
    if (hasActiveChatMessages(currentState)) {
      clearPlaceholder();
      return;
    }

    const query = computeDraftQuery(currentState);
    const model = computeActiveModel(currentState);
    const { id: currentModelId, name: modelName, desc: modelDesc } = getModelDisplayInfo(model);

    if (shouldSkipRender(query, currentModelId)) return;

    lastQuery = query;
    lastModelId = currentModelId;

    const displayed = filterSuggestions(query);
    ensureWelcomeScreen(modelName, modelDesc);
    renderSuggestions(displayed);
  }

  unsubscribe = subscribe((currentState) => {
    render(currentState);
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}
