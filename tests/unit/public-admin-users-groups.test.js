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
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'confirm', { value: vi.fn(() => false), configurable: true });
    Object.values(apiMocks).forEach((fn) => fn.mockReset());
    apiMocks.deleteAdminGroup.mockResolvedValue(new Response(null, { status: 204 }));
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

  it('guards the group policies drilldown when the modal has dirty state', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');
    const guardNavigation = vi.fn(async () => false);
    history.replaceState({}, '', '/admin/users/groups');
    apiMocks.fetchAdminUsers.mockResolvedValue({ users: [], total: 0 });
    apiMocks.fetchAdminGroup.mockResolvedValue({
      group: {
        id: 'g1',
        name: 'Group One',
      },
      members: [],
    });

    renderGroupsOverview(container, {
      groups: [{ id: 'g1', name: 'Group One', member_count: 0 }],
      guardNavigation,
    });

    container.querySelector('.btn-edit-group').click();
    await tick();

    expect(document.querySelector('#group-policies-btn')).toBeTruthy();
    document.querySelector('#group-policies-btn')?.click();
    await tick();

    expect(guardNavigation).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/admin/users/groups');
  });

  it('deletes a group immediately from the card action', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');

    renderGroupsOverview(container, {
      groups: [{ id: 'g1', name: 'Group One', member_count: 0 }],
      reload: vi.fn(),
      onCreate: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onMemberDelta: vi.fn(),
    });

    Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true });
    container.querySelector('.btn-delete-group').click();
    await tick();

    await vi.waitFor(() => expect(apiMocks.deleteAdminGroup).toHaveBeenCalledWith('g1'));
  });

  it('creates a group immediately from the modal save', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');
    apiMocks.fetchAdminUsers.mockResolvedValue({ users: [], total: 0 });
    apiMocks.createAdminGroup.mockResolvedValue({ group: { id: 'g2', name: 'Team Two', member_count: 0 } });

    renderGroupsOverview(container, {
      groups: [],
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

    await vi.waitFor(() => expect(apiMocks.createAdminGroup).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Team Two',
      description: 'Team description',
      member_ids: [],
    })));
    expect(apiMocks.addGroupMembers).not.toHaveBeenCalled();
    expect(apiMocks.removeGroupMembers).not.toHaveBeenCalled();
  });

  it('deletes a group immediately from the modal', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');
    apiMocks.fetchAdminUsers.mockResolvedValue({ users: [], total: 0 });
    apiMocks.fetchAdminGroup.mockResolvedValue({
      group: {
        id: 'g1',
        name: 'Group One',
      },
      members: [],
    });

    const actions = {
      reload: vi.fn(),
      onCreate: vi.fn(),
      onUpdate: vi.fn(),
      onDelete(groupId) {
        renderGroupsOverview(container, {
          groups: [],
        }, actions);
      },
      onMemberDelta: vi.fn(),
    };

    renderGroupsOverview(container, {
      groups: [{ id: 'g1', name: 'Group One', member_count: 0 }],
    }, actions);

    container.querySelector('.btn-edit-group').click();
    await tick();

    expect(document.querySelector('#group-delete-btn')).toBeTruthy();
    Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true });
    document.querySelector('#group-delete-btn').click();
    await tick();

    await vi.waitFor(() => expect(apiMocks.deleteAdminGroup).toHaveBeenCalledWith('g1'));
    await vi.waitFor(() => expect(container.textContent).not.toContain('Group One'));
  });
});


