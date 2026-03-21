// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/shared/api.js', () => ({
  fetchPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
  fetchPromptByCommand: vi.fn().mockResolvedValue({ prompt: { content: '' } }),
}));

async function loadModules() {
  vi.resetModules();
  const store = await import('../../public/js/shared/store.js');
  const { renderMessageInput } = await import('../../public/js/features/chat/message-input.js');
  return { store, renderMessageInput };
}

describe('message input', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the active model name in the placeholder and footer', async () => {
    const { store, renderMessageInput } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [{ id: 'm1', name: 'GPT Mini' }],
      activeModelId: 'm1',
    });

    const view = renderMessageInput(container, vi.fn());
    const input = container.querySelector('#message-input');

    expect(input.placeholder).toBe('Message GPT Mini');
    expect(container.textContent).toContain('GPT Mini can make mistakes. Check important info.');

    view.destroy();
  });

  it('persists the draft for the active chat while typing', async () => {
    const { store, renderMessageInput } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      activeChatId: 'chat-1',
      models: [{ id: 'm1', name: 'GPT Mini' }],
      activeModelId: 'm1',
      drafts: {},
    });

    const view = renderMessageInput(container, vi.fn());
    const input = container.querySelector('#message-input');
    input.value = 'Hello world';
    input.dispatchEvent(new Event('input'));

    expect(store.state.drafts).toEqual({ 'chat-1': 'Hello world' });
    expect(localStorage.getItem('drafts')).toBe(JSON.stringify({ 'chat-1': 'Hello world' }));

    view.destroy();
  });

  it('submits the current text on enter and clears the draft', async () => {
    const { store, renderMessageInput } = await loadModules();
    const container = document.getElementById('root');
    const onSend = vi.fn();

    store.setState({
      activeChatId: 'chat-1',
      models: [{ id: 'm1', name: 'GPT Mini' }],
      activeModelId: 'm1',
      drafts: {},
    });

    const view = renderMessageInput(container, onSend);
    const input = container.querySelector('#message-input');
    input.value = 'Hello there';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toBe('Hello there');
    expect(input.value).toBe('');
    expect(store.state.drafts).toEqual({ 'chat-1': '' });

    view.destroy();
  });
});


