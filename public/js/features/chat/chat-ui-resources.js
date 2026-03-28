import {
  clearAttachmentCache as clearAttachmentCacheHelper,
  touchAttachmentCache as touchAttachmentCacheHelper,
} from '../../shared/utils/chat-cache.js';

export function createChatUiResources({
  state,
  setState,
  fetchToolServers,
  consumeToolServersInvalidation,
  getFileBlob,
  loadSearchModal = () => import('../../shared/components/search-modal.js'),
  loadFilesModal = () => import('../../shared/components/files-modal.js'),
  loadUserProfileFooter = () => import('../../shared/components/user-profile-footer.js'),
  maxAttachmentCache = 48,
} = {}) {
  let searchModalPromise = null;
  let filesModalPromise = null;
  let userProfileFooterPromise = null;
  let toolServersInvalidationListenerBound = false;
  let toolServersRefreshGeneration = 0;
  let toolServersRefreshPromise = null;
  let toolServersStorageListener = null;
  let toolServersCustomListener = null;
  const attachmentImageUrlCache = new Map();
  const attachmentImagePromiseCache = new Map();

  const loadSearchModalModule = () => (searchModalPromise ??= loadSearchModal());
  const loadFilesModalModule = () => (filesModalPromise ??= loadFilesModal());
  const loadUserProfileFooterModule = () => (userProfileFooterPromise ??= loadUserProfileFooter());

  function clearAttachmentCaches() {
    clearAttachmentCacheHelper(attachmentImageUrlCache, attachmentImagePromiseCache);
  }

  function scheduleSidebarEnhancements(root) {
    const run = () => {
      loadUserProfileFooterModule()
        .then(({ createUserProfileFooter }) => createUserProfileFooter())
        .then((footer) => {
          if (!footer) return;
          const footerMount = root.querySelector('#sidebar-footer');
          if (footerMount) {
            footerMount.replaceChildren(footer);
          } else {
            const sidebar = root.querySelector('#sidebar');
            if (sidebar) sidebar.appendChild(footer);
          }
        })
        .catch(() => {});
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 0);
    }
  }

  function refreshAllowedToolServers({ force = false } = {}) {
    if (!force && (state.toolServersLoaded || state.toolServersLoading)) {
      return toolServersRefreshPromise;
    }

    const requestGeneration = ++toolServersRefreshGeneration;
    setState({ toolServersLoading: true });

    const requestPromise = fetchToolServers()
      .then((payload) => {
        if (requestGeneration !== toolServersRefreshGeneration) return payload;
        setState({
          toolServers: Array.isArray(payload?.servers) ? payload.servers : [],
          toolServersLoaded: true,
          toolServersLoading: false,
        });
        return payload;
      })
      .catch((err) => {
        if (requestGeneration !== toolServersRefreshGeneration) return null;
        console.warn('Failed to load tool servers:', err);
        setState({
          toolServers: [],
          toolServersLoaded: true,
          toolServersLoading: false,
        });
        return null;
      })
      .finally(() => {
        if (toolServersRefreshPromise === requestPromise) {
          toolServersRefreshPromise = null;
        }
      });

    toolServersRefreshPromise = requestPromise;
    return requestPromise;
  }

  function loadAllowedToolServers() {
    return refreshAllowedToolServers();
  }

  function checkToolServersInvalidation() {
    const token = consumeToolServersInvalidation?.();
    if (!token) return null;
    toolServersRefreshGeneration += 1;
    toolServersRefreshPromise = null;
    setState({ toolServersLoaded: false, toolServersLoading: false });
    refreshAllowedToolServers({ force: true });
    return token;
  }

  function bindToolServersInvalidationListener() {
    if (toolServersInvalidationListenerBound) return;
    toolServersStorageListener = (event) => {
      if (event.key !== 'growchat_tool_servers_invalidate') return;
      checkToolServersInvalidation();
    };
    toolServersCustomListener = () => {
      checkToolServersInvalidation();
    };
    window.addEventListener('storage', toolServersStorageListener);
    window.addEventListener('growchat:tool-servers-invalidated', toolServersCustomListener);
    toolServersInvalidationListenerBound = true;
  }

  function unbindToolServersInvalidationListener() {
    if (!toolServersInvalidationListenerBound) return;
    if (toolServersStorageListener) {
      window.removeEventListener('storage', toolServersStorageListener);
    }
    if (toolServersCustomListener) {
      window.removeEventListener('growchat:tool-servers-invalidated', toolServersCustomListener);
    }
    toolServersStorageListener = null;
    toolServersCustomListener = null;
    toolServersInvalidationListenerBound = false;
  }

  async function getAttachmentImageUrl(fileId) {
    const key = String(fileId || '');
    if (!key) return null;
    if (attachmentImageUrlCache.has(key)) {
      const cached = attachmentImageUrlCache.get(key);
      touchAttachmentCacheHelper(attachmentImageUrlCache, key, cached, maxAttachmentCache);
      return cached;
    }
    if (attachmentImagePromiseCache.has(key)) return attachmentImagePromiseCache.get(key);

    const promise = (async () => {
      const blob = await getFileBlob(key);
      const url = URL.createObjectURL(blob);
      touchAttachmentCacheHelper(attachmentImageUrlCache, key, url, maxAttachmentCache);
      attachmentImagePromiseCache.delete(key);
      return url;
    })().catch((err) => {
      attachmentImagePromiseCache.delete(key);
      throw err;
    });

    attachmentImagePromiseCache.set(key, promise);
    return promise;
  }

  function hydrateAttachmentImages(containerEl) {
    if (!containerEl) return;
    const nodes = containerEl.querySelectorAll('[data-attachment-image]');
    nodes.forEach((img) => {
      const id = img.getAttribute('data-attachment-image');
      if (!id || img.dataset.attachmentLoaded === '1') return;
      img.dataset.attachmentLoaded = '1';
      img.classList.add('opacity-0');
      getAttachmentImageUrl(id)
        .then((url) => {
          if (!url) return;
          img.src = url;
          img.classList.remove('opacity-0');
        })
        .catch(() => {
          img.classList.add('hidden');
        });
    });
  }

  return {
    loadSearchModalModule,
    loadFilesModalModule,
    loadUserProfileFooterModule,
    scheduleSidebarEnhancements,
    refreshAllowedToolServers,
    loadAllowedToolServers,
    checkToolServersInvalidation,
    bindToolServersInvalidationListener,
    unbindToolServersInvalidationListener,
    getAttachmentImageUrl,
    hydrateAttachmentImages,
    clearAttachmentCaches,
  };
}
