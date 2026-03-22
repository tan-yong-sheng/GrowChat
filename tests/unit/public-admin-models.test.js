// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  broadcastModelsInvalidation: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/utils/model-sync.js', () => ({
  broadcastModelsInvalidation: (...args) => mocks.broadcastModelsInvalidation(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/settings/models.js');
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

  it('filters provider options to active entries and uses provider name in requests', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'model-a', name: 'Model A', enabled: true, attachments: { image: false, pdf: false } },
            { id: 'model-b', name: 'Model B', enabled: false, attachments: { image: false, pdf: false } },
          ],
          total: 2,
          active_total: 1,
          providers: [
            { value: 'openai main', label: 'OpenAI Main', active: 1, total: 2 },
            { value: 'claude main', label: 'Claude Main', active: 0, total: 2 },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/models?limit=20&offset=0'));
    await vi.waitFor(() => expect(container.querySelector('#model-provider-select')).not.toBeNull());
    await vi.waitFor(() => {
      const select = container.querySelector('#model-provider-select');
      const text = Array.from(select.options).map((option) => option.textContent.trim()).join(' ');
      expect(text).toContain('OpenAI Main');
    });

    const providerSelect = container.querySelector('#model-provider-select');
    const options = Array.from(providerSelect.options).map((option) => option.textContent.trim());
    const joined = options.join(' ');
    expect(joined).toContain('All Providers');
    expect(joined).toContain('OpenAI Main');
    expect(joined).not.toContain('Claude Main');

    const beforeCalls = mocks.apiFetch.mock.calls.length;
    providerSelect.value = providerSelect.options[1]?.value || 'openai main';
    providerSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(mocks.apiFetch.mock.calls.length).toBeGreaterThan(beforeCalls));
    expect(
      mocks.apiFetch.mock.calls.some(([url]) => /provider=openai(\+|%20)main/.test(String(url)))
    ).toBe(true);
  });
});


