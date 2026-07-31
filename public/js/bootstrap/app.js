import { fetchPublicSharedChat } from '../shared/api.js';
console.log('[APP.JS] Top-level executing');
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
import { renderChatSkeleton, renderAdminSkeleton, renderSharedChatPage } from './app-shells.js';

async function renderAdminRoute(container) {
  const { renderAdminPage } = await import('../features/admin/admin.js');
  container.dataset.view = 'admin';
  return renderAdminPage(container);
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
    await openAccountSettingsDrawer({
      section: event?.detail?.section || 'connections',
    });
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

function isAdminRolesPath(path) {
  return path === '/admin/settings/roles' || path.startsWith('/admin/settings/roles/');
}

function isAdminPoliciesPath(path) {
  return path === '/admin/settings/policies' || path.startsWith('/admin/settings/policies/');
}

function isAdminRootPath(path) {
  return path === '/admin' || path === '/admin/';
}

function isAdminSettingsRootPath(path) {
  return path === '/admin/settings' || path === '/admin/settings/';
}

function isLegacyAccountPath(path) {
  return (
    path === '/account' ||
    path === '/account/' ||
    path === '/account/profile' ||
    path.startsWith('/account/profile/')
  );
}

function isLegacyResourcesPath(path) {
  return path === '/user/settings/resources' || path.startsWith('/user/settings/resources/');
}

function isVerifyPath(path) {
  // Email verification route removed in repo-reduction pass (see migration 007 + REDUCTION_EXECUTION_REPORT.md row 3b).
  // Kept as a redirect matcher so /verify* paths redirect to '/' via applyRedirects().
  return path === '/verify' || path.startsWith('/verify/');
}

const REDIRECTS = [
  { match: isAdminRolesPath, to: '/admin/users/roles' },
  { match: isAdminPoliciesPath, to: '/admin/users/policies' },
  { match: isAdminRootPath, to: '/admin/users/overview' },
  { match: isAdminSettingsRootPath, to: '/admin/settings/connections' },
  { match: isLegacyAccountPath, to: '/account/settings/connections' },
  { match: isLegacyResourcesPath, to: '/' },
  { match: isVerifyPath, to: '/' },
];

function applyRedirects(path) {
  for (const { match, to } of REDIRECTS) {
    if (match(path)) {
      window.history.replaceState({}, '', to);
      return true;
    }
  }
  return false;
}
async function handleSharedChatRoute(sharedMatch, app) {
  try {
    const data = await fetchPublicSharedChat(sharedMatch[1]);
    renderSharedChatPage(app, data);
  } catch {
    app.innerHTML = '<div class="p-8 text-center text-gray-500">Shared chat not found.</div>';
  }
}

function handleEarlyReturnRoutes(path, app, sharedMatch) {
  if (applyRedirects(path)) return { redirect: true };
  if (sharedMatch) return { handler: () => handleSharedChatRoute(sharedMatch, app) };
  return null;
}

function renderRouteSkeletons(path, app, sharedMatch) {
  if (!path.startsWith('/admin') && !sharedMatch && (!state.user || app.dataset.view === 'admin')) {
    renderChatSkeleton(app);
  }
  if (path.startsWith('/admin')) {
    renderAdminSkeleton(app);
  }
}

async function ensureRouteSession(path) {
  const isAdminSettingsRoute =
    path.startsWith('/admin/settings') || path.startsWith('/admin/system');
  return ensureSession({
    preferRefresh: path.startsWith('/admin') && !isAdminSettingsRoute,
  });
}

function syncActiveChatId(routeChatId) {
  if (routeChatId && state.activeChatId !== routeChatId) {
    setState({ activeChatId: routeChatId });
  }
}

async function handleAdminRoute(app) {
  setSidebarRouteScope('admin');
  await renderAdminRoute(app);
}

async function handleAccountRoute(path) {
  const { openAccountSettingsDrawer, resolveAccountSectionFromPath } =
    await import('../features/account/account.js');
  const section = resolveAccountSectionFromPath(path);
  setSidebarRouteScope('account');
  await openAccountSettingsDrawer({ section });
}

async function handleChatRoute(app) {
  setSidebarRouteScope('chat');
  await renderChatWithModels(app);
  applyQueryParams();
}

function dispatchAdminAccountChatRoute(path, app) {
  if (path.startsWith('/admin')) return handleAdminRoute(app);
  if (path.startsWith('/account')) return handleAccountRoute(path);
  return handleChatRoute(app);
}

async function renderChatWithModels(app) {
  const invalidateModels = checkModelsInvalidation();
  if (invalidateModels) {
    setState({ models: [], modelsLoading: true });
    prefetchModels({ allowCache: false, cacheBust: invalidateModels });
  }
  const renderChat = await ensureRenderChat();
  renderChat(app);
  app.dataset.view = 'chat';
}

function applyQueryParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const q = urlParams.get('q');
  const shouldSubmit = urlParams.get('submit') === 'true';
  if (!q) return;
  const input = document.getElementById('message-input');
  if (!input) return;
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (shouldSubmit) {
    document.getElementById('composer')?.dispatchEvent(new Event('submit', { bubbles: true }));
  }
}

export async function renderCurrentRoute() {
  console.log('[APP.JS] renderCurrentRoute starting, path:', window.location.pathname);
  ensureMarkedReady();
  cleanupRouteArtifacts();
  const path = window.location.pathname;
  const app = document.getElementById('app');
  const sharedMatch = path.match(/^\/s\/([^/]+)$/);
  const routeChatId = getChatIdFromPath(path);

  const earlyResult = handleEarlyReturnRoutes(path, app, sharedMatch);
  if (earlyResult?.redirect) return renderCurrentRoute();
  if (earlyResult) await earlyResult.handler();

  renderRouteSkeletons(path, app, sharedMatch);

  const ok = await ensureRouteSession(path);
  if (!ok) return;

  syncActiveChatId(routeChatId);

  await dispatchAdminAccountChatRoute(path, app);
}

async function bootstrap() {
  installKnownErrorSuppressors();
  ensureMarkedReady();
  installAccountSettingsDrawerListener();
  installRouteChangeListener();
  const { prefetchModels } = await import('./session-bootstrap.js');
  setState({
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', enabled: true, hidden_for_user: false },
    ],
    modelsLoading: false,
  });
  prefetchModels({ allowCache: true });
  window.renderCurrentRoute = renderCurrentRoute;
  await renderCurrentRoute();
}

bootstrap();
