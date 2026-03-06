import { state, setState, subscribe } from '../store.js';

export function renderModelSelector(container) {
  let isRendered = false;
  let unsubscribe;

  function init() {
    container.innerHTML = `
      <div class="relative" id="model-selector-wrapper">
         <button id="model-selector-btn" class="flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-100 rounded-xl cursor-pointer transition text-gray-700 font-medium text-lg" aria-haspopup="listbox" aria-expanded="false">
            <span id="active-model-name">Loading...</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-500 transition-transform duration-200" id="model-selector-chevron"><path d="m6 9 6 6 6-6"/></svg>
         </button>
         
         <div id="model-selector-dropdown" class="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 hidden flex flex-col p-2" role="listbox">
         </div>
      </div>
    `;
    
    isRendered = true;
    wire();
  }

  function wire() {
    const btn = document.getElementById('model-selector-btn');
    const chevron = document.getElementById('model-selector-chevron');
    const dropdown = document.getElementById('model-selector-dropdown');
    const nameSpan = document.getElementById('active-model-name');
    let isOpen = false;

    const toggle = () => {
      isOpen = !isOpen;
      btn.setAttribute('aria-expanded', isOpen);
      if (isOpen) {
        dropdown.classList.remove('hidden');
        chevron.classList.add('rotate-180');
      } else {
        dropdown.classList.add('hidden');
        chevron.classList.remove('rotate-180');
      }
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    document.addEventListener('click', (e) => {
      if (isOpen && !container.contains(e.target)) {
        toggle();
      }
    });

    unsubscribe = subscribe((currentState) => {
       const activeModel = currentState.models?.find(m => m.id === currentState.activeModelId) || currentState.models?.[0];
       if (activeModel) {
          nameSpan.textContent = activeModel.name || activeModel.id;
       } else {
          nameSpan.textContent = currentState.activeModelId || 'Select a Model';
       }
       
       if (currentState.models && currentState.models.length > 0) {
          dropdown.innerHTML = currentState.models.map(m => `
             <button class="w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between text-sm group ${currentState.activeModelId === m.id ? 'bg-gray-50 text-gray-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}" data-model-id="${m.id}" role="option" aria-selected="${currentState.activeModelId === m.id}">
                <span>${m.name || m.id}</span>
                ${currentState.activeModelId === m.id ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-800"><path d="M20 6 9 17l-5-5"/></svg>' : ''}
             </button>
          `).join('');

          dropdown.querySelectorAll('button').forEach(b => {
             b.addEventListener('click', (e) => {
                e.stopPropagation();
                setState({ activeModelId: b.getAttribute('data-model-id') });
                toggle();
             });
          });
       } else {
          dropdown.innerHTML = '<div class="px-3 py-2 text-sm text-gray-500">No models available</div>';
       }
    });
  }

  init();
  return () => {
     if (unsubscribe) unsubscribe();
  };
}