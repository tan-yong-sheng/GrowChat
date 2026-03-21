// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderCurrentRoute: vi.fn(),
}));

vi.mock('../../public/js/bootstrap/app.js', () => ({
  renderCurrentRoute: (...args) => mocks.renderCurrentRoute(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/admin.js');
}

describe('admin module', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.clearAllMocks();
    mocks.renderCurrentRoute.mockReset();
  });

  it('imports without depending on the removed root app module', async () => {
    const mod = await loadModule();

    expect(typeof mod.renderAdminPage).toBe('function');
  });
});
