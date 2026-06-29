import {
  suspendSidebarVisibility,
  restoreSidebarVisibility,
} from '../../shared/utils/sidebar-visibility.js';
import { clearModalHash, setModalHash } from '../../shared/utils/modal-hash.js';

export function createChatModals({
  state,
  shareChat,
  unshareChat,
  fetchArchivedChats,
  toggleArchiveChat,
  getFileMetadata,
  getFileContent,
  drawChats = () => {},
  loadChats = async () => {},
  sharedByChatId = new Map(),
  escapeHtml = (value) => String(value ?? ''),
  shareModalContainer,
  archivedModalContainer,
  citationModalContainer,
} = {}) {
  let shareSidebarSuspended = false;
  let citationSidebarSuspended = false;
  let archivedSidebarSuspended = false;

  function renderShareModal(shareData = null) {
    if (!shareModalContainer) return;
    if (!shareSidebarSuspended) {
      suspendSidebarVisibility();
      shareSidebarSuspended = true;
    }

    const hasShare = Boolean(shareData?.share_id);
    const shareUrl = hasShare ? `${window.location.origin}${shareData.share_url}` : '';

    shareModalContainer.innerHTML = `
      <div id="share-modal-root" class="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
        <div id="share-overlay" class="absolute inset-0 bg-primary/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-lg rounded-lg bg-white border border-gray-200 shadow-xl p-5">
          <h3 class="text-lg font-semibold text-gray-900">Share Chat</h3>
          <p class="text-xs text-gray-500 mt-1">Create a read-only public link for this chat.</p>
          <div class="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 break-all">${hasShare ? escapeHtml(shareUrl) : 'No active share link'}</div>
          <div class="mt-4 flex items-center justify-end gap-2">
            <button id="close-share-modal" class="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Close</button>
            <button id="copy-share-link" class="px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 ${hasShare ? '' : 'hidden'}">Copy Link</button>
            <button id="generate-share-link" class="px-3 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary-hover">${hasShare ? 'Refresh Link' : 'Generate Link'}</button>
            <button id="revoke-share-link" class="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 ${hasShare ? '' : 'hidden'}">Revoke</button>
          </div>
        </div>
      </div>
    `;

    const close = () => {
      shareModalContainer.innerHTML = '';
      if (shareSidebarSuspended) {
        restoreSidebarVisibility();
        shareSidebarSuspended = false;
      }
      clearModalHash('share-modal');
    };

    shareModalContainer.querySelector('#share-overlay')?.addEventListener('click', close);
    shareModalContainer.querySelector('#close-share-modal')?.addEventListener('click', close);

    shareModalContainer.querySelector('#copy-share-link')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        window.prompt('Copy link', shareUrl);
      }
    });

    shareModalContainer
      .querySelector('#generate-share-link')
      ?.addEventListener('click', async () => {
        if (!state.activeChatId) return;
        const data = await shareChat(state.activeChatId);
        sharedByChatId.set(state.activeChatId, data);
        drawChats(state.chats, state.activeChatId);
        renderShareModal(data);
      });

    shareModalContainer.querySelector('#revoke-share-link')?.addEventListener('click', async () => {
      if (!state.activeChatId) return;
      await unshareChat(state.activeChatId);
      sharedByChatId.delete(state.activeChatId);
      drawChats(state.chats, state.activeChatId);
      renderShareModal(null);
    });

    setModalHash('share-modal');
  }

  function renderCitationModal(citationId, detailText) {
    if (!citationModalContainer) return;
    if (!citationSidebarSuspended) {
      suspendSidebarVisibility();
      citationSidebarSuspended = true;
    }

    citationModalContainer.innerHTML = `
      <div id="citation-modal-root" class="fixed inset-0 z-[130]" role="dialog" aria-modal="true">
        <div id="citation-overlay" class="absolute inset-0 bg-primary/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-2xl h-[70vh] rounded-lg bg-white border border-gray-200 shadow-xl flex flex-col">
          <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 class="text-sm font-semibold text-gray-900">Citation</h3>
              <p class="text-xs text-gray-500">${escapeHtml(citationId)}</p>
            </div>
            <button id="close-citation" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div class="p-4 overflow-auto text-sm text-gray-800 whitespace-pre-wrap">${escapeHtml(detailText || 'No preview available')}</div>
        </div>
      </div>
    `;

    const close = () => {
      citationModalContainer.innerHTML = '';
      if (citationSidebarSuspended) {
        restoreSidebarVisibility();
        citationSidebarSuspended = false;
      }
      clearModalHash('citation-modal');
    };
    citationModalContainer.querySelector('#citation-overlay')?.addEventListener('click', close);
    citationModalContainer.querySelector('#close-citation')?.addEventListener('click', close);
    setModalHash('citation-modal');
  }

  async function openCitation(citationId) {
    let detailText;
    try {
      const meta = await getFileMetadata(citationId);
      detailText = `${meta.filename || citationId}\n\nType: ${meta.content_type || 'unknown'}\n\n`;
      try {
        const content = await getFileContent(citationId);
        detailText +=
          typeof content.content === 'string'
            ? content.content
            : JSON.stringify(content.content, null, 2);
      } catch {
        detailText += meta.text_excerpt || 'No content preview available';
      }
    } catch {
      detailText = `Source ID: ${citationId}\n\nNo detailed preview found for this source.`;
    }

    renderCitationModal(citationId, detailText);
  }

  async function openArchivedModal() {
    if (!archivedModalContainer) return;
    if (!archivedSidebarSuspended) {
      suspendSidebarVisibility();
      archivedSidebarSuspended = true;
    }

    try {
      const data = await fetchArchivedChats();
      archivedModalContainer.innerHTML = `
      <div class="fixed inset-0 z-[125]" role="dialog" aria-modal="true">
        <div id="archived-overlay" class="absolute inset-0 bg-primary/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94%] max-w-xl rounded-lg bg-white border border-gray-200 shadow-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">Archived Chats</h3>
            <button id="close-archived-modal" class="p-2 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div class="space-y-2 max-h-[60vh] overflow-auto">
            ${
              (data.chats || [])
                .map(
                  (chat) => `
              <div class="border border-gray-200 rounded-md px-3 py-2 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium text-gray-800 truncate">${escapeHtml(chat.title || 'Untitled')}</p>
                </div>
                <button data-restore-chat="${chat.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-hover">Restore</button>
              </div>
            `
                )
                .join('') || '<p class="text-sm text-gray-500">No archived chats.</p>'
            }
          </div>
        </div>
      </div>
    `;

      const close = () => {
        archivedModalContainer.innerHTML = '';
        if (archivedSidebarSuspended) {
          restoreSidebarVisibility();
          archivedSidebarSuspended = false;
        }
        clearModalHash('archived-modal');
      };
      archivedModalContainer.querySelector('#archived-overlay')?.addEventListener('click', close);
      archivedModalContainer
        .querySelector('#close-archived-modal')
        ?.addEventListener('click', close);
      archivedModalContainer.querySelectorAll('[data-restore-chat]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-restore-chat');
          await toggleArchiveChat?.(id);
          await loadChats();
          close();
        });
      });
      setModalHash('archived-modal');
    } catch (err) {
      if (archivedSidebarSuspended) {
        restoreSidebarVisibility();
        archivedSidebarSuspended = false;
      }
      throw err;
    }
  }

  return {
    renderShareModal,
    openCitation,
    openArchivedModal,
  };
}
