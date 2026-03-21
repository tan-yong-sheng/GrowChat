import { state, setState, subscribe } from '../../shared/store.js';
import { fetchPromptByCommand, fetchPrompts } from '../../shared/api.js';
import {
  applyPromptVariables,
  filterPromptsByQuery,
  getAttachmentAcceptTypes,
  moveQueueItem,
  promoteQueueItem,
  removeQueueItem,
  renderAttachmentListMarkup,
  renderPendingQueueMarkup,
  renderPromptPickerMarkup,
} from './message-input-helpers.js';
import { createMessageInputController } from './message-input-controller.js';

export function renderMessageInput(container, onSend) {
  container.innerHTML = `
    <div id="pending-queue" class="hidden mb-2 space-y-1"></div>
    <div id="attachment-list" class="hidden mb-2 flex flex-wrap gap-2"></div>
    <div id="attachment-hint" class="hidden mb-2 text-xs font-medium text-amber-700"></div>
    <form id="composer" class="relative bg-[#f4f4f4] rounded-[24px] p-1.5 flex items-end transition focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-300 focus-within:shadow-[0_0_15px_rgba(0,0,0,0.05)] border border-transparent focus-within:border-gray-200">
       <div class="relative flex-shrink-0 ml-1">
         <button type="button" id="open-files-btn" class="p-2 text-gray-500 hover:text-black hover:bg-gray-200 rounded-full transition mb-0.5" title="Attach file" aria-label="Attach file" aria-expanded="false">
           <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
         </button>
         <div id="attach-menu" class="hidden absolute bottom-full left-0 mb-2 w-48 rounded-2xl border border-gray-100 bg-white shadow-xl p-1 z-30">
           <button type="button" id="attach-upload" class="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
             Upload files & images
           </button>
         </div>
         <input type="file" id="attachment-input" class="hidden" multiple accept="image/*,application/pdf,text/*" />
       </div>
       <textarea id="message-input" rows="1" placeholder="Message GrowChat" class="flex-grow bg-transparent border-none focus:ring-0 text-[16px] px-2 py-2.5 max-h-[200px] resize-none overflow-y-auto no-scrollbar text-gray-800" style="height: 44px;" aria-label="Message text"></textarea>
       <div class="flex-shrink-0 flex items-center mb-1 mr-1 gap-1 relative">
         <div id="loading-spinner" class="hidden absolute inset-0 bg-[#f4f4f4] items-center justify-center rounded-full transition-all z-10" aria-live="polite">
            <div class="w-4 h-4 border-2 border-gray-400 border-t-black rounded-full animate-spin"></div>
         </div>
         <button type="button" id="stop-btn" class="hidden p-2 text-red-500 hover:bg-red-50 rounded-full transition" title="Stop generating" aria-label="Stop generating">
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="5" y="5" rx="2" ry="2"/></svg>
         </button>
         <button type="button" id="mic-btn" class="p-2 text-gray-500 hover:text-black hover:bg-gray-200 rounded-full transition" title="Voice input" aria-label="Voice input">
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
         </button>
         <button id="send-btn" class="hidden p-2 bg-black text-white rounded-full hover:bg-gray-800 transition disabled:opacity-50" title="Send message" aria-label="Send message">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
         </button>
       </div>
    </form>
    <div id="prompt-picker" class="hidden absolute left-4 right-4 bottom-[94px] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden z-20"></div>
    <div class="mt-2 text-xs text-gray-400 text-center font-medium">GrowChat can make mistakes. Check important info.</div>
  `;

  return createMessageInputController({
    container,
    setState,
    subscribe,
    onSend,
    fetchPrompts,
    fetchPromptByCommand,
    applyPromptVariables,
    filterPromptsByQuery,
    renderPromptPickerMarkup,
    getAttachmentAcceptTypes,
    moveQueueItem,
    promoteQueueItem,
    removeQueueItem,
    renderAttachmentListMarkup,
    renderPendingQueueMarkup,
  });
}

