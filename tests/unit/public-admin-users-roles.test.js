// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({
  permissions: [
    { id: 'perm-chat-read', key: 'chat.read' },
    { id: 'perm-chat-write', key: 'chat.write' },
    { id: 'perm-file-upload', key: 'file.upload' },
    { id: 'perm-model-use', key: 'model.use' },
    { id: 'perm-admin-user-read', key: 'admin.user.read' },
    { id: 'perm-admin-user-write', key: 'admin.user.write' },
    { id: 'perm-admin-audit-read', key: 'admin.audit.read' },
    { id: 'perm-admin-rbac-admin', key: 'admin.rbac.admin' },
  ],
  roles: [
    {
      id: 'admin',
      name: 'Admin',
      description: 'Full platform access',
      system: true,
      permissions: ['chat.read', 'chat.write', 'file.upload', 'model.use', 'admin.user.read', 'admin.user.write', 'admin.audit.read', 'admin.rbac.admin'],
    },
    {
      id: 'member',
      name: 'Member',
      description: 'Base app access',
      system: true,
      permissions: ['chat.read', 'chat.write', 'file.upload', 'model.use'],
    },
  ],
}));

const mocks = vi.hoisted(() => ({
  fetchAdminRbacRoles: vi.fn(),
  createAdminRbacRole: vi.fn(),
  deleteAdminRbacRole: vi.fn(),
  updateAdminRbacRole: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  fetchAdminRbacRoles: (...args) => mocks.fetchAdminRbacRoles(...args),
  createAdminRbacRole: (...args) => mocks.createAdminRbacRole(...args),
  deleteAdminRbacRole: (...args) => mocks.deleteAdminRbacRole(...args),
  updateAdminRbacRole: (...args) => mocks.updateAdminRbacRole(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/users/roles.js');
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('admin users roles', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'confirm', { value: vi.fn(() => false), configurable: true });
    backend.roles = [
      {
        id: 'admin',
        name: 'Admin',
        description: 'Full platform access',
        system: true,
        permissions: ['chat.read', 'chat.write', 'file.upload', 'model.use', 'admin.user.read', 'admin.user.write', 'admin.audit.read', 'admin.rbac.admin'],
      },
      {
        id: 'member',
        name: 'Member',
        description: 'Base app access',
        system: true,
        permissions: ['chat.read', 'chat.write', 'file.upload', 'model.use'],
      },
    ];
    mocks.fetchAdminRbacRoles.mockImplementation(async () => ({
      roles: backend.roles.map((role) => ({
        ...role,
        permissions: [...role.permissions],
      })),
    }));
    mocks.createAdminRbacRole.mockImplementation(async (payload) => {
      const role = {
        id: `custom-${backend.roles.filter((item) => !item.system).length + 1}`,
        name: payload.name,
        description: 'Custom role',
        system: false,
        permissions: [...(payload.permissions || [])],
      };
      backend.roles = [...backend.roles, role];
      return { role: { ...role, permissions: [...role.permissions] } };
    });
    mocks.deleteAdminRbacRole.mockImplementation(async (id) => {
      backend.roles = backend.roles.filter((role) => role.id !== id);
      return new Response(null, { status: 204 });
    });
    mocks.updateAdminRbacRole.mockImplementation(async (id, payload) => {
      backend.roles = backend.roles.map((role) => (
        role.id === id
          ? {
              ...role,
              name: payload.name ?? role.name,
              permissions: [...(payload.permissions ?? role.permissions)],
            }
          : role
      ));
      const role = backend.roles.find((item) => item.id === id);
      return { role: { ...role, permissions: [...role.permissions] } };
    });
  });

  it('loads persisted roles from the server on a fresh render', async () => {
    backend.roles.push({
      id: 'custom-1',
      name: 'Support',
      description: 'Custom role',
      system: false,
      permissions: ['chat.read', 'chat.write'],
    });

    const { renderRolesPage } = await loadModule();
    const container = document.getElementById('root');

    renderRolesPage(container);
    await vi.waitFor(() => expect(container.textContent).toContain('Support'));
  });

  it('renders the roles list as the scroll container itself', async () => {
    backend.roles.push({
      id: 'custom-1',
      name: 'Support',
      description: 'Custom role',
      system: false,
      permissions: ['chat.read', 'chat.write'],
    });

    const { renderRolesPage } = await loadModule();
    const container = document.getElementById('root');

    renderRolesPage(container);
    await vi.waitFor(() => expect(container.querySelector('[data-role-list]')).not.toBeNull());

    const list = container.querySelector('[data-role-list]');
    expect(list.className).toContain('overflow-y-auto');
    expect(list.firstElementChild?.classList.contains('grid')).toBe(true);
  });

  it('stages a newly created role in the modal and persists it from the shared footer save', async () => {
    const { renderRolesPage } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderRolesPage(container, data);
    await vi.waitFor(() => expect(container.textContent).toContain('Admin'));

    container.querySelector('#create-role-btn').click();
    await tick();

    document.querySelector('#role-name').value = 'Support';
    document.querySelector('#role-name').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-permission-toggle="chat.read"]').checked = true;
    document.querySelector('[data-permission-toggle="chat.read"]').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-permission-toggle="chat.write"]').checked = true;
    document.querySelector('[data-permission-toggle="chat.write"]').dispatchEvent(new Event('change', { bubbles: true }));

    document.querySelector('[data-role-save]').click();
    await tick();

    expect(mocks.createAdminRbacRole).not.toHaveBeenCalled();
    expect(data.usersDirtyCheckers.roles()).toBe(true);

    await data.usersSaveHandlers.roles();

    await vi.waitFor(() => expect(mocks.createAdminRbacRole).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.textContent).toContain('Support'));

    const freshContainer = document.createElement('div');
    freshContainer.id = 'root-reload';
    document.body.innerHTML = '';
    document.body.appendChild(freshContainer);

    renderRolesPage(freshContainer);
    await vi.waitFor(() => expect(freshContainer.textContent).toContain('Support'));
  });

  it('renders a compact create-role modal with inline accessible controls', async () => {
    const { renderRolesPage } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderRolesPage(container, data);
    await vi.waitFor(() => expect(container.querySelector('[data-role-list]')).not.toBeNull());
    container.querySelector('#create-role-btn').click();
    await tick();

    const nameInput = document.querySelector('#role-name');
    const searchInput = document.querySelector('#role-permission-search');

    expect(nameInput).toBeTruthy();
    expect(nameInput.value).toBe('Custom 1');
    expect(nameInput.getAttribute('aria-label')).toBe('Role name');
    expect(searchInput).toBeTruthy();
    expect(searchInput.getAttribute('aria-label')).toBe('Search permissions');
    expect(document.querySelector('[data-modal-advanced]')).toBeNull();
    expect(document.querySelector('[data-role-save]')).toBeTruthy();

    const permissionPane = document.querySelector('[data-role-permission-pane]');
    expect(permissionPane).toBeTruthy();
    expect(permissionPane.className).not.toContain('overflow-y-auto');
    expect(permissionPane.className).not.toContain('max-h-[58vh]');
  });

  it('registers a dirty navigation guard while a role draft is open', async () => {
    const { renderRolesPage } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderRolesPage(container, data);
    await vi.waitFor(() => expect(container.querySelector('[data-role-list]')).not.toBeNull());
    container.querySelector('#create-role-btn').click();
    await tick();

    document.querySelector('#role-name').value = 'Support';
    document.querySelector('#role-name').dispatchEvent(new Event('input', { bubbles: true }));

    expect(typeof data.usersDirtyCheckers.roles).toBe('function');
    expect(data.usersDirtyCheckers.roles()).toBe(true);

    document.querySelector('[data-modal-discard]').click();
    await vi.waitFor(() => expect(data.usersDirtyCheckers.roles()).toBe(false));
  });

  it('stages delete from the role card list and commits it from the shared footer', async () => {
    const { renderRolesPage } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    backend.roles.push({
      id: 'custom-1',
      name: 'Support',
      description: 'Custom role',
      system: false,
      permissions: ['chat.read'],
    });

    renderRolesPage(container, data);
    await vi.waitFor(() => expect(container.textContent).toContain('Support'));

    Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true });
    container.querySelector('[data-role-delete="custom-1"]').click();
    await tick();

    expect(container.textContent).toContain('Pending delete');
    expect(data.usersDirtyCheckers.roles()).toBe(true);

    await data.usersSaveHandlers.roles();

    await vi.waitFor(() => expect(mocks.deleteAdminRbacRole).toHaveBeenCalledWith('custom-1'));
    await vi.waitFor(() => expect(container.textContent).not.toContain('Support'));
  });

  it('stages delete from the role modal and closes the modal', async () => {
    const { renderRolesPage } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    backend.roles.push({
      id: 'custom-2',
      name: 'Billing',
      description: 'Custom role',
      system: false,
      permissions: ['chat.read'],
    });

    renderRolesPage(container, data);
    await vi.waitFor(() => expect(container.textContent).toContain('Billing'));

    Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true });
    container.querySelector('[data-role-edit="custom-2"]').click();
    await tick();

    expect(document.querySelector('#role-name')).toBeTruthy();
    document.querySelector('[data-role-modal-delete]').click();
    await tick();

    expect(document.querySelector('#role-name')).toBeNull();
    expect(container.textContent).toContain('Pending delete');

    await data.usersSaveHandlers.roles();

    await vi.waitFor(() => expect(mocks.deleteAdminRbacRole).toHaveBeenCalledWith('custom-2'));
    await vi.waitFor(() => expect(container.textContent).not.toContain('Billing'));
  });
});
