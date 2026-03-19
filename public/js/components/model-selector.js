import { state, setState, subscribe } from '../store.js';
import { showToast, showToastProgress } from '../utils.js';

export function renderModelSelector(container) {
  let isRendered = false;
  let unsubscribe;
  let onDocumentClick;

  function init() {
    container.innerHTML = `
      <div class="relative" id="model-selector-wrapper">
         <div class="flex flex-col">
           <button id="model-selector-btn" class="flex items-center gap-1 px-3 py-1 hover:bg-gray-50 rounded-xl cursor-pointer transition text-gray-800 font-semibold text-lg font-primary" aria-haspopup="listbox" aria-expanded="false">
              <span id="active-model-name">Loading...</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400 transition-transform duration-200" id="model-selector-chevron"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" /></svg>
           </button>
           <div id="header-set-default-container" class="relative text-left mt-[-2px] ml-4 text-[10px] font-primary">
              <button id="header-set-default-btn" class="text-gray-400 hover:text-gray-500 transition-colors">Set as default</button>
           </div>
         </div>
         
         <div id="model-selector-dropdown" class="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 hidden flex-col p-2 font-primary" role="listbox">
            <div class="px-2 pt-1 pb-2 border-b border-gray-50 mb-1">
               <div class="relative flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute left-3 text-gray-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <input type="text" id="model-search-input" placeholder="Search models..." class="w-full pl-9 pr-3 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-gray-200 outline-none placeholder:text-gray-400">
               </div>
            </div>
            <div id="model-list-container" class="max-h-80 overflow-y-auto no-scrollbar space-y-0.5">
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
    const headerSetDefaultBtn = container.querySelector('#header-set-default-btn');
    let isOpen = false;
    let searchQuery = '';
    let activeIndex = -1;
    let visibleModels = [];
    let allFilteredModels = [];
    let visibleCount = 10;
    const PAGE_SIZE = 10;
    const MAX_VISIBLE_NO_SCROLL = 40;
    let loadingPromise = null;
    let sortedModels = [];
    let lastModelsRef = null;
    let lastModelsLoading = null;
    let lastActiveModelId = null;
    let renderedCount = 0;
    let searchDebounce = null;

    const getLabel = (model) => String(model?.name || model?.id || '');

    const ensureModelsLoaded = async () => {
      if (state.modelsLoading || (state.models && state.models.length > 0)) return loadingPromise;
      setState({ modelsLoading: true });
      loadingPromise = (async () => {
        try {
          const { fetchModels } = await import('../api.js');
          const data = await fetchModels();
          const models = data.models || [];
          const currentId = state.activeModelId;
          const nextActiveModelId = currentId || (models[0]?.id || null);
          setState({
            models,
            activeModelId: nextActiveModelId,
            modelsLoading: false,
          });
        } catch (err) {
          console.error('Failed to load models:', err);
          setState({ modelsLoading: false });
        } finally {
          loadingPromise = null;
        }
      })();
      return loadingPromise;
    };

    const toggle = () => {
      isOpen = !isOpen;
      btn.setAttribute('aria-expanded', isOpen);
      if (isOpen) {
        dropdown.classList.remove('hidden');
        dropdown.classList.add('flex');
        chevron.classList.add('rotate-180');
        searchInput.value = '';
        searchQuery = '';
        activeIndex = -1;
        visibleCount = PAGE_SIZE;
        ensureModelsLoaded();
        setTimeout(() => searchInput.focus(), 10);
        renderList(state, { reset: true, rebuild: true });
      } else {
        dropdown.classList.add('hidden');
        dropdown.classList.remove('flex');
        chevron.classList.remove('rotate-180');
        activeIndex = -1;
      }
    };

    const handleSetDefault = async (e) => {
      e.stopPropagation();
      if (state.activeModelId) {
        const modelId = state.activeModelId;
        if (state.defaultModelId === modelId) {
          showToast('Already the default model');
          return;
        }
        const currentPreferences = state.user?.preferences || {};
        const newPreferences = { ...currentPreferences, defaultModelId: modelId };
        const progressToast = showToastProgress('Setting default model...');
        
        try {
          const { apiFetch } = await import('../api.js');
          const res = await apiFetch('/api/users/me', {
            method: 'PUT',
            body: JSON.stringify({ preferences: newPreferences })
          });
          
          if (res.ok) {
            setState({ defaultModelId: modelId });
            localStorage.setItem('defaultModelId', modelId);
            progressToast.update('Default model set');
            if (isOpen) toggle();
          } else {
            console.error('Failed to save default model');
            setState({ defaultModelId: modelId }); // Session-only fallback
            progressToast.update('Default model set for this session');
            if (isOpen) toggle();
          }
        } catch (err) {
          console.error('Error saving default model:', err);
          setState({ defaultModelId: modelId });
          progressToast.update('Default model set for this session');
          if (isOpen) toggle();
        }
      }
    };

    headerSetDefaultBtn.onclick = handleSetDefault;

    btn.onclick = (e) => {
      e.stopPropagation();
      toggle();
    };

    searchInput.onclick = (e) => e.stopPropagation();
    searchInput.oninput = (e) => {
      const nextQuery = e.target.value.toLowerCase();
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchQuery = nextQuery;
        activeIndex = -1;
        visibleCount = PAGE_SIZE;
        renderList(state, { reset: true, rebuild: true });
      }, 120);
    };
    searchInput.onkeydown = (e) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!allFilteredModels.length) return;
        if (activeIndex < 0) {
          activeIndex = 0;
        } else if (activeIndex + 1 < visibleModels.length) {
          activeIndex += 1;
        } else if (visibleCount < allFilteredModels.length) {
          visibleCount = Math.min(visibleCount + PAGE_SIZE, allFilteredModels.length);
          activeIndex += 1;
          renderList(state, { reset: false, rebuild: false });
          applyActiveHighlight(true);
          return;
        }
        applyActiveHighlight(true);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!allFilteredModels.length) return;
        if (activeIndex < 0) {
          activeIndex = Math.max(visibleModels.length - 1, 0);
        } else {
          activeIndex = Math.max(activeIndex - 1, 0);
        }
        applyActiveHighlight(true);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const model = visibleModels[activeIndex];
        if (!model) return;
        setState({ activeModelId: model.id });
        toggle();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isOpen) toggle();
      }
    };

    onDocumentClick = (e) => {
      if (isOpen && !container.contains(e.target)) {
        toggle();
      }
    };
    document.addEventListener('click', onDocumentClick);

    listContainer.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-model-id]');
      if (!button) return;
      const newModelId = button.getAttribute('data-model-id');
      setState({ activeModelId: newModelId });
      toggle();
    });

    function applyActiveHighlight(scroll = false) {
      const buttons = listContainer.querySelectorAll('button[data-model-id]');
      if (!buttons.length) return;
      buttons.forEach((btn) => {
        btn.classList.remove('ring-2', 'ring-black/40', 'bg-gray-100', 'text-gray-900');
        btn.removeAttribute('data-active');
      });
      const activeModel = visibleModels[activeIndex];
      if (!activeModel) return;
      const activeEl = listContainer.querySelector(`button[data-model-id="${activeModel.id}"]`);
      if (!activeEl) return;
      activeEl.classList.add('ring-2', 'ring-black/40', 'bg-gray-100', 'text-gray-900');
      activeEl.setAttribute('data-active', 'true');
      if (scroll) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }

    function rebuildFilter() {
       if (!sortedModels.length) {
          allFilteredModels = [];
          return;
       }
       const query = searchQuery.trim().toLowerCase();
       if (!query) {
          allFilteredModels = sortedModels;
          const showAll = allFilteredModels.length <= MAX_VISIBLE_NO_SCROLL;
          if (showAll) {
            visibleCount = allFilteredModels.length;
          } else if (visibleCount < PAGE_SIZE || visibleCount > allFilteredModels.length) {
            visibleCount = Math.min(PAGE_SIZE, allFilteredModels.length);
          }
          return;
       }
       allFilteredModels = sortedModels.filter((m) => getLabel(m).toLowerCase().includes(query));
       const showAll = allFilteredModels.length <= MAX_VISIBLE_NO_SCROLL;
       if (showAll) {
          visibleCount = allFilteredModels.length;
       } else if (visibleCount < PAGE_SIZE || visibleCount > allFilteredModels.length) {
          visibleCount = Math.min(PAGE_SIZE, allFilteredModels.length);
       }
    }

    function updateVisibleModels() {
       visibleCount = Math.min(visibleCount, allFilteredModels.length);
       visibleModels = allFilteredModels.slice(0, visibleCount);
    }

    function buildModelButton(m, currentState) {
       const isSelected = currentState.activeModelId === m.id;
       return `
          <button class="w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between text-sm group ${isSelected ? 'bg-gray-50 text-gray-900 font-bold' : 'hover:bg-gray-50 text-gray-700'}" data-model-id="${m.id}" role="option" aria-selected="${isSelected}">
             <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
                   <img src="/logo.png" alt="" class="w-4 h-4 object-contain opacity-70" />
                </div>
                <span>${getLabel(m)}</span>
             </div>
             ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-800"><path d="M20 6 9 17l-5-5"/></svg>' : ''}
          </button>
       `;
    }

    function updateSelectedModel(currentState, previousId) {
       if (!isOpen) return;
       if (previousId) {
          const oldEl = listContainer.querySelector(`button[data-model-id="${previousId}"]`);
          if (oldEl) {
             oldEl.classList.remove('bg-gray-50', 'text-gray-900', 'font-bold');
             oldEl.classList.add('hover:bg-gray-50', 'text-gray-700');
             oldEl.setAttribute('aria-selected', 'false');
             const icon = oldEl.querySelector('svg');
             if (icon) icon.remove();
          }
       }
       const nextId = currentState.activeModelId;
       if (!nextId) return;
       const newEl = listContainer.querySelector(`button[data-model-id="${nextId}"]`);
       if (newEl) {
          newEl.classList.add('bg-gray-50', 'text-gray-900', 'font-bold');
          newEl.classList.remove('hover:bg-gray-50', 'text-gray-700');
          newEl.setAttribute('aria-selected', 'true');
          if (!newEl.querySelector('svg')) {
             newEl.insertAdjacentHTML('beforeend', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-800"><path d="M20 6 9 17l-5-5"/></svg>');
          }
       }
    }

    function renderList(currentState, { reset = false, rebuild = false } = {}) {
       if (currentState.modelsLoading) {
          listContainer.innerHTML = '<div class="px-3 py-6 text-center text-sm text-gray-400 italic">Loading models...</div>';
          renderedCount = 0;
          return;
       }
       if (rebuild) {
          rebuildFilter();
       }
       if (!allFilteredModels.length) {
          visibleModels = [];
          renderedCount = 0;
          listContainer.innerHTML = searchQuery
            ? `<div class="px-3 py-8 text-center text-sm text-gray-400 italic">No models found for "${searchQuery}"</div>`
            : '<div class="px-3 py-6 text-center text-sm text-gray-400 italic">No models available</div>';
          return;
       }

       if (reset) {
          listContainer.innerHTML = '';
          renderedCount = 0;
       }

       updateVisibleModels();

       if (renderedCount < visibleCount) {
          const chunk = allFilteredModels
             .slice(renderedCount, visibleCount)
             .map((m) => buildModelButton(m, currentState))
             .join('');
          listContainer.insertAdjacentHTML('beforeend', chunk);
          renderedCount = visibleCount;
       }

       applyActiveHighlight(false);
    }

    listContainer.addEventListener('scroll', () => {
      if (!isOpen || !allFilteredModels.length) return;
      const nearBottom = listContainer.scrollTop + listContainer.clientHeight >= listContainer.scrollHeight - 40;
      if (!nearBottom) return;
      if (visibleCount >= allFilteredModels.length) return;
      visibleCount = Math.min(visibleCount + PAGE_SIZE, allFilteredModels.length);
      renderList(state, { reset: false, rebuild: false });
    });

    unsubscribe = subscribe((currentState) => {
       const models = Array.isArray(currentState.models) ? currentState.models : [];
       const hasModels = models.length > 0;
       const activeModel = hasModels ? (models.find(m => m.id === currentState.activeModelId) || null) : null;
       if (!hasModels) {
          if (currentState.activeModelId) {
            nameSpan.textContent = currentState.activeModelId;
          } else {
            nameSpan.textContent = currentState.modelsLoading ? 'Loading...' : 'Select a Model';
          }
       } else if (activeModel) {
          nameSpan.textContent = activeModel.name || activeModel.id;
       } else {
          nameSpan.textContent = currentState.activeModelId ? 'Unknown model' : 'Select a Model';
       }

       // Keep header button always clickable
       headerSetDefaultBtn.textContent = 'Set as default';
       headerSetDefaultBtn.className = 'text-gray-400 font-primary hover:text-gray-500 transition-colors';
       headerSetDefaultBtn.disabled = false;
       headerSetDefaultBtn.style.cursor = 'pointer';

       const modelsChanged = currentState.models !== lastModelsRef || currentState.modelsLoading !== lastModelsLoading;
       if (modelsChanged) {
          sortedModels = (currentState.models || [])
             .slice()
             .sort((a, b) => getLabel(a).toLowerCase().localeCompare(getLabel(b).toLowerCase()));
          lastModelsRef = currentState.models;
          lastModelsLoading = currentState.modelsLoading;
          rebuildFilter();
          visibleCount = PAGE_SIZE;
          activeIndex = -1;
          if (isOpen) {
             renderList(currentState, { reset: true, rebuild: false });
          }
       }

       if (currentState.activeModelId !== lastActiveModelId) {
          updateSelectedModel(currentState, lastActiveModelId);
          lastActiveModelId = currentState.activeModelId;
       }

    });
  }

  init();
  return () => {
     if (unsubscribe) unsubscribe();
     if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
  };
}
