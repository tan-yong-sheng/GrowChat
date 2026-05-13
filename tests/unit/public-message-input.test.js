// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/shared/utils.js', () => ({
  escapeHtml: (value) => String(value ?? ''),
  showToast: vi.fn(),
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
    expect(container.querySelector('#prompt-picker')).toBeNull();

    view.destroy();
  });

  it('does not render the disabled attachments warning', async () => {
    const { store, renderMessageInput } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [{ id: 'm1', name: 'GPT Mini' }],
      activeModelId: 'm1',
    });

    const view = renderMessageInput(container, vi.fn());
    const hint = container.querySelector('#attachment-hint');

    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe('');
    expect(container.textContent).not.toContain('Attachments are disabled for this model.');

    view.destroy();
  });

  it('disables the composer when no selectable models are available', async () => {
    const { store, renderMessageInput } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      models: [],
      activeModelId: null,
      modelsLoading: false,
    });

    const view = renderMessageInput(container, vi.fn());
    const input = container.querySelector('#message-input');
    const composer = container.querySelector('#composer');
    const sendBtn = container.querySelector('#send-btn');

    expect(input.disabled).toBe(true);
    expect(composer.getAttribute('aria-disabled')).toBe('true');
    expect(sendBtn.disabled).toBe(true);
    expect(container.textContent).toContain('No selectable models are available. Ask an admin to restore access or hide fewer models.');

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

  it('renders allowed tool servers with inline expansion and server toggles', async () => {
    const { store, renderMessageInput } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      activeChatId: null,
      models: [{ id: 'm1', name: 'GPT Mini' }],
      activeModelId: 'm1',
      toolServersLoaded: true,
      toolServers: [
        {
          id: 'server-1',
          name: 'Weather',
          source: 'user',
          enabled: true,
          tools: [
            { name: 'weather_lookup', title: 'Weather Lookup', description: 'Lookup weather', enabled: true },
            { name: 'news_lookup', title: 'News Lookup', description: 'Lookup news', enabled: true },
          ],
        },
        {
          id: 'server-2',
          name: 'Search',
          source: 'config',
          access_label: 'Shared',
          enabled: true,
          tools: [
            { name: 'search_lookup', title: 'Search Lookup', description: 'Lookup search', enabled: true },
          ],
        },
      ],
      toolSelectionsByChat: {},
      newChatToolSelection: null,
    });

    const view = renderMessageInput(container, vi.fn());
    container.querySelector('#open-tools-btn').click();

    expect(container.querySelector('#tools-menu')?.classList.contains('hidden')).toBe(false);
    expect(container.textContent).toContain('Weather');
    expect(container.textContent).toContain('Personal');
    expect(container.textContent).toContain('Shared');
    expect(container.querySelector('#tools-menu-all-on')).not.toBeNull();
    expect(container.querySelector('#tools-menu-all-off')).not.toBeNull();
    expect(container.querySelector('#tools-menu-all-on')?.classList.contains('hidden')).toBe(true);
    expect(container.querySelector('#tools-menu-all-off')?.classList.contains('hidden')).toBe(false);

    container.querySelector('#tools-menu-all-off').click();
    expect(store.state.newChatToolSelection).toEqual([]);
    expect(container.querySelector('#tools-menu-all-on')?.classList.contains('hidden')).toBe(false);
    expect(container.querySelector('#tools-menu-all-off')?.classList.contains('hidden')).toBe(true);

    container.querySelector('#tools-menu-all-on').click();
    expect(store.state.newChatToolSelection).toBeNull();
    expect(container.querySelector('#tools-menu-all-on')?.classList.contains('hidden')).toBe(true);
    expect(container.querySelector('#tools-menu-all-off')?.classList.contains('hidden')).toBe(false);

    container.querySelector('[data-tool-server-expand][data-tool-server-id="server-1"]').click();
    expect(container.textContent).toContain('Weather Lookup');

    container.querySelector('[data-tool-toggle][data-tool-name="weather_lookup"]').click();
    expect(store.state.newChatToolSelection).toEqual([
      'mcp__server-1__news_lookup',
      'mcp__server-2__search_lookup',
    ]);

    container.querySelector('[data-tool-server-toggle][data-tool-server-id="server-1"]').click();
    expect(store.state.newChatToolSelection).toEqual(['mcp__server-2__search_lookup']);

    container.querySelector('[data-tool-server-toggle][data-tool-server-id="server-1"]').click();
    expect(store.state.newChatToolSelection).toBeNull();

    expect(container.querySelector('[data-tool-toggle][data-tool-name="weather_lookup"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-tool-toggle][data-tool-name="search_lookup"]')?.getAttribute('aria-pressed')).toBe('true');

    view.destroy();
  });

  it('hides personal-only overrides for shared tools in the tools menu', async () => {
    const { store, renderMessageInput } = await loadModules();
    const container = document.getElementById('root');

    store.setState({
      activeChatId: null,
      models: [{ id: 'm1', name: 'GPT Mini' }],
      activeModelId: 'm1',
      toolServersLoaded: true,
      toolServers: [
        {
          id: 'server-1',
          name: 'Search',
          source: 'config',
          access_label: 'Shared',
          enabled: true,
          tools: [
            { name: 'search_lookup', title: 'Search Lookup', description: 'Lookup search', enabled: true, visible_for_user: true },
            { name: 'private_lookup', title: 'Private Lookup', description: 'Hidden search', enabled: true, visible_for_user: false },
          ],
        },
      ],
      toolSelectionsByChat: {},
      newChatToolSelection: null,
    });

    const view = renderMessageInput(container, vi.fn());
    container.querySelector('#open-tools-btn').click();

    expect(container.textContent).toContain('Shared');
    expect(container.textContent).toContain('Search Lookup');
    expect(container.textContent).not.toContain('Private Lookup');
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


