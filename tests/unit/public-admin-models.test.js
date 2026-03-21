// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  broadcastModelsInvalidation: vi.fn(),
}));

vi.mock('../../public/js/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/utils/model-sync.js', () => ({
  broadcastModelsInvalidation: (...args) => mocks.broadcastModelsInvalidation(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/components/admin/settings/models.js');
}

describe('admin models settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="models"></div>';
    vi.clearAllMocks();
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'model-a', name: 'Model A', enabled: true, attachments: { image: false, pdf: false } },
          ],
          total: 1,
          active_total: 1,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url) === '/api/admin/model-attachment-caps') {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });

  it('keeps the main Save button enabled after a model toggle changes', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/models?limit=20&offset=0'));
    await vi.waitFor(() => expect(data.modelsSettings.loading).toBe(false));
    await vi.waitFor(() => expect(container.querySelector('#save-models-top')).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('#save-models-top')?.disabled).toBe(true));

    expect(container.querySelector('#save-models-top').disabled).toBe(true);
    container.querySelector('.model-toggle')?.click();

    expect(container.querySelector('#save-models-top')?.disabled).toBe(false);
  });
});
