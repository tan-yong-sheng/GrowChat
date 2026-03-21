// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/users/overview.js');
}

describe('admin users overview', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.restoreAllMocks();
    mocks.apiFetch.mockReset();
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
});


