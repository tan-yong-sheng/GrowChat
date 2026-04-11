import { fetchPublicSharedChat } from '../shared/api.js';
import { ensureMarkedReady } from '../shared/utils.js';
import { state, setState } from '../shared/store.js';
import { setSidebarRouteScope } from '../shared/utils/sidebar-visibility.js';
import { getChatIdFromPath } from './app-route-utils.js';
import {
  checkModelsInvalidation,
  ensureSession,
  installKnownErrorSuppressors,
  prefetchModels,
} from './session-bootstrap.js';
import {
  renderChatSkeleton,
  renderAdminSkeleton,
  renderSharedChatPage,
} from './app-shells.js';

async function renderAdminRoute(container) {
  try {
    const { renderAdminPage } = await import('../features/admin/admin.js');
    container.dataset.view = 'admin';
    return renderAdminPage(container);
  } catch (err) {
    throw err;
  }
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

let accountSettingsDrawerListenerInstalled = false;
function installAccountSettingsDrawerListener() {
  if (accountSettingsDrawerListenerInstalled) return;
  accountSettingsDrawerListenerInstalled = true;
  window.addEventListener('growchat:open-account-settings', async (event) => {
    const { openAccountSettingsDrawer } = await import('../features/account/account.js');
    await openAccountSettingsDrawer({ section: event?.detail?.section || 'connections' });
  });
}

let routeChangeListenerInstalled = false;
function installRouteChangeListener() {
  if (routeChangeListenerInstalled) return;
  routeChangeListenerInstalled = true;
  window.addEventListener('popstate', () => {
    void renderCurrentRoute();
  });
}

function cleanupRouteArtifacts() {
  const knownModalIds = [
    'account-connection-modal',
    'account-integration-modal',
    'add-connection-modal',
    'edit-connection-modal',
    'connection-acl-modal',
    'model-acl-modal',
    'tool-server-acl-modal',
    'policy-acl-modal',
  ];

  for (const id of knownModalIds) {
    document.getElementById(id)?.remove();
  }

  document.querySelector('[data-account-settings-drawer-mount="1"]')?.remove();
}

export async function renderCurrentRoute() {
  ensureMarkedReady();
  cleanupRouteArtifacts();
  const path = window.location.pathname;
  const app = document.getElementById('app');
  const sharedMatch = path.match(/^\/s\/([^/]+)$/);
  const routeChatId = getChatIdFromPath(path);

  if (path === '/admin/settings/roles' || path.startsWith('/admin/settings/roles/')) {
    window.history.replaceState({}, '', '/admin/users/roles');
    return renderCurrentRoute();
  }

  if (path === '/admin/settings/policies' || path.startsWith('/admin/settings/policies/')) {
    window.history.replaceState({}, '', '/admin/users/policies');
    return renderCurrentRoute();
  }

  if (path === '/admin/settings/general' || path.startsWith('/admin/settings/general/')) {
    window.history.replaceState({}, '', '/admin/system/general');
    return renderCurrentRoute();
  }

  if (path === '/admin' || path === '/admin/') {
    window.history.replaceState({}, '', '/admin/users/overview');
    return renderCurrentRoute();
  }

  if (path === '/admin/settings' || path === '/admin/settings/') {
    window.history.replaceState({}, '', '/admin/settings/connections');
    return renderCurrentRoute();
  }

  if (path === '/account' || path === '/account/' || path === '/account/profile' || path.startsWith('/account/profile/')) {
    window.history.replaceState({}, '', '/account/settings/connections');
    return renderCurrentRoute();
  }

  if (path === '/user/settings/resources' || path.startsWith('/user/settings/resources/')) {
    window.history.replaceState({}, '', '/');
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

  if (path.startsWith('/admin')) {
    renderAdminSkeleton(app);
  }

  const ok = await ensureSession({ preferRefresh: path.startsWith('/admin') });
  if (!ok) return;

  if (routeChatId && state.activeChatId !== routeChatId) {
    setState({ activeChatId: routeChatId });
  }

  if (path.startsWith('/admin')) {
    setSidebarRouteScope('admin');
    await renderAdminRoute(app);
    return;
  }

  if (path.startsWith('/account')) {
    const { openAccountSettingsDrawer, resolveAccountSectionFromPath } = await import('../features/account/account.js');
    const section = resolveAccountSectionFromPath(path);
    setSidebarRouteScope('account');
    await openAccountSettingsDrawer({ section });
    return;
  }

  setSidebarRouteScope('chat');

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
  installAccountSettingsDrawerListener();
  installRouteChangeListener();
  window.renderCurrentRoute = renderCurrentRoute;
  await renderCurrentRoute();
}

bootstrap();
