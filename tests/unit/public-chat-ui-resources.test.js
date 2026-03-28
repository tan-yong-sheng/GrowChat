// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatUiResources } from '../../public/js/features/chat/chat-ui-resources.js';

describe('chat ui resources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '<div id="root"><div id="sidebar"></div><div id="sidebar-footer"></div></div>';
  });

  it('memoizes modal loaders and attaches the profile footer on idle', async () => {
    const root = document.getElementById('root');
    const loadSearchModal = vi.fn(async () => ({ renderSearchModal: vi.fn() }));
    const loadFilesModal = vi.fn(async () => ({ renderFilesModal: vi.fn() }));
    const loadUserProfileFooter = vi.fn(async () => ({
      createUserProfileFooter: () => {
        const footer = document.createElement('div');
        footer.textContent = 'footer';
        return footer;
      },
    }));

    const resources = createChatUiResources({
      state: { toolServersLoaded: false, toolServersLoading: false },
      setState: vi.fn(),
      fetchToolServers: vi.fn(),
      consumeToolServersInvalidation: vi.fn(),
      getFileBlob: vi.fn(),
      loadSearchModal,
      loadFilesModal,
      loadUserProfileFooter,
    });

    await resources.loadSearchModalModule();
    await resources.loadSearchModalModule();
    await resources.loadFilesModalModule();
    await resources.loadFilesModalModule();
    expect(loadSearchModal).toHaveBeenCalledTimes(1);
    expect(loadFilesModal).toHaveBeenCalledTimes(1);

    resources.scheduleSidebarEnhancements(root);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadUserProfileFooter).toHaveBeenCalledTimes(1);
    expect(root.querySelector('#sidebar-footer')?.textContent).toBe('footer');
  });

  it('refreshes tool servers on invalidation and caches attachment images', async () => {
    const setState = vi.fn();
    const fetchToolServers = vi.fn().mockResolvedValue({ servers: [{ id: 't1' }] });
    const consumeToolServersInvalidation = vi.fn().mockReturnValue('token-1');
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-1');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const resources = createChatUiResources({
      state: { toolServersLoaded: true, toolServersLoading: false },
      setState,
      fetchToolServers,
      consumeToolServersInvalidation,
      getFileBlob: vi.fn().mockResolvedValue(new Blob(['img'], { type: 'image/png' })),
      maxAttachmentCache: 1,
    });

    const token = resources.checkToolServersInvalidation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(token).toBe('token-1');
    expect(fetchToolServers).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledWith({ toolServersLoaded: false, toolServersLoading: false });

    const container = document.createElement('div');
    const img = document.createElement('img');
    img.setAttribute('data-attachment-image', 'file-1');
    container.appendChild(img);

    const first = await resources.getAttachmentImageUrl('file-1');
    const second = await resources.getAttachmentImageUrl('file-1');
    resources.hydrateAttachmentImages(container);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(first).toBe('blob:mock-1');
    expect(second).toBe('blob:mock-1');
    expect(container.querySelector('img')?.src).toContain('blob:mock-1');
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).not.toHaveBeenCalled();
  });
});
