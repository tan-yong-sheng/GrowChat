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
  fetchGroupDefaultPermissions: vi.fn(),
  fetchGroupModelAccess: vi.fn(),
  removeGroupMembers: vi.fn(),
  updateAdminGroup: vi.fn(),
  updateGroupDefaultPermissions: vi.fn(),
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
    apiMocks.fetchGroupDefaultPermissions.mockResolvedValue({ permissions: [] });
  });

  it('renders the groups panel and wires the empty-state actions', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');

    renderGroupsOverview(container, {
      groups: [
        { id: 'g1', name: 'Team One', member_count: 2 },
      ],
    });

    expect(container.textContent).toContain('Team One');
    container.querySelector('#default-permissions-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const modal = document.getElementById('default-permissions-modal');
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Default permissions');
  });

  it('loads group model access without disabled providers', async () => {
    const { renderGroupsOverview } = await loadModule();
    const container = document.getElementById('root');
    apiMocks.fetchAdminGroup.mockResolvedValue({
      group: { id: 'g1', name: 'Group One', share_policy: 'members', permissions: ['model.use'] },
      members: [],
    });
    apiMocks.fetchAdminUsers.mockResolvedValue({ users: [], total: 0 });
    apiMocks.fetchGroupModelAccess.mockResolvedValue({ model_ids: [] });
    apiMocks.fetchAdminModels.mockResolvedValue({
      models: [],
      providers: [
        { value: 'openai', label: 'OpenAI', active: 1, total: 2 },
        { value: 'claude', label: 'Claude', active: 0, total: 2 },
      ],
    });

    renderGroupsOverview(container, {
      groups: [{ id: 'g1', name: 'Group One', member_count: 0 }],
    });

    container.querySelector('.btn-edit-group').click();
    await tick();
    const modal = document.getElementById('group-modal');
    expect(modal).toBeTruthy();

    modal.querySelector('button[data-tab="permissions"]').click();
    modal.querySelector('[data-model-access-btn]').click();

    await tick();
    await tick();

    expect(apiMocks.fetchAdminModels).toHaveBeenCalledWith(expect.objectContaining({
      includeDisabled: false,
    }));
    const providerSelect = document.querySelector('#model-access-provider');
    const options = Array.from(providerSelect.options).map((option) => option.textContent.trim());
    expect(options.length).toBe(2);
    expect(options.join(' ')).toContain('OpenAI');
    expect(options.join(' ')).not.toContain('Claude');
  });
});


