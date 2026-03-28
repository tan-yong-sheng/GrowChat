// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = {
  addGroupMembers: vi.fn(),
  createAdminGroup: vi.fn(),
  deleteAdminGroup: vi.fn(),
  fetchAdminGroup: vi.fn(),
  fetchAdminGroups: vi.fn(),
  fetchAdminModels: vi.fn(),
  fetchAdminUsers: vi.fn(),
  fetchGroupModelAccess: vi.fn(),
  removeGroupMembers: vi.fn(),
  updateAdminGroup: vi.fn(),
  updateGroupModelAccess: vi.fn(),
};

vi.mock('../../public/js/shared/api.js', () => apiMocks);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/users/groups.js');
}

describe('admin groups overview', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.restoreAllMocks();
    Object.values(apiMocks).forEach((fn) => fn.mockReset());
  });

  it('renders the groups panel and opens the membership-only modal', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');

    renderGroupsOverview(container, {
      groups: [
        { id: 'g1', name: 'Team One', member_count: 2 },
      ],
    });

    expect(container.textContent).toContain('Team One');
    container.querySelector('#create-group-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const modal = document.getElementById('group-modal');
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('General');
    expect(modal?.textContent).toContain('Members');
    expect(modal?.textContent).not.toContain('Permissions');
    expect(modal?.querySelector('#group-policies-btn')).toBeNull();
  });

  it('does not render old permission bundle controls', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');
    apiMocks.fetchAdminGroup.mockResolvedValue({
      group: {
        id: 'g1',
        name: 'Group One',
      },
      members: [],
    });
    apiMocks.fetchAdminUsers.mockResolvedValue({ users: [], total: 0 });

    renderGroupsOverview(container, {
      groups: [{ id: 'g1', name: 'Group One', member_count: 0 }],
    });

    container.querySelector('.btn-edit-group').click();
    await tick();
    const modal = document.getElementById('group-modal');
    expect(modal).toBeTruthy();

    expect(modal.querySelector('button[data-tab="permissions"]')).toBeNull();
    expect(modal.querySelector('#group-policies-btn')).toBeTruthy();
    expect(modal.querySelector('#group-save-btn')).toBeTruthy();
  });

  it('adds a row-level manage policies shortcut for groups', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');

    renderGroupsOverview(container, {
      groups: [{ id: 'g1', name: 'Group One', member_count: 0 }],
    });

    const link = container.querySelector('a.btn-manage-group-policies');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/admin/users/policies?group=g1');
  });

  it('stages group modal edits and persists them from the shared footer save', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');
    const data = {};
    apiMocks.fetchAdminUsers.mockResolvedValue({ users: [], total: 0 });
    apiMocks.createAdminGroup.mockResolvedValue({ group: { id: 'g2', name: 'Team Two', member_count: 0 } });

    renderGroupsOverview(container, data, {
      reload: vi.fn(),
      onCreate: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onMemberDelta: vi.fn(),
    });

    container.querySelector('#create-group-btn').click();
    await tick();

    document.querySelector('#group-name-input').value = 'Team Two';
    document.querySelector('#group-name-input').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#group-description-input').value = 'Team description';
    document.querySelector('#group-description-input').dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelector('#group-save-btn').click();
    await tick();

    expect(apiMocks.createAdminGroup).not.toHaveBeenCalled();
    expect(data.usersDirtyCheckers?.groups?.() ?? true).toBe(true);

    await data.usersSaveHandlers.groups();
    await vi.waitFor(() => expect(apiMocks.createAdminGroup).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Team Two',
      description: 'Team description',
      member_ids: [],
    })));
    expect(data.usersDirtyCheckers.groups()).toBe(false);
    expect(apiMocks.addGroupMembers).not.toHaveBeenCalled();
    expect(apiMocks.removeGroupMembers).not.toHaveBeenCalled();
  });
});


