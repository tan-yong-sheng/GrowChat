// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindChatFileEvents } from '../../public/js/features/chat/chat-file-events.js';

describe('chat file events', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('uploads selected files and appends attachments to the current draft', async () => {
    const state = { activeChatId: 'chat-1' };
    const uploadFile = vi.fn(async (file) => ({
      id: `uploaded-${file.name}`,
      filename: file.name,
      content_type: 'text/plain',
      file_size: 12,
    }));
    const showToast = vi.fn();
    const showToastProgress = vi.fn(() => ({ close: vi.fn() }));
    const getDraftAttachments = vi.fn(() => [{ id: 'existing' }]);
    const setDraftAttachments = vi.fn();

    const destroy = bindChatFileEvents({
      state,
      uploadFile,
      showToast,
      showToastProgress,
      getDraftAttachments,
      setDraftAttachments,
      getAllowedAttachmentKinds: vi.fn(() => ['text (local)']),
      getAllowedNonLocalKinds: vi.fn(() => []),
      getFileContentType: vi.fn(() => 'text/plain'),
      isAttachmentAllowedByModel: vi.fn(() => true),
      isSupportedAttachmentType: vi.fn(() => true),
    });

    window.dispatchEvent(new CustomEvent('growchat:files-selected', {
      detail: { files: [{ name: 'note.txt' }] },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(uploadFile).toHaveBeenCalledWith({ name: 'note.txt' }, 'chat-1', { timeoutMs: 30000 });
    expect(setDraftAttachments).toHaveBeenCalledWith('chat-1', [
      { id: 'existing' },
      { id: 'uploaded-note.txt', filename: 'note.txt', content_type: 'text/plain', file_size: 12 },
    ]);

    destroy();
  });

  it('filters attach-file events before updating the draft', () => {
    const state = { activeChatId: 'chat-1' };
    const setDraftAttachments = vi.fn();

    const destroy = bindChatFileEvents({
      state,
      uploadFile: vi.fn(),
      showToast: vi.fn(),
      showToastProgress: vi.fn(),
      getDraftAttachments: vi.fn(() => []),
      setDraftAttachments,
      getAllowedAttachmentKinds: vi.fn(() => ['text (local)']),
      getAllowedNonLocalKinds: vi.fn(() => []),
      getFileContentType: vi.fn(() => 'text/plain'),
      isAttachmentAllowedByModel: vi.fn(() => true),
      isSupportedAttachmentType: vi.fn(() => true),
    });

    window.dispatchEvent(new CustomEvent('attach-files', {
      detail: { files: [{ id: 'f1', filename: 'Doc.txt', content_type: 'text/plain', file_size: 1 }] },
    }));

    expect(setDraftAttachments).toHaveBeenCalledWith('chat-1', [
      { id: 'f1', filename: 'Doc.txt', content_type: 'text/plain', file_size: 1 },
    ]);

    destroy();
  });

  it('does not show the disabled attachments warning for text-only uploads', () => {
    const state = { activeChatId: 'chat-1' };
    const showToast = vi.fn();
    const setDraftAttachments = vi.fn();

    const destroy = bindChatFileEvents({
      state,
      uploadFile: vi.fn(),
      showToast,
      showToastProgress: vi.fn(() => ({ close: vi.fn() })),
      getDraftAttachments: vi.fn(() => []),
      setDraftAttachments,
      getAllowedNonLocalKinds: vi.fn(() => []),
      getFileContentType: vi.fn(() => 'text/plain'),
      isAttachmentAllowedByModel: vi.fn(() => false),
      isSupportedAttachmentType: vi.fn(() => true),
    });

    window.dispatchEvent(new CustomEvent('attach-files', {
      detail: { files: [{ id: 'f1', filename: 'Doc.txt', content_type: 'text/plain', file_size: 1 }] },
    }));

    expect(showToast).not.toHaveBeenCalledWith('Attachments are disabled for this model.');

    destroy();
  });
});


