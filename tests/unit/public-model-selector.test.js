// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/shared/utils.js', () => ({
  showToast: vi.fn(),
  showToastProgress: vi.fn(() => ({ update: vi.fn() })),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: vi.fn(),
}));

async function loadModules() {
  vi.resetModules();
  const store = await import('../../public/js/shared/store.js');
  const { renderModelSelector } = await import('../../public/js/features/chat/model-selector.js');
  return { store, renderModelSelector };
}

describe('model selector', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the active model name', async () => {
    const { store, renderModelSelector } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [
        { id: 'm1', name: 'GPT Mini' },
        { id: 'm2', name: 'Claude' },
      ],
      activeModelId: 'm1',
    });

    const destroy = renderModelSelector(container);

    expect(container.textContent).toContain('GPT Mini');

    destroy();
  });

  it('falls back to the first alphabetical model when no active model is set', async () => {
    const { store, renderModelSelector } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [
        { id: 'm2', name: 'Zulu' },
        { id: 'm1', name: 'Alpha' },
      ],
      activeModelId: null,
      defaultModelId: null,
      globalDefaultModelId: null,
    });

    const destroy = renderModelSelector(container);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.state.activeModelId).toBe('m1');
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).not.toContain('Unknown model');

    destroy();
  });

  it('updates the active model when a model is selected', async () => {
    const { store, renderModelSelector } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [
        { id: 'm1', name: 'GPT Mini' },
        { id: 'm2', name: 'Claude' },
      ],
      activeModelId: 'm1',
    });

    const destroy = renderModelSelector(container);
    container.querySelector('#model-selector-btn').click();
    container.querySelector('button[data-model-id="m2"]').click();

    expect(store.state.activeModelId).toBe('m2');

    destroy();
  });

  it('shows unset default when the current model is already the default', async () => {
    const { store, renderModelSelector } = await loadModules();
    const container = document.getElementById('root');
    const { apiFetch } = await import('../../public/js/shared/api.js');
    apiFetch.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    store.setState({
      user: { preferences: { defaultModelId: 'm2' } },
      models: [
        { id: 'm1', name: 'GPT Mini' },
        { id: 'm2', name: 'Claude' },
      ],
      activeModelId: 'm2',
      defaultModelId: 'm2',
    });

    const destroy = renderModelSelector(container);

    expect(container.querySelector('#header-set-default-btn').textContent).toBe('Unset default');

    container.querySelector('#header-set-default-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiFetch).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ preferences: {} }),
    }));
    expect(store.state.defaultModelId).toBeNull();
    expect(localStorage.getItem('defaultModelId')).toBeNull();

    destroy();
  });

  it('persists the active model as the default model when requested', async () => {
    const { store, renderModelSelector } = await loadModules();
    const container = document.getElementById('root');
    const { apiFetch } = await import('../../public/js/shared/api.js');
    apiFetch.mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    store.setState({
      user: { preferences: {} },
      models: [
        { id: 'm1', name: 'GPT Mini' },
        { id: 'm2', name: 'Claude' },
      ],
      activeModelId: 'm2',
      defaultModelId: null,
    });

    const destroy = renderModelSelector(container);
    container.querySelector('#header-set-default-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiFetch).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ preferences: { defaultModelId: 'm2' } }),
    }));
    expect(store.state.defaultModelId).toBe('m2');
    expect(localStorage.getItem('defaultModelId')).toBe('m2');

    destroy();
  });
});


