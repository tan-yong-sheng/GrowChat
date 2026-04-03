import { createModelSelectorController } from './model-selector-controller.js';

export function renderModelSelector(container) {
  container.innerHTML = `
    <div class="relative" id="model-selector-wrapper">
       <div class="flex flex-col">
         <button id="model-selector-btn" class="flex items-center gap-1 px-3 py-2 min-h-11 hover:bg-gray-50 rounded-xl cursor-pointer transition text-gray-800 font-semibold text-lg font-primary" aria-label="Select model" aria-haspopup="listbox" aria-expanded="false" aria-controls="model-selector-dropdown">
            <span id="active-model-name">Loading...</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-500 transition-transform duration-200" id="model-selector-chevron"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" /></svg>
         </button>
         <div id="header-set-default-container" class="relative text-left mt-[-2px] ml-4 text-[10px] font-primary">
            <button id="header-set-default-btn" class="text-gray-600 hover:text-gray-700 transition-colors">Set as default</button>
         </div>
       </div>

       <div id="model-selector-dropdown" class="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 hidden flex-col p-2 font-primary" role="listbox">
          <div class="px-2 pt-1 pb-2 border-b border-gray-50 mb-1">
             <div class="relative flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute left-3 text-gray-500"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="text" id="model-search-input" placeholder="Search models..." class="w-full pl-9 pr-3 py-2 bg-gray-50 border-none rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white placeholder:text-gray-500">
             </div>
          </div>
          <div id="model-list-container" class="max-h-80 overflow-y-auto no-scrollbar space-y-0.5"></div>
       </div>
    </div>
  `;

  return createModelSelectorController(container);
}

