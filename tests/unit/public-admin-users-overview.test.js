// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  fetchAdminUserAccess: vi.fn(),
  fetchAdminRbacRoles: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
  fetchAdminRbacRoles: (...args) => mocks.fetchAdminRbacRoles(...args),
}));

vi.mock('../../public/js/shared/admin-access.js', () => ({
  fetchAdminUserAccess: (...args) => mocks.fetchAdminUserAccess(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/users/overview.js');
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('admin users overview', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.restoreAllMocks();
    mocks.apiFetch.mockReset();
    mocks.fetchAdminUserAccess.mockReset();
    mocks.fetchAdminRbacRoles.mockReset();
    mocks.fetchAdminRbacRoles.mockResolvedValue({ roles: [] });
  });

  it('renders rows and filters them with search input', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');
    const actions = {
      reload: vi.fn(),
      updateUser: vi.fn(),
      removeUser: vi.fn(),
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    };
    const data = {
      users: [
        { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
      ],
      total: 1,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    };

    renderUserOverview(container, data, actions);

    expect(container.querySelector('#users-table-body').textContent).toContain('Ada Lovelace');
    container.querySelector('#user-search-input').value = 'no match';
    container.querySelector('#user-search-input').dispatchEvent(new Event('input', { bubbles: true }));

    expect(container.querySelector('tbody tr').style.display).toBe('none');
  });

  it('keeps the users table horizontally scrollable', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');

    renderUserOverview(container, {
      users: [],
      total: 0,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    }, {
      reload: vi.fn(),
      updateUser: vi.fn(),
      removeUser: vi.fn(),
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    });

    expect(container.querySelector('.relative.flex-1.min-h-0.overflow-hidden.w-full.rounded-3xl.border.border-gray-100.bg-white .h-full.overflow-auto .min-w-\\[1120px\\]')).toBeTruthy();
  });

  it('saves user modal changes immediately', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');
    const data = {
      users: [
        { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
      ],
      total: 1,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    };
    const actions = {
      reload: vi.fn(),
      updateUser: vi.fn(),
      removeUser: vi.fn(),
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    };
    mocks.apiFetch.mockImplementation(async (url, options = {}) => {
      const method = String(options.method || 'GET').toUpperCase();
      if (url === '/api/admin/users' && method === 'POST') {
        return new Response(JSON.stringify({
          user: {
            id: 'u2',
            name: 'Grace Hopper',
            email: 'grace@example.com',
            primary_role: 'member',
            account_status: 'active',
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/admin/users/u1' && method === 'PUT') {
        return new Response(JSON.stringify({
          user: {
            id: 'u1',
            name: 'Ada Lovelace II',
            email: 'ada@example.com',
            primary_role: 'admin',
            account_status: 'active',
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderUserOverview(container, data, actions);

    container.querySelector('#open-add-user-modal').click();
    await tick();

    expect(document.querySelector('#add-user-save-btn')).toBeTruthy();
    expect(document.querySelector('#add-user-modal > div:first-child')?.className).toContain('backdrop-blur-sm');

    document.querySelector('[name="name"]').value = 'Grace Hopper';
    document.querySelector('[name="name"]').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[name="email"]').value = 'grace@example.com';
    document.querySelector('[name="email"]').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[name="password"]').value = 'Password123';
    document.querySelector('[name="password"]').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-add-user-tab="form"]').click();
    document.querySelector('#add-user-save-btn').click();
    await tick();

    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({ method: 'POST' })));
    expect(actions.prependUser).toHaveBeenCalled();

    document.querySelector('[data-close-add-user]')?.click();
    await tick();

    container.querySelector('.btn-edit-user').click();
    await tick();

    expect(document.querySelector('#edit-user-save-btn')).toBeTruthy();
    expect(document.querySelector('#edit-user-modal > div:first-child')?.className).toContain('backdrop-blur-sm');
    document.querySelector('[name="name"]').value = 'Ada Lovelace II';
    document.querySelector('[name="name"]').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[name="password"]').value = '';
    document.querySelector('#edit-user-save-btn').click();
    await tick();

    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/users/u1', expect.objectContaining({ method: 'PUT' })));
    expect(actions.updateUser).toHaveBeenCalled();
  });

  it('shows custom roles in the row badge and role selector', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');
    mocks.fetchAdminRbacRoles.mockResolvedValue({
      roles: [
        { id: 'support-role', name: 'Support', system: false },
      ],
    });

    renderUserOverview(container, {
      users: [
        { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'Support', primary_role: 'Support' },
      ],
      total: 1,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    }, {
      reload: vi.fn(),
      updateUser: vi.fn(),
      removeUser: vi.fn(),
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    });

    expect(container.querySelector('.btn-change-role')?.textContent).toContain('Support');

    await container.querySelector('#open-add-user-modal').click();
    await tick();

    const roleSelect = document.querySelector('#add-user-form [name="primary_role"]');
    expect(roleSelect?.textContent).toContain('Support');
    expect(Array.from(roleSelect?.querySelectorAll('option') || []).map((option) => option.value)).toContain('Support');
  });

  it('opens a read-only ACL inspector from the lock action', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');
    mocks.fetchAdminUserAccess.mockResolvedValue({
      user: {
        id: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'admin',
        account_status: 'active',
      },
      groups: [{ id: 'g1', name: 'test1' }],
      role_permissions: ['admin.user.read'],
      access: {
        models: [
          {
            family: 'model',
            resource_id: 'model-1',
            principal_type: 'group',
            principal_label: 'Group: test1',
            effect: 'deny',
            action: 'use',
            access_state: 'revoked',
          },
        ],
        connections: [
          {
            family: 'connection',
            resource_id: 'conn-1',
            principal_type: 'user',
            principal_label: 'Direct user',
            effect: 'allow',
            action: 'use',
            hidden_for_user: true,
            visible_for_user: false,
            access_state: 'hidden_for_user',
          },
        ],
        mcp_servers: [],
      },
    });

    renderUserOverview(container, {
      users: [
        { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
      ],
      total: 1,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    }, {
      reload: vi.fn(),
      updateUser: vi.fn(),
      removeUser: vi.fn(),
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    });

    await container.querySelector('.btn-inspect-user-access').click();
    await tick();

    const modal = document.getElementById('user-access-modal');
    expect(modal).toBeTruthy();
    expect(modal.className).toContain('items-start');
    expect(modal.className).toContain('overflow-y-auto');
    expect(document.querySelector('#user-access-modal [data-admin-modal-body]')?.className).toContain('overflow-y-auto');
    expect(document.body.textContent).toContain('ACL Inspector');
    expect(document.body.textContent).toContain('Role Permissions');
    expect(document.body.textContent).toContain('admin.user.read');
    expect(document.body.textContent).toContain('test1');
    expect(document.body.textContent).toContain('Revoked');
    expect(document.body.textContent).toContain('Hidden for user');
  });

  it('refreshes the ACL inspector after access invalidation events', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');
    mocks.fetchAdminUserAccess
      .mockResolvedValueOnce({
        user: {
          id: 'u1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          role: 'admin',
          account_status: 'active',
        },
        groups: [{ id: 'g1', name: 'test1' }],
        role_permissions: ['admin.user.read'],
        access: {
          models: [{ resource_id: 'model-1', principal_label: 'Group: test1', effect: 'allow', action: 'use' }],
          connections: [],
          mcp_servers: [],
        },
      })
      .mockResolvedValueOnce({
        user: {
          id: 'u1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          role: 'admin',
          account_status: 'active',
        },
        groups: [{ id: 'g1', name: 'test1' }],
        role_permissions: ['admin.user.read'],
        access: {
          models: [{ resource_id: 'model-1', principal_label: 'Group: test1', effect: 'deny', action: 'use' }],
          connections: [],
          mcp_servers: [],
        },
      });

    renderUserOverview(container, {
      users: [
        { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
      ],
      total: 1,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    }, {
      reload: vi.fn(),
      updateUser: vi.fn(),
      removeUser: vi.fn(),
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    });

    await container.querySelector('.btn-inspect-user-access').click();
    await tick();
    expect(document.body.textContent).toContain('allow');

    window.dispatchEvent(new CustomEvent('growchat:connections-invalidated', { detail: { token: 'refresh-1' } }));
    await vi.waitFor(() => expect(document.body.textContent).toContain('Refreshing ACL inspector...'));
    await vi.waitFor(() => expect(mocks.fetchAdminUserAccess).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(document.body.textContent).toContain('Revoked'));
  });

  it('hides disabled ACL rules by default and reveals them with a toggle', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');
    mocks.fetchAdminUserAccess.mockResolvedValue({
      user: {
        id: 'u1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'admin',
        account_status: 'active',
      },
      groups: [{ id: 'g1', name: 'test1' }],
      role_permissions: ['admin.user.read'],
      access: {
        models: [
          {
            family: 'model',
            resource_id: 'model-enabled',
            principal_label: 'Group: test1',
            effect: 'allow',
            action: 'use',
            resource_enabled: true,
          },
          {
            family: 'model',
            resource_id: 'model-disabled',
            principal_label: 'Group: test1',
            effect: 'allow',
            action: 'use',
            resource_enabled: false,
          },
        ],
        connections: [],
        mcp_servers: [],
      },
    });

    renderUserOverview(container, {
      users: [
        { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
      ],
      total: 1,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    }, {
      reload: vi.fn(),
      updateUser: vi.fn(),
      removeUser: vi.fn(),
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    });

    await container.querySelector('.btn-inspect-user-access').click();
    await tick();

    expect(document.body.textContent).toContain('model-enabled');
    expect(document.body.textContent).not.toContain('model-disabled');

    await document.querySelector('[data-toggle-disabled-rules]').click();
    await tick();

    expect(document.body.textContent).toContain('model-disabled');
    expect(document.querySelector('#user-access-modal [data-admin-modal-body] .opacity-60')).toBeTruthy();
  });

  it('deletes users immediately from the row action', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');
    const data = {
      users: [
        { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user', account_status: 'active' },
      ],
      total: 1,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    };
    const removeUser = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.apiFetch.mockImplementation(async (url, options = {}) => {
      if (String(url) === '/api/admin/users/u1' && String(options.method || 'GET').toUpperCase() === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderUserOverview(container, data, {
      reload: vi.fn(),
      updateUser: vi.fn(),
      removeUser,
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    });

    await container.querySelector('.btn-delete-user').click();
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/users/u1', expect.objectContaining({ method: 'DELETE' })));
    await vi.waitFor(() => expect(removeUser).toHaveBeenCalledWith('u1'));
    expect(confirmSpy).toHaveBeenCalledWith('Delete user Ada Lovelace? This will permanently remove the account record.');
  });

  it('changes user roles immediately from the row action', async () => {
    const { renderUserOverview } = await loadModule();
    const container = document.getElementById('root');
    const data = {
      users: [
        { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'member', account_status: 'active' },
      ],
      total: 1,
      pagination: { page: 1, pageSize: 20 },
      loading: false,
      loadingMode: 'idle',
    };
    const updateUser = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.apiFetch.mockImplementation(async (url, options = {}) => {
      if (String(url) === '/api/admin/users/u1' && String(options.method || 'GET').toUpperCase() === 'PUT') {
        return new Response(JSON.stringify({
          user: {
            id: 'u1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            primary_role: 'admin',
            account_status: 'active',
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderUserOverview(container, data, {
      reload: vi.fn(),
      updateUser,
      removeUser: vi.fn(),
      prependUser: vi.fn(),
      invalidateCache: vi.fn(),
    });

    await container.querySelector('.btn-change-role').click();
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/users/u1', expect.objectContaining({ method: 'PUT' })));
    await vi.waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalledWith('Change role for Ada Lovelace to ADMIN?');
  });
});


