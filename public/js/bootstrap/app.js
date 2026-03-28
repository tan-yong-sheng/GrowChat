import { fetchPublicSharedChat } from '../shared/api.js';
import { ensureMarkedReady } from '../shared/utils.js';
import { state, setState } from '../shared/store.js';
import { getChatIdFromPath } from './app-route-utils.js';
import {
  checkModelsInvalidation,
  ensureSession,
  installKnownErrorSuppressors,
  prefetchModels,
} from './session-bootstrap.js';
import {
  renderChatSkeleton,
  renderSharedChatPage,
} from './app-shells.js';

async function renderAdminRoute(container) {
  const { renderAdminPage } = await import('../features/admin/admin.js');
  container.dataset.view = 'admin';
  return renderAdminPage(container);
}

async function renderUserResourcesRoute(container) {
  const { renderUserResources } = await import('../features/user/resources.js');
  container.dataset.view = 'user-settings';
  return renderUserResources(container);
}

let renderChatFn = null;
async function ensureRenderChat() {
  if (renderChatFn) return renderChatFn;
  const mod = await import('../features/chat/chat.js');
  renderChatFn = mod.renderChat;
  return renderChatFn;
}

export async function renderCurrentRoute() {
  ensureMarkedReady();
  const path = window.location.pathname;
  const app = document.getElementById('app');
  const sharedMatch = path.match(/^\/s\/([^/]+)$/);
  const routeChatId = getChatIdFromPath(path);
  const isUserSettings = path.startsWith('/user/settings');

  if (path === '/admin/settings/roles' || path.startsWith('/admin/settings/roles/')) {
    const url = new URL(window.location.href);
    url.pathname = '/admin/users/roles';
    window.history.replaceState({}, '', url);
    return renderCurrentRoute();
  }

  if (path === '/admin/settings/policies' || path.startsWith('/admin/settings/policies/')) {
    const url = new URL(window.location.href);
    url.pathname = '/admin/users/policies';
    window.history.replaceState({}, '', url);
    return renderCurrentRoute();
  }

  if (sharedMatch) {
    try {
      const data = await fetchPublicSharedChat(sharedMatch[1]);
      renderSharedChatPage(app, data);
    } catch {
      app.innerHTML = '<div class="p-8 text-center text-gray-500">Shared chat not found.</div>';
    }
    return;
  }

  if (!path.startsWith('/admin') && !isUserSettings && !sharedMatch && (!state.user || app.dataset.view === 'admin')) {
    renderChatSkeleton(app);
  }

  const ok = await ensureSession({ preferRefresh: path.startsWith('/admin') });
  if (!ok) return;

  if (routeChatId && state.activeChatId !== routeChatId) {
    setState({ activeChatId: routeChatId });
  }

  if (path.startsWith('/admin')) {
    await renderAdminRoute(app);
    return;
  }

  if (isUserSettings) {
    await renderUserResourcesRoute(app);
    return;
  }

  const invalidateModels = checkModelsInvalidation();
  if (invalidateModels) {
    setState({ models: [], modelsLoading: true });
    prefetchModels({ allowCache: false, cacheBust: invalidateModels });
  }

  const renderChat = await ensureRenderChat();
  renderChat(app);
  app.dataset.view = 'chat';

  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('q');
  const shouldSubmit = urlParams.get('submit') === 'true';
  if (q) {
    const input = document.getElementById('message-input');
    if (input) {
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (shouldSubmit) {
        document.getElementById('composer')?.dispatchEvent(new Event('submit', { bubbles: true }));
      }
    }
  }
}

async function bootstrap() {
  installKnownErrorSuppressors();
  ensureMarkedReady();
  await renderCurrentRoute();
}

bootstrap();
