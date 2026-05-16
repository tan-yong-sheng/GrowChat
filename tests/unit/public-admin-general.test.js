// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));
vi.mock('../../public/js/shared/utils.js', () => ({
  escapeHtml: (str) =>
    String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;'),
  renderMessageContent: (content) => String(content ?? ''),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/settings/general.js');
}

describe('admin general settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="general"></div>';
    localStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url) === '/api/models?scope=global') {
        return new Response(
          JSON.stringify({
            models: [{ id: 'model-a', name: 'Model A' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (String(url) === '/api/admin/config') {
        return new Response(
          JSON.stringify({
            public_registration: true,
            public_registration_status: 'pending',
            default_model_id: '',
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

  it('makes immediate API calls when a general setting changes', async () => {
    const { renderGeneralSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderGeneralSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/models?scope=global'));
    await vi.waitFor(() => expect(data.generalSettings.models.length).toBe(1));

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
    const { renderGeneralSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderGeneralSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/models?scope=global'));
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
