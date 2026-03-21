// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/users/groups.js');
}

describe('admin groups overview', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.restoreAllMocks();
  });

  it('renders the groups panel and wires the empty-state actions', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');
    const alerts = [];
    vi.spyOn(window, 'alert').mockImplementation((message) => alerts.push(message));

    renderGroupsOverview(container, {
      groups: [
        { id: 'g1', name: 'Team One', member_count: 2 },
      ],
    });

    expect(container.textContent).toContain('Team One');
    container.querySelector('#default-permissions-btn').click();
    expect(alerts[0]).toContain('Default permissions');
  });
});


