import { setState, subscribe } from '../../shared/store.js';
import {
  getAttachmentAcceptTypes,
  moveQueueItem,
  promoteQueueItem,
  removeQueueItem,
  renderAttachmentListMarkup,
  renderPendingQueueMarkup,
} from './message-input-helpers.js';
import { createMessageInputController } from './message-input-controller.js';

export function renderMessageInput(container, onSend) {
  container.innerHTML = `
    <div id="pending-queue" class="hidden mb-2 space-y-1"></div>
    <div id="attachment-list" class="hidden mb-2 flex flex-wrap gap-2"></div>
    <div id="attachment-hint" class="hidden mb-2 text-xs font-medium text-amber-700"></div>
    <form id="composer" class="relative bg-[#f4f4f4] rounded-full p-1.5 flex items-end transition focus-within:bg-white focus-within:ring-1 border border-transparent focus-within:border-gray-200">
       <div class="relative flex-shrink-0 ml-1 flex items-center gap-1">
         <button type="button" id="open-files-btn" class="p-2 text-gray-500 hover:text-black hover:bg-gray-200 rounded-full transition mb-0.5" title="Attach file" aria-label="Attach file" aria-expanded="false">
           <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
         </button>
         <button type="button" id="open-tools-btn" class="p-2 text-gray-500 hover:text-black hover:bg-gray-200 rounded-full transition mb-0.5" title="Tools" aria-label="Tools" aria-expanded="false">
           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>
         </button>
         <div id="attach-menu" class="hidden absolute bottom-full left-0 mb-2 w-52 rounded-2xl border border-gray-100 bg-white shadow-xl p-1 z-30">
           <button type="button" id="attach-upload" class="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5 whitespace-nowrap">
             <i class="bi bi-paperclip text-[15px] leading-none"></i>
             <span class="whitespace-nowrap">Upload Files</span>
           </button>
           <button type="button" id="attach-capture" class="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2.5">
             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-1.5-3z"/><circle cx="12" cy="13" r="3.5"/></svg>
             Capture
           </button>
         </div>
         <div id="tools-menu" class="hidden absolute bottom-full left-12 mb-2 w-60 rounded-2xl border border-gray-100 bg-white shadow-xl p-1 z-30">
           <div class="flex items-center justify-between gap-2 px-3 py-2">
             <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Tools</div>
             <div class="flex items-center gap-1">
               <button type="button" id="tools-menu-all-on" class="hidden inline-flex h-7 w-7 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50 transition" aria-label="Enable all MCP tools" title="Enable all MCP tools">
                 <i class="bi bi-check2-circle text-sm leading-none" aria-hidden="true"></i>
               </button>
               <button type="button" id="tools-menu-all-off" class="hidden inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50 transition" aria-label="Disable all MCP tools" title="Disable all MCP tools">
                 <i class="bi bi-x-circle text-sm leading-none" aria-hidden="true"></i>
               </button>
             </div>
           </div>
           <div id="tools-menu-list" class="max-h-80 overflow-y-auto"></div>
         </div>
         <input type="file" id="attachment-input" class="hidden" multiple accept="image/*,application/pdf,text/*" />
         <input type="file" id="camera-input" class="hidden" accept="image/*" capture="environment" />
       </div>
       <textarea id="message-input" rows="1" placeholder="Message GrowChat" class="flex-grow bg-transparent border-none focus:ring-0 text-[16px] px-2 py-2.5 h-11 max-h-[200px] resize-none overflow-y-auto no-scrollbar text-gray-800" aria-label="Message text. Press Ctrl+Enter or Cmd+Enter to send, or Shift+Enter for new line"></textarea>
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
         <button id="send-btn" class="hidden p-2 bg-[#0066cc] text-white rounded-full hover:bg-[#0071e3] active:scale-95 transition disabled:opacity-50" title="Send message (Ctrl+Enter / Cmd+Enter)" aria-label="Send message">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
         </button>
       </div>
    </form>
    <div class="mt-2 text-xs text-gray-400 text-center font-medium">GrowChat can make mistakes. Check important info.</div>
  `;

  return createMessageInputController({
    container,
    setState,
    subscribe,
    onSend,
    getAttachmentAcceptTypes,
    moveQueueItem,
    promoteQueueItem,
    removeQueueItem,
    renderAttachmentListMarkup,
    renderPendingQueueMarkup,
  });
}
