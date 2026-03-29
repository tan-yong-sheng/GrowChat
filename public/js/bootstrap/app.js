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

async function renderAccountRoute(container) {
  const { renderAccountPage } = await import('../features/account/account.js');
  container.dataset.view = 'account';
  return renderAccountPage(container);
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

  if (path === '/admin/settings/general' || path.startsWith('/admin/settings/general/')) {
    const url = new URL(window.location.href);
    url.pathname = '/admin/system/general';
    window.history.replaceState({}, '', url);
    return renderCurrentRoute();
  }

  if (path === '/admin/settings' || path === '/admin/settings/') {
    const url = new URL(window.location.href);
    url.pathname = '/admin/settings/connections';
    window.history.replaceState({}, '', url);
    return renderCurrentRoute();
  }

  if (path === '/user/settings/resources' || path.startsWith('/user/settings/resources/')) {
    window.history.replaceState({}, '', '/');
    return renderCurrentRoute();
  }

  if (path === '/account/settings' || path === '/account/settings/') {
    window.history.replaceState({}, '', '/account/settings/connections');
    return renderCurrentRoute();
  }

  if (path === '/account/settings/general' || path.startsWith('/account/settings/general/')) {
    window.history.replaceState({}, '', '/account/profile/overview');
    return renderCurrentRoute();
  }

  if (path === '/account/settings/preferences' || path.startsWith('/account/settings/preferences/')) {
    window.history.replaceState({}, '', '/account/profile/overview');
    return renderCurrentRoute();
  }

  if (path === '/account/profile/general' || path.startsWith('/account/profile/general/')) {
    window.history.replaceState({}, '', '/account/profile/overview');
    return renderCurrentRoute();
  }

  if (path === '/account/profile/preferences' || path.startsWith('/account/profile/preferences/')) {
    window.history.replaceState({}, '', '/account/profile/overview');
    return renderCurrentRoute();
  }

  if (path === '/account/profile' || path === '/account/profile/') {
    window.history.replaceState({}, '', '/account/profile/overview');
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

  if (!path.startsWith('/admin') && !sharedMatch && (!state.user || app.dataset.view === 'admin')) {
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

  if (path.startsWith('/account')) {
    await renderAccountRoute(app);
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
