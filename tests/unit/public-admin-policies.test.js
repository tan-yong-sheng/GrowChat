// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

  const mocks = vi.hoisted(() => ({
    apiFetch: vi.fn(),
    fetchAdminGroups: vi.fn(),
    fetchAdminModels: vi.fn(),
    broadcastConnectionsInvalidation: vi.fn(),
    broadcastModelsInvalidation: vi.fn(),
    broadcastToolServersInvalidation: vi.fn(),
  }));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
  fetchAdminGroups: (...args) => mocks.fetchAdminGroups(...args),
  fetchAdminModels: (...args) => mocks.fetchAdminModels(...args),
}));

vi.mock('../../public/js/shared/utils/model-sync.js', () => ({
  broadcastModelsInvalidation: (...args) => mocks.broadcastModelsInvalidation(...args),
  consumeModelsInvalidation: () => null,
}));

vi.mock('../../public/js/shared/utils/connection-sync.js', () => ({
  broadcastConnectionsInvalidation: (...args) => mocks.broadcastConnectionsInvalidation(...args),
  consumeConnectionsInvalidation: () => null,
}));

vi.mock('../../public/js/shared/utils/tool-server-sync.js', () => ({
  broadcastToolServersInvalidation: (...args) => mocks.broadcastToolServersInvalidation(...args),
  consumeToolServersInvalidation: () => null,
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/settings/policies.js');
}

describe('admin policies settings', () => {
  const toggleVisibilityFilter = (container, key, checked) => {
    const input = container.querySelector(`[data-policy-filter="${key}"]`);
    if (!input) return;
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="policies"></div>';
    history.replaceState({}, '', '/admin/settings/policies');
    vi.clearAllMocks();

    mocks.fetchAdminGroups.mockResolvedValue({
      groups: [
        { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
        { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
      ],
    });

    mocks.fetchAdminModels.mockResolvedValue({
      models: [
        { id: 'm1', name: 'Model 1', provider: 'openai', enabled: true, connection_id: 'c1', connection_name: 'Conn 1' },
        { id: 'm2', name: 'Model 2', provider: 'openai', enabled: false },
        { id: 'm3', name: 'Model 3', provider: 'openai', enabled: true, connection_id: 'c2', connection_name: 'Conn 2' },
      ],
    });

    mocks.apiFetch.mockImplementation(async (url, init = {}) => {
      const path = String(url);
      if (path === '/api/admin/openai/connections') {
        return new Response(JSON.stringify({
          connections: [
            { id: 'c1', name: 'Conn 1', providerType: 'openai-compatible', baseUrl: 'https://example.com', source: 'config' },
            { id: 'c2', name: 'Conn 2', providerType: 'openai-compatible', baseUrl: 'https://disabled.example.com', source: 'config', enabled: false },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/tool-servers') {
        return new Response(JSON.stringify({
          servers: [
            { id: 's1', name: 'Server 1', url: 'https://mcp.example.com', source: 'config' },
            { id: 's2', name: 'Server 2', url: 'https://disabled-mcp.example.com', source: 'config', enabled: false },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path.includes('/access') && (!init.method || init.method === 'GET')) {
        const rules = [];
        if (path.includes('/models/')) {
          rules.push({ model_id: 'm1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' });
        } else if (path.includes('/connections/access')) {
          rules.push({ connection_id: 'c1', principal_type: 'group', principal_id: 'g2', effect: 'allow', action: 'use' });
        } else if (path.includes('/openai/connections/')) {
          rules.push({ connection_id: 'c1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' });
        } else if (path.includes('/tool-servers/')) {
          rules.push({ tool_server_id: 's1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' });
        } else if (path.includes('/models/access')) {
          rules.push({ model_id: 'm1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' });
        }
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
            { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
          ],
          rules,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path.includes('/access') && init.method === 'PUT') {
        return new Response(JSON.stringify({
          ok: true,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });

  it('shows a dependency warning when a model connection is not allowed for the selected group', async () => {
    mocks.fetchAdminModels.mockResolvedValueOnce({
      models: [
        { id: 'm1', name: 'Model 1', provider: 'openai', enabled: true, connection_id: 'c1', connection_name: 'Conn 1' },
      ],
    });
    mocks.apiFetch.mockImplementationOnce(async (url, init = {}) => {
      const path = String(url);
      if (path === '/api/admin/openai/connections') {
        return new Response(JSON.stringify({ connections: [{ id: 'c1', name: 'Conn 1', providerType: 'openai-compatible', baseUrl: 'https://example.com', source: 'config' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/models/access?ids=m1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
            { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
          ],
          rules: [{ model_id: 'm1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/openai/connections/access?ids=c1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
            { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
          ],
          rules: [{ connection_id: 'c1', principal_type: 'group', principal_id: 'g2', effect: 'allow', action: 'use' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/tool-servers') {
        return new Response(JSON.stringify({ servers: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.querySelector('#policy-group-filter')).not.toBeNull());
    const groupSelect = container.querySelector('#policy-group-filter');
    groupSelect.value = 'g1';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    expect(container.querySelector('[data-edit-resource="m1"]')).not.toBeNull();
    const warningLink = container.querySelector('a[href*="family=connections"]');
    expect(warningLink).not.toBeNull();
  });

  it('shows a dependency warning when a model connection has no ACL rules for the selected group', async () => {
    mocks.fetchAdminModels.mockResolvedValueOnce({
      models: [
        { id: 'm1', name: 'Model 1', provider: 'openai', enabled: true, connection_id: 'c1', connection_name: 'Conn 1' },
      ],
    });
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      const path = String(url);
      if (path === '/api/admin/openai/connections') {
        return new Response(JSON.stringify({ connections: [{ id: 'c1', name: 'Conn 1', providerType: 'openai-compatible', baseUrl: 'https://example.com', source: 'config' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/models/access?ids=m1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
          ],
          rules: [{ model_id: 'm1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/openai/connections/access?ids=c1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
          ],
          rules: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/tool-servers') {
        return new Response(JSON.stringify({ servers: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);
    await vi.waitFor(() => expect(container.querySelector('#policy-group-filter')).not.toBeNull());
    const groupSelect = container.querySelector('#policy-group-filter');
    groupSelect.value = 'g1';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    expect(container.querySelector('[aria-label*="connection"]')).not.toBeNull();
  });

  it('shows a dependency warning inside the model access modal when the selected group lacks the underlying connection', async () => {
    mocks.fetchAdminModels.mockResolvedValueOnce({
      models: [
        { id: 'm1', name: 'Model 1', provider: 'openai', enabled: true, connection_id: 'c1', connection_name: 'Conn 1' },
      ],
    });
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      const path = String(url);
      if (path === '/api/admin/openai/connections') {
        return new Response(JSON.stringify({ connections: [{ id: 'c1', name: 'Conn 1', providerType: 'openai-compatible', baseUrl: 'https://example.com', source: 'config' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/models/access?ids=m1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
          ],
          rules: [{ model_id: 'm1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/openai/connections/access?ids=c1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
            { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
          ],
          rules: [{ connection_id: 'c1', principal_type: 'group', principal_id: 'g2', effect: 'allow', action: 'use' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/tool-servers') {
        return new Response(JSON.stringify({ servers: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);
    await vi.waitFor(() => expect(container.querySelector('#policy-group-filter')).not.toBeNull());
    const groupSelect = container.querySelector('#policy-group-filter');
    groupSelect.value = 'g1';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    container.querySelector('[data-edit-resource="m1"]')?.click();

    await vi.waitFor(() => expect(document.querySelector('#policy-acl-save')).not.toBeNull());
    expect(document.body.textContent).toContain('Dependency warning');
    expect(document.body.textContent).toContain('does not have ACL access to the connection');
    expect(document.querySelector('a[href*="family=connections"]')).not.toBeNull();
  });

  it('hides the dependency warning inside the model access modal when the model itself is not allowed', async () => {
    mocks.fetchAdminModels.mockResolvedValueOnce({
      models: [
        { id: 'm1', name: 'Model 1', provider: 'openai', enabled: true, connection_id: 'c1', connection_name: 'Conn 1' },
      ],
    });
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      const path = String(url);
      if (path === '/api/admin/openai/connections') {
        return new Response(JSON.stringify({ connections: [{ id: 'c1', name: 'Conn 1', providerType: 'openai-compatible', baseUrl: 'https://example.com', source: 'config' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/models/access?ids=m1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
          ],
          rules: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/openai/connections/access?ids=c1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
          ],
          rules: [{ connection_id: 'c1', principal_type: 'group', principal_id: 'g2', effect: 'allow', action: 'use' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/tool-servers') {
        return new Response(JSON.stringify({ servers: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);
    await vi.waitFor(() => expect(container.querySelector('#policy-group-filter')).not.toBeNull());
    const groupSelect = container.querySelector('#policy-group-filter');
    groupSelect.value = 'g1';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    container.querySelector('[data-edit-resource="m1"]')?.click();

    await vi.waitFor(() => expect(document.querySelector('#policy-acl-save')).not.toBeNull());
    expect(document.body.textContent).not.toContain('Dependency warning');
    expect(document.body.textContent).not.toContain('does not have ACL access to the connection');
  });

  it('auto-opens the target ACL modal from a deep-link url', async () => {
    history.pushState({}, '', '/admin/settings/policies?group=g1&family=connections&resource=c1&open=access');

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(document.querySelector('#policy-acl-save')).not.toBeNull());
    expect(document.body.textContent).toContain('Connection Access');
    expect(document.body.textContent).toContain('Conn 1');
  });

  it('renders correctly from the users alias route', async () => {
    history.replaceState({}, '', '/admin/users/policies');

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.querySelector('#policy-family-select')).not.toBeNull());
    expect(container.textContent).toContain('Access Policies');
    expect(container.textContent).toContain('Slim policy review view. Disabled resources stay hidden by default.');
    expect(container.textContent).toContain('Models');
  });

  it('orders the family selector as connections, models, then integrations', async () => {
    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.querySelector('#policy-family-select')).not.toBeNull());
    const labels = Array.from(container.querySelectorAll('#policy-family-select option')).map((option) => option.textContent.trim());

    expect(labels).toEqual([
      'Connections',
      'Models',
      'Integrations - MCP Servers',
    ]);
  });

  it('allows bulk ACL editing for visible models', async () => {
    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.textContent).toContain('Models'));
    await vi.waitFor(() => expect(container.querySelector('[data-select-visible-family="models"]')).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('#policy-page-save')).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('[data-page-size-family="models"]')).not.toBeNull());

    container.querySelector('[data-select-visible-family="models"]').click();
    await vi.waitFor(() => expect(container.querySelector('[data-bulk-edit-family="models"]')?.disabled).toBe(false));

    container.querySelector('[data-bulk-edit-family="models"]').click();
    await vi.waitFor(() => expect(document.querySelector('#policy-acl-save')).not.toBeNull());

    expect(document.body.textContent).toContain('Bulk Models ACL');
  });

  it('hides disabled resources from policies families', async () => {
    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    expect(mocks.fetchAdminModels).toHaveBeenCalledWith(expect.objectContaining({ includeDisabled: false }));
    expect(container.textContent).not.toContain('Model 2');

    const familySelect = container.querySelector('#policy-family-select');
    familySelect.value = 'connections';
    familySelect.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain('Conn 1'));
    expect(container.textContent).not.toContain('Conn 2');

    familySelect.value = 'mcp-servers';
    familySelect.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain('Server 1'));
    expect(container.textContent).not.toContain('Server 2');
  });

  it('re-sorts policy rows when the selected group changes', async () => {
    mocks.fetchAdminModels.mockResolvedValueOnce({
      models: [
        { id: 'z-model', name: 'Zulu Model', provider: 'openai', enabled: true },
        { id: 'a-model', name: 'Alpha Model', provider: 'openai', enabled: true },
      ],
    });
    mocks.apiFetch.mockImplementationOnce(async (url, init = {}) => {
      const path = String(url);
      if (path === '/api/admin/openai/connections') {
        return new Response(JSON.stringify({ connections: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path.startsWith('/api/admin/models/access?ids=')) {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
          ],
          rules: [
            { model_id: 'z-model', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/tool-servers') {
        return new Response(JSON.stringify({ servers: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);
    await vi.waitFor(() => expect(container.textContent).toContain('Alpha Model'));
    const initialRows = Array.from(container.querySelectorAll('[data-family-panel="models"] .group.flex'));
    expect(initialRows[0].textContent).toContain('Alpha Model');
    expect(initialRows[1].textContent).toContain('Zulu Model');
    expect(container.textContent).toContain('Alpha Model');
    expect(container.textContent).toContain('Zulu Model');

    const groupSelect = container.querySelector('#policy-group-filter');
    groupSelect.value = 'g1';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain('Zulu Model'));
    const afterRows = Array.from(container.querySelectorAll('[data-family-panel="models"] .group.flex'));
    expect(afterRows[0].textContent).toContain('Zulu Model');
    expect(afterRows[1].textContent).toContain('Alpha Model');
    expect(container.textContent).toContain('Alpha Model');
    expect(container.textContent).toContain('Zulu Model');
  });

  it('can include inaccessible items from the visibility dropdown', async () => {
    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.querySelector('#policy-group-filter')).not.toBeNull());
    const groupSelect = container.querySelector('#policy-group-filter');
    groupSelect.value = 'g1';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    expect(container.textContent).toContain('Model 3');

    container.querySelector('#policy-visibility-toggle')?.click();
    container.querySelector('[data-policy-filter="inaccessible"]')?.click();

    await vi.waitFor(() => expect(container.textContent).not.toContain('Model 3'));
  });

  it('applies visibility filters even when all groups are selected', async () => {
    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    expect(container.textContent).toContain('Model 3');

    container.querySelector('#policy-visibility-toggle')?.click();
    toggleVisibilityFilter(container, 'inaccessible', false);

    await vi.waitFor(() => expect(container.textContent).not.toContain('Model 3'));
  });

  it('hides the disabled visibility filter on the users alias route', async () => {
    history.replaceState({}, '', '/admin/users/policies');
    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.querySelector('#policy-visibility-toggle')).not.toBeNull());
    container.querySelector('#policy-visibility-toggle')?.click();

    expect(container.querySelector('[data-policy-filter="disabled"]')).toBeNull();
    expect(container.textContent).not.toContain('Show disabled resources.');
  });

  it('keeps disabled resources hidden by default on the users alias route', async () => {
    history.replaceState({}, '', '/admin/users/policies');
    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    expect(container.textContent).not.toContain('Model 2');
    expect(container.textContent).not.toContain('Conn 2');
    expect(container.textContent).not.toContain('Server 2');
    expect(container.querySelector('[data-policy-filter="disabled"]')).toBeNull();
  });

  it('orders rows by visibility state', async () => {
    mocks.fetchAdminModels.mockResolvedValueOnce({
      models: [
        { id: 'm3', name: 'Model 3', provider: 'openai', enabled: true },
        { id: 'm1', name: 'Model 1', provider: 'openai', enabled: true },
      ],
    });

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.textContent).toContain('Model 1'));
    const text = container.textContent;
    expect(text.indexOf('Model 1')).toBeLessThan(text.indexOf('Model 3'));
  });

  it('makes immediate API call when ACL rules are saved and broadcasts invalidation', async () => {
    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.querySelector('[data-edit-resource]')).not.toBeNull());
    container.querySelector('[data-edit-resource]')?.click();
    await vi.waitFor(() => expect(document.querySelector('#policy-acl-save')).not.toBeNull());

    const modal = document.querySelector('[role="dialog"]') || document.body;
    const select = modal.querySelector('.resource-acl-effect');
    expect(select).not.toBeNull();
    select.value = 'deny';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    vi.clearAllMocks();
    document.querySelector('#policy-acl-save')?.click();

    await vi.waitFor(() => expect(
      mocks.apiFetch.mock.calls.some(([url, options]) => String(url).includes('/access') && String(options?.method || '').toUpperCase() === 'PUT')
    ).toBe(true));

    await vi.waitFor(() => expect(mocks.broadcastModelsInvalidation).toHaveBeenCalled());
    expect(mocks.broadcastConnectionsInvalidation).toHaveBeenCalled();
    expect(mocks.broadcastToolServersInvalidation).toHaveBeenCalled();
  });

  it('disables the policy ACL save button while the access update is saving', async () => {
    let resolveSave;
    const saveResponse = new Promise((resolve) => {
      resolveSave = resolve;
    });

    mocks.apiFetch.mockImplementation(async (url, init = {}) => {
      const path = String(url);
      if (path === '/api/admin/openai/connections') {
        return new Response(JSON.stringify({
          connections: [
            { id: 'c1', name: 'Conn 1', providerType: 'openai-compatible', baseUrl: 'https://example.com', source: 'config' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/tool-servers') {
        return new Response(JSON.stringify({ servers: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/models/access?ids=m1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
          ],
          rules: [
            { model_id: 'm1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path.includes('/access') && init.method === 'PUT') {
        return saveResponse;
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);

    await vi.waitFor(() => expect(container.querySelector('[data-edit-resource]')).not.toBeNull());
    container.querySelector('[data-edit-resource]')?.click();
    await vi.waitFor(() => expect(document.querySelector('#policy-acl-save')).not.toBeNull());

    const modal = document.querySelector('[role="dialog"]') || document.body;
    const select = modal.querySelector('.resource-acl-effect');
    expect(select).not.toBeNull();
    select.value = 'deny';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const saveBtn = document.querySelector('#policy-acl-save');
    saveBtn?.click();
    expect(saveBtn?.disabled).toBe(true);

    resolveSave(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await vi.waitFor(() => expect(document.querySelector('#policy-acl-save')).toBeNull());
  });

  it('re-sorts policy rows when the selected group changes', async () => {
    mocks.fetchAdminModels.mockResolvedValueOnce({
      models: [
        { id: 'm1', name: 'Alpha Model', provider: 'openai', enabled: true, connection_id: 'c1', connection_name: 'Conn 1' },
        { id: 'm2', name: 'Zulu Model', provider: 'openai', enabled: true, connection_id: 'c1', connection_name: 'Conn 1' },
      ],
    });

    mocks.apiFetch.mockImplementationOnce(async (url) => {
      const path = String(url);
      if (path === '/api/admin/openai/connections') {
        return new Response(JSON.stringify({ connections: [{ id: 'c1', name: 'Conn 1', providerType: 'openai-compatible', baseUrl: 'https://example.com', source: 'config' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/models/access?ids=m1%2Cm2') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
            { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
          ],
          rules: [
            { model_id: 'm1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' },
            { model_id: 'm2', principal_type: 'group', principal_id: 'g2', effect: 'allow', action: 'use' },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/openai/connections/access?ids=c1') {
        return new Response(JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
            { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
          ],
          rules: [{ connection_id: 'c1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (path === '/api/admin/tool-servers') {
        return new Response(JSON.stringify({ servers: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderPoliciesSettings } = await loadModule();
    const container = document.getElementById('root');

    renderPoliciesSettings(container);
    await vi.waitFor(() => expect(container.querySelector('#policy-group-filter')).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelectorAll('[data-family-panel="models"] .group').length).toBe(2));

    const initialRows = Array.from(container.querySelectorAll('[data-family-panel="models"] .group')).map((row) => row.textContent.trim());
    expect(initialRows[0]).toContain('Alpha Model');
    expect(initialRows[1]).toContain('Zulu Model');

    const groupSelect = container.querySelector('#policy-group-filter');
    groupSelect.value = 'g2';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      const rows = Array.from(container.querySelectorAll('[data-family-panel="models"] .group')).map((row) => row.textContent.trim());
      expect(rows[0]).toContain('Zulu Model');
      expect(rows[1]).toContain('Alpha Model');
    });
  });
});
