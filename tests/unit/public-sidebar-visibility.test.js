// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/shared/utils/sidebar-visibility.js');
}

describe('sidebar visibility route scopes', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
  });

  it('keeps the sidebar stable for admin overview routes', async () => {
    const { setSidebarRouteScope, clearSidebarVisibilitySuspension } = await loadModule();
    const { state } = await import('../../public/js/shared/store.js');

    clearSidebarVisibilitySuspension();
    state.showSidebar = true;
    state.sidebarCollapsed = false;

    setSidebarRouteScope('admin');

    expect(state.showSidebar).toBe(true);
    expect(state.sidebarCollapsed).toBe(false);
  });

  it('collapses the sidebar for admin settings routes on desktop', async () => {
    const { setSidebarRouteScope, clearSidebarVisibilitySuspension } = await loadModule();
    const { state } = await import('../../public/js/shared/store.js');

    clearSidebarVisibilitySuspension();
    state.showSidebar = true;
    state.sidebarCollapsed = false;

    setSidebarRouteScope('admin-settings');

    expect(state.showSidebar).toBe(true);
    expect(state.sidebarCollapsed).toBe(true);
  });

  it('hides the sidebar for admin settings routes on mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
    });

    const { setSidebarRouteScope, clearSidebarVisibilitySuspension } = await loadModule();
    const { state } = await import('../../public/js/shared/store.js');

    clearSidebarVisibilitySuspension();
    state.isMobile = true;
    state.showSidebar = true;
    state.sidebarCollapsed = false;

    setSidebarRouteScope('admin-settings');

    expect(state.showSidebar).toBe(false);
  });
});
