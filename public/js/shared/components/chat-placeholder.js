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

  function render(currentState) {
    const hasMessages =
      currentState.activeChatId &&
      (currentState.messagesByChat[currentState.activeChatId] || []).length > 0;
    if (hasMessages) {
      if (container.innerHTML !== '') {
        container.innerHTML = '';
        lastQuery = null;
        lastModelId = null;
      }
      return;
    }

    const query = (
      currentState.activeChatId
        ? currentState.drafts?.[currentState.activeChatId] || ''
        : currentState.newChatDraft || ''
    )
      .toLowerCase()
      .trim();
    const model =
      currentState.models.find((m) => m.id === currentState.activeModelId) || opts.model || null;
    const currentModelId = model?.id || null;

    if (
      query === lastQuery &&
      currentModelId === lastModelId &&
      container.querySelector('#welcome-screen')
    ) {
      return; // No need to re-render
    }

    lastQuery = query;
    lastModelId = currentModelId;

    const modelName = model?.name || 'GrowChat';
    const modelDesc = model?.info?.description || 'The smarter way to chat.';
    const displayed = (
      query
        ? allSuggestions.filter(
            (s) => s.title.toLowerCase().includes(query) || s.subtitle.toLowerCase().includes(query)
          )
        : allSuggestions
    ).slice(0, 4);

    if (!container.querySelector('#welcome-screen')) {
      container.innerHTML = `
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
    } else {
      const nameEl = container.querySelector('#welcome-model-name');
      const descEl = container.querySelector('#welcome-model-desc');
      if (nameEl && nameEl.textContent !== modelName) nameEl.textContent = modelName;
      if (descEl && descEl.textContent !== modelDesc) descEl.textContent = modelDesc;
    }

    const grid = container.querySelector('#welcome-suggestions-grid');
    if (grid) {
      grid.innerHTML =
        displayed.length > 0
          ? displayed
              .map(
                (s) => `
        <button class="suggestion-btn group p-5 border border-gray-200 hover:border-gray-300 hover:bg-surface rounded-[18px] text-left transition-all duration-200 active:scale-[0.95] bg-surface-container">
           <div class="font-semibold text-[15px] text-gray-800 group-hover:text-black transition-colors mb-1">${s.title}</div>
           <div class="text-gray-500 text-sm transition-colors group-hover:text-gray-600 line-clamp-2">${s.subtitle}</div>
        </button>
      `
              )
              .join('')
          : '';

      grid.querySelectorAll('.suggestion-btn').forEach((btn) => {
        btn.onclick = () => {
          const text = btn.querySelector('div:first-child')?.textContent || '';
          if (onSuggestionClick) onSuggestionClick(text);
        };
      });
    }
  }

  unsubscribe = subscribe((currentState) => {
    render(currentState);
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}
