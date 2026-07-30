// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/settings/registration.js');
}

describe('admin registration settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="registration"></div>';
    localStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url) === '/api/admin/config') {
        return new Response(
          JSON.stringify({
            public_registration: true,
            public_registration_status: 'pending',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  });

  it('renders the public registration toggle', async () => {
    const { renderRegistrationSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};
    renderRegistrationSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('#public-reg-toggle')).not.toBeNull());
  });

  it('saves public registration toggle changes immediately to the admin config API', async () => {
    const { renderRegistrationSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};
    renderRegistrationSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('#public-reg-toggle')).not.toBeNull());
    const initialCallCount = mocks.apiFetch.mock.calls.length;
    container.querySelector('#public-reg-toggle')?.click();
    await vi.waitFor(() =>
      expect(mocks.apiFetch.mock.calls.length).toBeGreaterThan(initialCallCount)
    );
    const putCall = mocks.apiFetch.mock.calls.find(
      ([url, options]) => String(url) === '/api/admin/config' && options?.method === 'PUT'
    );
    expect(putCall).toBeTruthy();
    expect(putCall[1].body).toBe(JSON.stringify({ public_registration: false }));
  });

  it('saves registration status changes immediately to the admin config API', async () => {
    const { renderRegistrationSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};
    renderRegistrationSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('#registration-status')).not.toBeNull());
    const registrationStatus = container.querySelector('#registration-status');
    registrationStatus.value = 'active';
    registrationStatus.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      const putCall = mocks.apiFetch.mock.calls.find(
        ([url, options]) => String(url) === '/api/admin/config' && options?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
    const putCall = mocks.apiFetch.mock.calls.find(
      ([url, options]) => String(url) === '/api/admin/config' && options?.method === 'PUT'
    );
    expect(putCall[1].body).toBe(JSON.stringify({ public_registration_status: 'active' }));
  });
});
