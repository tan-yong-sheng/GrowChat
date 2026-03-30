// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  ensureMarkedReady: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/utils.js', () => ({
  ensureMarkedReady: (...args) => mocks.ensureMarkedReady(...args),
}));

async function loadModule() {
  vi.resetModules();
  const { renderAccountPage } = await import('../../public/js/features/account/account.js');
  return { renderAccountPage };
}

function makeAccountState() {
  return {
    user: {
      id: 'u1',
      name: 'Sam',
      email: 'sam@example.com',
      primary_role: 'member',
      avatar_emoji: 'S',
      status: 'online',
    },
    permissions: ['chat.read'],
    roles: [{ role_name: 'member' }],
    app_config: { default_model_id: 'gpt-5-mini' },
    settings: {
      general: {
        name: 'Sam',
        email: 'sam@example.com',
        avatar: null,
        avatar_emoji: 'S',
        status: 'online',
        account_status: 'active',
        settings: {},
      },
      preferences: { theme: 'system' },
      connections: { my_connections: [], connections: [] },
      integrations: { servers: [] },
      tool_servers: { servers: [] },
      models: { default_model_id: null },
    },
  };
}

describe('account shell tabs', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    mocks.ensureMarkedReady.mockReset();
    mocks.apiFetch.mockReset();
  });

  it('renders Profile and Settings tabs on the profile overview route', async () => {
    window.history.pushState({}, '', '/account/profile/overview');
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => makeAccountState(),
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));

    const tabs = Array.from(document.querySelectorAll('[data-account-area-tab]'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Profile', 'Settings']);
    expect(tabs[0].getAttribute('href')).toBe('/account/profile/overview');
    expect(tabs[1].getAttribute('href')).toBe('/account/settings/connections');
    expect(tabs[0].className).toContain('text-gray-900');
    expect(tabs[0].className).toContain('underline');
    expect(tabs[1].className).toContain('text-gray-300');
    expect(document.querySelector('#toggle-sidebar-mobile')).not.toBeNull();
    expect(document.body.textContent).toContain('Profile');
    expect(document.body.textContent).toContain('Settings');
    expect(document.querySelector('#account-main-footer')).not.toBeNull();

    const innerTabs = Array.from(document.querySelectorAll('#account-tabs-container [data-subnav]'));
    expect(innerTabs.map((tab) => tab.textContent?.trim())).toEqual(['Overview']);
  }, 10000);

  it('keeps Settings active on a settings subsection route', async () => {
    window.history.pushState({}, '', '/account/settings/connections');
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => makeAccountState(),
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));

    const tabs = Array.from(document.querySelectorAll('[data-account-area-tab]'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Profile', 'Settings']);
    expect(tabs[0].getAttribute('href')).toBe('/account/profile/overview');
    expect(tabs[1].getAttribute('href')).toBe('/account/settings/connections');
    expect(tabs[0].className).toContain('text-gray-300');
    expect(tabs[1].className).toContain('text-gray-900');
    expect(tabs[1].className).toContain('underline');
    expect(document.querySelector('#toggle-sidebar-mobile')).not.toBeNull();
    expect(document.querySelector('h1')).toBeNull();
    expect(document.body.textContent).toContain('Settings');
    expect(document.querySelector('[data-subnav="connections"]')?.className).toContain('bg-gray-100');
    expect(document.querySelector('#account-main-footer')).not.toBeNull();

    const innerTabs = Array.from(document.querySelectorAll('#account-tabs-container [data-subnav]'));
    expect(innerTabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Connections',
      'Models',
      'Integrations',
    ]);
  });

  it('renders the shared workspace sidebar chrome', async () => {
    window.history.pushState({}, '', '/account/profile/overview');
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => makeAccountState(),
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));

    expect(document.querySelector('#workspace-home-link')).toBeTruthy();
    expect(document.querySelector('#new-chat')).toBeTruthy();
    expect(document.querySelector('#open-search')).toBeTruthy();
    expect(document.querySelector('#sidebar')).toBeTruthy();
  });
});
