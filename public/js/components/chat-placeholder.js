import { subscribe } from '../store.js';

export function renderPlaceholder(container, options = {}) {
  const opts = typeof options === 'function'
    ? { onSuggestionClick: options, model: null }
    : options;
  const { onSuggestionClick } = opts;
  const allSuggestions = [
    { title: "Summarize an article", subtitle: "on recent tech news" },
    { title: "Help me write", subtitle: "a thank you email" },
    { title: "Suggest a recipe", subtitle: "with chicken and rice" },
    { title: "Debug Python code", subtitle: "with a syntax error" },
    { title: "Plan a travel itinerary", subtitle: "for a 3-day trip to Tokyo" },
    { title: "Explain quantum physics", subtitle: "like I'm five years old" },
    { title: "Create a workout plan", subtitle: "for a home gym" },
    { title: "Write a short story", subtitle: "about a time-traveling cat" }
  ];

  let unsubscribe;

  function render(currentState) {
    if (currentState.activeChatId) {
      container.innerHTML = '';
      return;
    }

    const query = (currentState.newChatDraft || '').toLowerCase().trim();
    const model = currentState.models.find((m) => m.id === currentState.activeModelId) || opts.model || null;
    const modelName = model?.name || 'GrowChat';
    const modelDesc = model?.info?.description || 'The smarter way to chat.';
    const displayed = (query
      ? allSuggestions.filter((s) => s.title.toLowerCase().includes(query) || s.subtitle.toLowerCase().includes(query))
      : allSuggestions
    ).slice(0, 4);

    container.innerHTML = `
      <div id="welcome-screen" class="flex flex-col items-center justify-center py-12 text-center h-full mt-[5vh] transition-all duration-500 ease-out">
         <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-8 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-gray-100 ring-4 ring-gray-50/50 overflow-hidden">
            <img src="/logo.png" alt="GrowChat" class="w-10 h-10 object-contain" />
         </div>

         <div class="mb-12">
           <h1 class="text-3xl font-medium mb-2 text-gray-800 tracking-tight">How can I help you today?</h1>
           <p class="text-gray-500 text-sm font-medium">Using <span class="text-gray-800">${modelName}</span> &middot; ${modelDesc}</p>
         </div>

         <div class="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-[640px] px-4">
            ${displayed.length > 0 ? displayed.map((s) => `
              <button class="suggestion-btn group p-4 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-2xl text-sm text-left transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md">
                 <div class="font-medium text-gray-800 group-hover:text-black transition-colors">${s.title}</div>
                 <div class="text-gray-500 mt-0.5 transition-colors group-hover:text-gray-600">${s.subtitle}</div>
              </button>
            `).join('') : `
              <div class="col-span-full py-8 text-gray-400 text-sm italic">No suggestions matching "${query}"</div>
            `}
         </div>
      </div>
    `;
    container.querySelectorAll('.suggestion-btn').forEach((btn) => {
      btn.onclick = () => {
        const text = btn.querySelector('div:first-child')?.textContent || '';
        if (onSuggestionClick) onSuggestionClick(text);
      };
    });
  }

  unsubscribe = subscribe((currentState) => {
    render(currentState);
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}
