// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../public/js/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/components/admin/settings/general.js');
}

describe('admin general settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="general"></div>';
    localStorage.clear();
    vi.clearAllMocks();
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url) === '/api/models') {
        return new Response(JSON.stringify({
          models: [{ id: 'model-a', name: 'Model A' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url) === '/api/admin/config') {
        return new Response(JSON.stringify({
          public_registration: true,
          default_model_id: '',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });

  it('keeps the main Save button enabled after a general setting changes', async () => {
    const { renderGeneralSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderGeneralSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/models'));
    await vi.waitFor(() => expect(data.generalSettings.models.length).toBe(1));
    await vi.waitFor(() => expect(container.querySelector('#save-settings')).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('#save-settings')?.disabled).toBe(true));

    expect(container.querySelector('#save-settings').disabled).toBe(true);
    container.querySelector('#public-reg-toggle')?.click();

    expect(container.querySelector('#save-settings')?.disabled).toBe(false);
  });
});
