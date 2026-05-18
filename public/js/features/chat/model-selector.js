import { createModelSelectorController } from './model-selector-controller.js';

export function renderModelSelector(container) {
  container.innerHTML = `
  <div class="relative" id="model-selector-wrapper">
    <button type="button" id="model-selector-btn" class="inline-flex items-center gap-1.5 text-base font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full px-5 py-2.5 transition cursor-pointer shadow-sm" aria-label="Select model" aria-haspopup="listbox" aria-expanded="false" aria-controls="model-selector-dropdown">
      Model
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400 transition-transform duration-200" id="model-selector-chevron"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" /></svg>
    </button>
    <div id="model-selector-dropdown" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[21rem] bg-white border border-gray-100 rounded-2xl shadow-xl z-50 hidden flex-col p-2 font-primary" role="listbox">
      <div class="px-2 pt-1 pb-2 border-b border-gray-50 mb-1">
        <div class="px-2 pb-2">
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Selectable in chat</div>
          <div id="model-selector-summary" class="mt-0.5 text-xs text-gray-500">Loading selectable models...</div>
        </div>
        <div class="relative flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute left-3 text-gray-500"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" id="model-search-input" placeholder="Search models..." class="w-full pl-9 pr-3 py-2 bg-gray-50 border-none rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white placeholder:text-gray-500">
        </div>
      </div>
      <div id="model-selector-notice" class="hidden mx-2 mt-1 rounded-xl border px-3 py-2 text-xs"></div>
      <div id="model-list-container" class="max-h-80 overflow-y-auto no-scrollbar space-y-0.5"></div>
    </div>
  </div>
  `;

  return createModelSelectorController(container);
}
