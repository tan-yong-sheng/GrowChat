export function renderPlaceholder(container, options = {}) {
  const opts = typeof options === 'function'
    ? { onSuggestionClick: options, model: null }
    : options;
  const { model, onSuggestionClick } = opts;
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

  // Deterministic shuffle based on session-like seed (could use date or static random)
  const shuffle = (array) => {
    let currentIndex = array.length, randomIndex;
    let seed = new Date().getHours(); // Changes every hour
    const random = () => {
        var x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    };

    while (currentIndex !== 0) {
      randomIndex = Math.floor(random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
  };

  const displayedSuggestions = shuffle([...allSuggestions]).slice(0, 4);

  function render() {
    const modelName = model?.name || 'GrowChat';
    
    container.innerHTML = `
      <div id="welcome-screen" class="flex flex-col items-center justify-center py-12 text-center h-full mt-[5vh] transition-all duration-500 ease-out opacity-0 translate-y-4">
         <div class="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-8 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-gray-100 ring-4 ring-gray-50/50 overflow-hidden">
            <img src="/logo.png" alt="GrowChat" class="w-10 h-10 object-contain" />
         </div>
         <h1 class="text-3xl font-medium mb-12 text-gray-800 tracking-tight">How can I help you today?</h1>
         
         <div class="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-[640px] px-4">
            ${displayedSuggestions.map((s, i) => `
              <button class="suggestion-btn group p-4 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-2xl text-sm text-left transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md">
                 <div class="font-medium text-gray-800 group-hover:text-black transition-colors">${s.title}</div>
                 <div class="text-gray-500 mt-0.5 transition-colors group-hover:text-gray-600">${s.subtitle}</div>
              </button>
            `).join('')}
         </div>
      </div>
    `;

    // Trigger entrance animation
    setTimeout(() => {
        const welcome = container.querySelector('#welcome-screen');
        if (welcome) {
            welcome.classList.remove('opacity-0', 'translate-y-4');
        }
    }, 50);

    container.querySelectorAll('.suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.querySelector('div:first-child').textContent;
        if (onSuggestionClick) onSuggestionClick(text);
      });
    });
  }

  render();
}
