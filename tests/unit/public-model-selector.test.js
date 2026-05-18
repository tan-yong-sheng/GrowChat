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
    expect(container.textContent).toContain('Model');
    expect(container.textContent).toContain('Selectable in chat');
    expect(container.querySelector('#model-selector-btn').getAttribute('aria-label')).toBe(
      'Select model'
    );
    destroy();
  });

  it('shows a scope-aware empty state when no selectable models exist', async () => {
    const { store, renderModelSelector } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [],
      activeModelId: null,
      defaultModelId: null,
      globalDefaultModelId: null,
    });

    const destroy = renderModelSelector(container);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toContain('Selectable in chat');
    expect(container.textContent).toContain(
      'No selectable models are currently available for this chat.'
    );
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
    expect(container.textContent).toContain('Model');
    expect(container.textContent).not.toContain('Unknown model');
    destroy();
  });

  it('updates the active model when a model is selected', async () => {
    const { store, renderModelSelector } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [
        { id: 'm1', name: 'GPT Mini', access_label: 'Personal', access_variant: 'personal' },
        { id: 'm2', name: 'Claude', access_label: 'Shared', access_variant: 'shared' },
      ],
      activeModelId: 'm1',
    });

    const destroy = renderModelSelector(container);
    container.querySelector('#model-selector-btn').click();
    expect(container.textContent).toContain('Personal');
    expect(container.textContent).toContain('Shared');
    container.querySelector('button[data-model-id="m2"]').click();
    expect(store.state.activeModelId).toBe('m2');
    destroy();
  });

  it('has type="button" on model-selector-btn to prevent form submit (issue #48)', async () => {
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
    const btn = container.querySelector('#model-selector-btn');
    expect(btn).not.toBeNull();
    // Per HTML spec, the default type for <button> is "submit", which causes
    // unintended form submission when the button is inside a <form>.
    // The button must explicitly declare type="button" to prevent this.
    expect(btn.getAttribute('type')).toBe('button');
    destroy();
  });

  it('shows a fallback notice when the active model is no longer available', async () => {
    const { store, renderModelSelector } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [
        { id: 'm2', name: 'Claude' },
        { id: 'm3', name: 'Gemini' },
      ],
      modelCatalogMeta: {
        disabled_model_ids: ['m1'],
        hidden_model_ids: [],
      },
      activeModelId: 'm1',
      defaultModelId: null,
      globalDefaultModelId: null,
      ui: { modelAvailabilityNotice: null },
    });

    const destroy = renderModelSelector(container);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.state.activeModelId).toBe('m2');
    expect(container.textContent).toContain(
      'Your previous model was disabled by an admin. Switched to Claude.'
    );
    expect(container.querySelector('#model-selector-notice').className).not.toContain('hidden');
    destroy();
  });
});
