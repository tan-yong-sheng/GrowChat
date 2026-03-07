import { state, setState, subscribe } from '../store.js';

export function renderModelSelector(container) {
  let isRendered = false;
  let unsubscribe;
  let onDocumentClick;

  function init() {
    container.innerHTML = `
      <div class="relative" id="model-selector-wrapper">
         <button id="model-selector-btn" class="flex items-center gap-1 px-3 py-1.5 hover:bg-gray-50 rounded-xl cursor-pointer transition text-gray-800 font-semibold text-lg font-primary" aria-haspopup="listbox" aria-expanded="false">
            <span id="active-model-name">Loading...</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400 transition-transform duration-200" id="model-selector-chevron"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" /></svg>
         </button>
         
         <div id="model-selector-dropdown" class="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 hidden flex flex-col p-2 font-primary" role="listbox">
            <div class="px-2 pt-1 pb-2 border-b border-gray-50 mb-1">
               <div class="relative flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute left-3 text-gray-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <input type="text" id="model-search-input" placeholder="Search models..." class="w-full pl-9 pr-3 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-gray-200 outline-none placeholder:text-gray-400">
               </div>
            </div>
            <div id="model-list-container" class="max-h-80 overflow-y-auto no-scrollbar space-y-0.5">
            </div>
            <div id="default-model-container" class="border-t border-gray-50 mt-1 pt-1">
               <button id="set-default-btn" class="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-50 transition flex items-center gap-2 text-xs text-gray-500 font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Set as default
               </button>
            </div>
         </div>
      </div>
    `;
    
    isRendered = true;
    wire();
  }

  function wire() {
    const btn = container.querySelector('#model-selector-btn');
    const chevron = container.querySelector('#model-selector-chevron');
    const dropdown = container.querySelector('#model-selector-dropdown');
    const nameSpan = container.querySelector('#active-model-name');
    const searchInput = container.querySelector('#model-search-input');
    const listContainer = container.querySelector('#model-list-container');
    const setDefaultBtn = container.querySelector('#set-default-btn');
    let isOpen = false;
    let searchQuery = '';

    const toggle = () => {
      isOpen = !isOpen;
      btn.setAttribute('aria-expanded', isOpen);
      if (isOpen) {
        dropdown.classList.remove('hidden');
        chevron.classList.add('rotate-180');
        searchInput.value = '';
        searchQuery = '';
        setTimeout(() => searchInput.focus(), 10);
        renderList(state);
      } else {
        dropdown.classList.add('hidden');
        chevron.classList.remove('rotate-180');
      }
    };

    setDefaultBtn.onclick = async (e) => {
      e.stopPropagation();
      if (state.activeModelId) {
        const modelId = state.activeModelId;
        const currentPreferences = state.user?.preferences || {};
        const newPreferences = { ...currentPreferences, defaultModelId: modelId };
        
        try {
          const { apiFetch } = await import('../api.js');
          const res = await apiFetch('/api/users/me', {
            method: 'PUT',
            body: JSON.stringify({ preferences: newPreferences })
          });
          
          if (res.ok) {
            setState({ defaultModelId: modelId });
            toggle();
          } else {
            console.error('Failed to save default model');
            setState({ defaultModelId: modelId }); // Fallback to local only
            toggle();
          }
        } catch (err) {
          console.error('Error saving default model:', err);
          setState({ defaultModelId: modelId });
          toggle();
        }
      }
    };

    btn.onclick = (e) => {
      e.stopPropagation();
      toggle();
    };

    searchInput.onclick = (e) => e.stopPropagation();
    searchInput.oninput = (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderList(state);
    };

    onDocumentClick = (e) => {
      if (isOpen && !container.contains(e.target)) {
        toggle();
      }
    };
    document.addEventListener('click', onDocumentClick);

    function renderList(currentState) {
       const filteredModels = (currentState.models || []).filter(m => 
          (m.name || m.id).toLowerCase().includes(searchQuery)
       );

       if (filteredModels.length > 0) {
          listContainer.innerHTML = filteredModels.map(m => `
             <button class="w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between text-sm group ${currentState.activeModelId === m.id ? 'bg-gray-50 text-gray-900 font-bold' : 'hover:bg-gray-50 text-gray-700'}" data-model-id="${m.id}" role="option" aria-selected="${currentState.activeModelId === m.id}">
                <div class="flex items-center gap-2">
                   <div class="w-6 h-6 rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
                      <img src="/logo.png" alt="" class="w-4 h-4 object-contain opacity-70" />
                   </div>
                   <span>${m.name || m.id}</span>
                </div>
                ${currentState.activeModelId === m.id ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-800"><path d="M20 6 9 17l-5-5"/></svg>' : ''}
             </button>
          `).join('');

          listContainer.querySelectorAll('button').forEach(b => {
             b.onclick = (e) => {
                e.stopPropagation();
                setState({ activeModelId: b.getAttribute('data-model-id') });
                toggle();
             };
          });
       } else {
          listContainer.innerHTML = `<div class="px-3 py-8 text-center text-sm text-gray-400 italic">No models found for "${searchQuery}"</div>`;
       }
    }

    unsubscribe = subscribe((currentState) => {
       const activeModel = currentState.models?.find(m => m.id === currentState.activeModelId) || currentState.models?.[0];
       if (activeModel) {
          nameSpan.textContent = activeModel.name || activeModel.id;
       } else {
          nameSpan.textContent = currentState.activeModelId || 'Select a Model';
       }

       if (currentState.defaultModelId === currentState.activeModelId) {
          setDefaultBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-600"><path d="M20 6 9 17l-5-5"/></svg>
            Default Model
          `;
          setDefaultBtn.classList.add('bg-green-50');
          setDefaultBtn.classList.add('text-green-700');
       } else {
          setDefaultBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Set as default
          `;
          setDefaultBtn.classList.remove('bg-green-50');
          setDefaultBtn.classList.remove('text-green-700');
       }
       
       if (isOpen) {
          renderList(currentState);
       }
    });
  }

  init();
  return () => {
     if (unsubscribe) unsubscribe();
     if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
  };
}
