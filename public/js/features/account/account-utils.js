/**
 * Utility functions and section renderers for the account page.
 */
import { apiFetch } from '../../shared/api.js';

export const accountSectionRenderers = {
  connections: null,
  models: null,
  integrations: null,
  sessions: null,
};

export async function loadAccountSectionRenderer(section) {
  const normalized = normalizeAccountSection(section);
  if (accountSectionRenderers[normalized]) {
    return accountSectionRenderers[normalized];
  }

  if (normalized === 'connections') {
    accountSectionRenderers.connections = import('./account-connections.js').then(
      ({ renderAccountConnectionsSection }) => renderAccountConnectionsSection
    );
    return accountSectionRenderers.connections;
  }

  if (normalized === 'models') {
    accountSectionRenderers.models = import('./account-models.js').then(
      ({ renderAccountModelsSection }) => renderAccountModelsSection
    );
    return accountSectionRenderers.models;
  }
  if (normalized === 'sessions') {
    accountSectionRenderers.sessions = import('./sessions.js').then(
      ({ renderSessionsSection }) => renderSessionsSection
    );
    return accountSectionRenderers.sessions;
  }

  accountSectionRenderers.integrations = import('./account-integrations.js').then(
    ({ renderAccountIntegrationsSection }) => renderAccountIntegrationsSection
  );
  return accountSectionRenderers.integrations;
}

export function normalizeAccountSection(section) {
  const value = String(section || '').trim();
  if (
    value === 'connections' ||
    value === 'models' ||
    value === 'integrations' ||
    value === 'sessions'
  ) {
    return value;
  }
  return 'connections';
}

export function resolveAccountSectionFromPath(pathname) {
  if (
    pathname === '/account' ||
    pathname === '/account/' ||
    pathname === '/account/profile' ||
    pathname.startsWith('/account/profile/')
  ) {
    return 'connections';
  }
  if (pathname.startsWith('/account/settings/connections')) return 'connections';
  if (pathname.startsWith('/account/settings/models')) return 'models';
  if (pathname.startsWith('/account/settings/integrations')) return 'integrations';
  if (pathname.startsWith('/account/settings/sessions')) return 'sessions';
  if (pathname.startsWith('/account/settings/security')) return 'sessions';
  return 'connections';
}

export function getAccountSectionPath(section) {
  switch (normalizeAccountSection(section)) {
    case 'connections':
      return '/account/settings/connections';
    case 'models':
      return '/account/settings/models';
    case 'integrations':
      return '/account/settings/integrations';
    case 'sessions':
      return '/account/settings/sessions';
    default:
      return '/account/settings/connections';
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function loadAccountState() {
  const res = await apiFetch('/api/users/me/settings');
  if (!res.ok) {
    throw new Error('Failed to load account settings');
  }
  return res.json();
}

export function renderOverview(state) {
  const user = state.user || {};
  const preferences = state.settings?.preferences || {};
  return `
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">Profile</div>
        <div class="mt-3 flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-700">${escapeHtml(user.avatar_emoji || user.name?.[0] || 'U')}</div>
          <div>
            <div class="text-base font-semibold text-gray-900">${escapeHtml(user.name || 'User')}</div>
            <div class="text-sm text-gray-500">${escapeHtml(user.email || '')}</div>
          </div>
        </div>
        <div class="mt-4 space-y-2 text-sm text-gray-600">
          <div><span class="font-medium text-gray-900">Status:</span> ${escapeHtml(user.status || 'offline')}</div>
          <div><span class="font-medium text-gray-900">Role:</span> ${escapeHtml(user.primary_role || 'member')}</div>
          <div><span class="font-medium text-gray-900">Theme:</span> ${escapeHtml(preferences.theme || 'system')}</div>
        </div>
      </section>
    </div>
  `;
}
