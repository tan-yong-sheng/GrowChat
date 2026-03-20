// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createChatModals } from '../../public/js/chat-modals.js';

describe('chat modals helper', () => {
  it('wires share and citation modals', async () => {
    const shareModalContainer = document.createElement('div');
    const citationModalContainer = document.createElement('div');
    const archivedModalContainer = document.createElement('div');
    const state = { activeChatId: 'chat-1', chats: [{ id: 'chat-1' }] };
    const sharedByChatId = new Map();
    const drawChats = vi.fn();
    const shareChat = vi.fn(async () => ({ share_id: 's-1', share_url: '/s/s-1' }));
    const unshareChat = vi.fn(async () => ({}));
    const fetchArchivedChats = vi.fn(async () => ({ chats: [] }));
    const getFileMetadata = vi.fn(async () => ({ filename: 'Doc.txt', content_type: 'text/plain' }));
    const getFileContent = vi.fn(async () => ({ content: 'Preview body' }));

    const { renderShareModal, openCitation } = createChatModals({
      state,
      shareChat,
      unshareChat,
      fetchArchivedChats,
      getFileMetadata,
      getFileContent,
      drawChats,
      loadChats: vi.fn(),
      sharedByChatId,
      escapeHtml: (value) => String(value ?? ''),
      shareModalContainer,
      archivedModalContainer,
      citationModalContainer,
    });

    renderShareModal();
    shareModalContainer.querySelector('#generate-share-link')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(shareChat).toHaveBeenCalledWith('chat-1'));
    expect(sharedByChatId.get('chat-1')).toMatchObject({ share_id: 's-1' });
    expect(drawChats).toHaveBeenCalledWith(state.chats, 'chat-1');

    renderShareModal({ share_id: 's-1', share_url: '/s/s-1' });
    shareModalContainer.querySelector('#revoke-share-link')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(unshareChat).toHaveBeenCalledWith('chat-1'));

    await openCitation('cite-1');
    expect(getFileMetadata).toHaveBeenCalledWith('cite-1');
    expect(getFileContent).toHaveBeenCalledWith('cite-1');
    expect(citationModalContainer.textContent).toContain('Doc.txt');
    expect(citationModalContainer.textContent).toContain('Preview body');
  });

  it('restores archived chats through the archive toggle path', async () => {
    const shareModalContainer = document.createElement('div');
    const citationModalContainer = document.createElement('div');
    const archivedModalContainer = document.createElement('div');
    const toggleArchiveChat = vi.fn(async () => ({}));
    const loadChats = vi.fn(async () => {});

    const { openArchivedModal } = createChatModals({
      state: { activeChatId: 'chat-1', chats: [] },
      shareChat: vi.fn(),
      unshareChat: vi.fn(),
      fetchArchivedChats: vi.fn(async () => ({ chats: [{ id: 'arch-1', title: 'Archived' }] })),
      toggleArchiveChat,
      getFileMetadata: vi.fn(),
      getFileContent: vi.fn(),
      drawChats: vi.fn(),
      loadChats,
      sharedByChatId: new Map(),
      escapeHtml: (value) => String(value ?? ''),
      shareModalContainer,
      archivedModalContainer,
      citationModalContainer,
    });

    await openArchivedModal();
    expect(archivedModalContainer.textContent).toContain('Archived');
    archivedModalContainer.querySelector('[data-restore-chat]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(toggleArchiveChat).toHaveBeenCalledWith('arch-1'));
    expect(loadChats).toHaveBeenCalled();
  });
});
