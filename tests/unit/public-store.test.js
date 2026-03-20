// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadStore() {
  vi.resetModules();
  return import('../../public/js/store.js');
}

describe('public store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      value: 500,
      configurable: true,
    });
  });

  it('hydrates layout and drafts from local storage', async () => {
    localStorage.setItem('sidebarCollapsed', 'true');
    localStorage.setItem('sidebarWidth', '420');
    localStorage.setItem('drafts', JSON.stringify({ c1: 'Hello' }));
    localStorage.setItem('newChatDraft', 'Draft');

    const { state } = await loadStore();

    expect(state.isMobile).toBe(true);
    expect(state.showSidebar).toBe(false);
    expect(state.sidebarCollapsed).toBe(true);
    expect(state.sidebarWidth).toBe(420);
    expect(state.drafts).toEqual({ c1: 'Hello' });
    expect(state.newChatDraft).toBe('Draft');
  });

  it('merges nested state updates and persists the expected fields', async () => {
    const { state, setState } = await loadStore();

    setState({
      sidebarWidth: 360,
      sidebarCollapsed: true,
      drafts: { c1: 'Updated' },
      newChatDraft: 'Draft',
      ui: { loading: true, streaming: true },
      search: { query: 'hello' },
    });

    expect(state.sidebarWidth).toBe(360);
    expect(state.sidebarCollapsed).toBe(true);
    expect(state.drafts).toEqual({ c1: 'Updated' });
    expect(state.newChatDraft).toBe('Draft');
    expect(state.ui.loading).toBe(true);
    expect(state.ui.streaming).toBe(true);
    expect(state.search.query).toBe('hello');
    expect(localStorage.getItem('sidebarWidth')).toBe('360');
    expect(localStorage.getItem('sidebarCollapsed')).toBe('true');
    expect(localStorage.getItem('drafts')).toBe(JSON.stringify({ c1: 'Updated' }));
    expect(localStorage.getItem('newChatDraft')).toBe('Draft');
  });

  it('notifies subscribers immediately and stops after unsubscribe', async () => {
    const { setState, subscribe } = await loadStore();
    const calls = [];

    const unsubscribe = subscribe((currentState) => {
      calls.push({
        activeChatId: currentState.activeChatId,
        showSidebar: currentState.showSidebar,
      });
    });

    expect(calls).toHaveLength(1);

    setState({ activeChatId: 'c1' });
    expect(calls[calls.length - 1]).toMatchObject({ activeChatId: 'c1' });

    unsubscribe();
    setState({ activeChatId: 'c2' });
    expect(calls[calls.length - 1]).toMatchObject({ activeChatId: 'c1' });
  });

  it('responds to resize events by toggling mobile sidebar state', async () => {
    const { state } = await loadStore();

    expect(state.isMobile).toBe(true);
    expect(state.showSidebar).toBe(false);

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));

    expect(state.isMobile).toBe(false);
    expect(state.showSidebar).toBe(true);
  });
});
