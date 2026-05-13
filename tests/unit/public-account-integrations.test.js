// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  ensureMarkedReady: vi.fn(),
  fetchUserMcpServers: vi.fn(),
  createUserMcpServer: vi.fn(),
  updateUserMcpServer: vi.fn(),
  deleteUserMcpServer: vi.fn(),
  testUserMcpServer: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/api/request.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/utils.js', () => ({
  ensureMarkedReady: (...args) => mocks.ensureMarkedReady(...args),
}));

async function loadModule() {
  vi.resetModules();
  const { renderAccountPage } = await import('../../public/js/features/account/account.js');
  return { renderAccountPage };
}

async function flush(count = 2) {
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function makeIntegrationServer(overrides = {}) {
  return {
    id: 'mcp-1',
    name: 'Personal MCP',
    url: 'https://mcp.example.com',
    headers: '{"X-Test":"1"}',
    enabled: true,
    auth_type: 'bearer',
    auth_bearer_token: 'secret-token',
    auth_basic_username: '',
    auth_basic_password: '',
    oauth_client_name: '',
    oauth_scope: '',
    oauth_client_id: '',
    oauth_client_secret: '',
    oauth_token_auth_method: '',
    oauth_connected: false,
    oauth_connected_at: null,
    ...overrides,
  };
}

function makeAccountState(servers = [makeIntegrationServer()], sharedServers = []) {
  const capabilities = {
    permissions: [
      'chat.read',
      'user.settings.profile.write',
      'user.settings.preferences.write',
      'user.settings.connections.write',
      'user.settings.integrations.write',
      'user.settings.tool-servers.write',
    ],
    canManageConnections: true,
    canManageToolServers: true,
    canManageModels: true,
    canManageAcls: false,
  };
  return {
    user: {
      id: 'u1',
      name: 'Sam',
      email: 'sam@example.com',
      primary_role: 'member',
      avatar_emoji: 'S',
      status: 'online',
    },
    permissions: capabilities.permissions,
    roles: [{ role_name: 'member' }],
    capabilities,
    app_config: { default_model_id: 'gpt-5-mini' },
    settings: {
      general: {
        name: 'Sam',
        email: 'sam@example.com',
        avatar: null,
        avatar_emoji: 'S',
        status: 'online',
        account_status: 'active',
        settings: {},
      },
      preferences: { theme: 'system' },
      connections: { my_connections: [], connections: [] },
      integrations: { servers, accessible_servers: sharedServers },
      tool_servers: { servers, accessible_servers: sharedServers },
      models: { default_model_id: 'gpt-5-mini' },
    },
  };
}

describe('account integrations section', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    window.history.pushState({}, '', '/account/settings/integrations');
    vi.restoreAllMocks();
    mocks.ensureMarkedReady.mockReset();
    mocks.apiFetch.mockReset();
    mocks.createUserMcpServer.mockReset();
    mocks.updateUserMcpServer.mockReset();
    mocks.deleteUserMcpServer.mockReset();
    mocks.testUserMcpServer.mockReset();
  });

  it('opens the add integration modal with the shared admin-style shell', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState(
            [makeIntegrationServer()],
            [
              makeIntegrationServer({
                id: 'shared-1',
                name: 'Shared MCP',
                url: 'https://shared.example.com',
                access_label: 'Shared',
                visible_for_user: true,
                hidden_for_user: false,
                tools: [
                  {
                    name: 'shared_search',
                    title: 'Shared Search',
                    description: 'Shared tool',
                    enabled: true,
                  },
                ],
              }),
            ]
          )
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [makeIntegrationServer()],
          accessible_servers: [
            makeIntegrationServer({
              id: 'shared-1',
              name: 'Shared MCP',
              url: 'https://shared.example.com',
              access_label: 'Shared',
              visible_for_user: true,
              hidden_for_user: false,
              tools: [
                {
                  name: 'shared_search',
                  title: 'Shared Search',
                  description: 'Shared tool',
                  enabled: true,
                },
              ],
            }),
          ],
        })
      );

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await vi.waitFor(() => expect(document.querySelector('#tool-servers-list')).not.toBeNull());

    expect(document.body.textContent).toContain('Personal');
    expect(document.body.textContent).toContain('Shared');
    expect(document.body.textContent).not.toContain('Shared servers');
    expect(document.body.textContent).not.toContain('Visible for you');
    expect(document.querySelector('#tool-servers-list')?.className).toContain('overflow-y-auto');
    expect(document.querySelector('#tool-servers-list')?.className).toContain(
      'max-h-[calc(100dvh-20rem)]'
    );
    const sharedToggle = document.querySelector(
      '[data-tool-toggle-scope="shared"][data-tool-name="shared_search"]'
    );
    expect(sharedToggle).not.toBeNull();
    sharedToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.body.textContent).toContain('Shared Search');
    expect(
      document.querySelector('[data-tool-toggle-scope="shared"][data-tool-name="shared_search"]')
    ).not.toBeNull();
    expect(document.querySelector('#account-main-footer #save-integrations')).toBeNull();
    const addBtn = document.querySelector('[data-account-integration-add]');
    expect(addBtn).not.toBeNull();
    addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    const modalRoot = document.getElementById('account-integration-modal');
    expect(modalRoot).not.toBeNull();
    expect(modalRoot?.className).toContain('items-start');
    expect(modalRoot?.className).toContain('overflow-y-auto');
    expect(modalRoot?.querySelector('[class*="rounded-3xl"]')).not.toBeNull();
    expect(modalRoot?.querySelector('#server-modal-title')).not.toBeNull();
    expect(modalRoot?.textContent).toContain('Add MCP Server');
    expect(modalRoot?.getAttribute('data-trace-route')).toBe('/account/settings/integrations');
    expect(modalRoot?.getAttribute('data-trace-scope')).toBe('account');
    expect(modalRoot?.getAttribute('data-trace-family')).toBe('mcp-servers');
  }, 10000);

  it('clears the account integration modal hash when closed', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(jsonResponse(makeAccountState()))
      .mockResolvedValueOnce(jsonResponse({ servers: [makeIntegrationServer()] }));

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    document.querySelector('[data-account-integration-add]')?.click();
    await flush(2);
    expect(window.location.hash).toBe('#add-account-integration-modal');

    document
      .querySelector('#close-modal')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(2);

    expect(window.location.hash).toBe('');
    expect(document.getElementById('account-integration-modal')).toBeNull();
  });

  it('omits disabled shared integrations from account scope', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState(
            [makeIntegrationServer()],
            [
              makeIntegrationServer({
                id: 'shared-disabled',
                name: 'Disabled Shared MCP',
                url: 'https://disabled.example.com',
                enabled: false,
                access_label: 'Shared',
                visible_for_user: false,
                hidden_for_user: true,
                tools: [
                  {
                    name: 'disabled_search',
                    title: 'Disabled Search',
                    description: 'Disabled tool',
                    enabled: true,
                  },
                ],
              }),
            ]
          )
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [makeIntegrationServer()],
          accessible_servers: [
            makeIntegrationServer({
              id: 'shared-disabled',
              name: 'Disabled Shared MCP',
              url: 'https://disabled.example.com',
              enabled: false,
              access_label: 'Shared',
              visible_for_user: false,
              hidden_for_user: true,
              tools: [
                {
                  name: 'disabled_search',
                  title: 'Disabled Search',
                  description: 'Disabled tool',
                  enabled: true,
                },
              ],
            }),
          ],
        })
      );

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    expect(document.body.textContent).not.toContain('Disabled Shared MCP');
    expect(document.querySelector('[data-tool-server-row="shared-disabled"]')).toBeNull();
  }, 10000);

  it('sorts enabled personal integrations before disabled ones and keeps visible shared servers above hidden ones', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState(
            [
              makeIntegrationServer({
                id: 'mcp-disabled',
                name: 'Personal Disabled',
                url: 'https://disabled.example.com',
                enabled: false,
              }),
              makeIntegrationServer({
                id: 'mcp-enabled',
                name: 'Personal Enabled',
                url: 'https://enabled.example.com',
                enabled: true,
              }),
            ],
            [
              makeIntegrationServer({
                id: 'shared-hidden',
                name: 'Shared Hidden',
                url: 'https://hidden.example.com',
                enabled: true,
                access_label: 'Shared',
                visible_for_user: false,
                hidden_for_user: true,
              }),
              makeIntegrationServer({
                id: 'shared-visible',
                name: 'Shared Visible',
                url: 'https://visible.example.com',
                enabled: true,
                access_label: 'Shared',
                visible_for_user: true,
                hidden_for_user: false,
              }),
            ]
          )
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [
            makeIntegrationServer({
              id: 'mcp-disabled',
              name: 'Personal Disabled',
              url: 'https://disabled.example.com',
              enabled: false,
            }),
            makeIntegrationServer({
              id: 'mcp-enabled',
              name: 'Personal Enabled',
              url: 'https://enabled.example.com',
              enabled: true,
            }),
          ],
          accessible_servers: [
            makeIntegrationServer({
              id: 'shared-hidden',
              name: 'Shared Hidden',
              url: 'https://hidden.example.com',
              enabled: true,
              access_label: 'Shared',
              visible_for_user: false,
              hidden_for_user: true,
            }),
            makeIntegrationServer({
              id: 'shared-visible',
              name: 'Shared Visible',
              url: 'https://visible.example.com',
              enabled: true,
              access_label: 'Shared',
              visible_for_user: true,
              hidden_for_user: false,
            }),
          ],
        })
      );

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    const personalRows = Array.from(
      document.querySelectorAll('#tool-servers-list [data-tool-server-row]')
    ).filter((row) => row.closest('.mt-3.space-y-2') === null);
    expect(personalRows.map((row) => row.getAttribute('data-id'))).toEqual([
      'mcp-disabled',
      'mcp-enabled',
    ]);

    const sharedRows = Array.from(
      document.querySelectorAll('#tool-servers-list .mt-3.space-y-2 [data-tool-server-row]')
    );
    expect(sharedRows.map((row) => row.getAttribute('data-id'))).toEqual([
      'shared-visible',
      'shared-hidden',
    ]);
  }, 10000);

  it('saves a personal integration and refreshes the list', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(jsonResponse(makeAccountState([])))
      .mockResolvedValueOnce(jsonResponse({ servers: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          tools: [
            {
              name: 'exa_search',
              title: 'Exa Search',
              description: 'Search the web',
              parameters: { type: 'object' },
              enabled: true,
            },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ server: { id: 'mcp-new' } }, 201))
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState([
            makeIntegrationServer({
              id: 'mcp-new',
              name: 'Updated MCP',
              url: 'https://tools.example.com',
              auth_type: 'basic',
              auth_basic_username: 'sam',
              tools: [
                {
                  name: 'exa_search',
                  title: 'Exa Search',
                  description: 'Search the web',
                  parameters: { type: 'object' },
                  enabled: true,
                },
              ],
            }),
          ])
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [
            makeIntegrationServer({
              id: 'mcp-new',
              name: 'Updated MCP',
              url: 'https://tools.example.com',
              auth_type: 'basic',
              auth_basic_username: 'sam',
              tools: [
                {
                  name: 'exa_search',
                  title: 'Exa Search',
                  description: 'Search the web',
                  parameters: { type: 'object' },
                  enabled: true,
                },
              ],
            }),
          ],
        })
      );

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    expect(document.body.textContent).toContain('Personal');
    expect(document.body.textContent).not.toContain('Visible for you');
    expect(document.querySelector('#account-main-footer #save-integrations')).toBeNull();
    const addBtn = document.querySelector('[data-account-integration-add]');
    expect(addBtn).not.toBeNull();
    addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const modal = document.getElementById('account-integration-modal');
    expect(modal).not.toBeNull();

    modal.querySelector('#server-name').value = 'Updated MCP';
    modal.querySelector('#server-url').value = 'https://tools.example.com';
    modal.querySelector('#server-auth-type').value = 'basic';
    modal.querySelector('#server-auth-basic-username').value = 'sam';
    modal.querySelector('#server-auth-basic-password').value = 'secret';
    modal.querySelector('#save-modal')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(6);

    expect(
      mocks.apiFetch.mock.calls.some(
        ([url, options]) =>
          String(url) === '/api/users/me/resources/mcp-servers/test' &&
          String(options?.method || '').toUpperCase() === 'POST'
      )
    ).toBe(true);
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/users/me/resources/mcp-servers',
      expect.objectContaining({
        method: 'POST',
      })
    );
    const createCall = mocks.apiFetch.mock.calls.find(
      ([url, options]) =>
        String(url) === '/api/users/me/resources/mcp-servers' &&
        String(options?.method || '').toUpperCase() === 'POST'
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(createCall[1].body)).toEqual(
      expect.objectContaining({
        name: 'Updated MCP',
        url: 'https://tools.example.com',
        auth_type: 'basic',
        auth_basic_username: 'sam',
        auth_basic_password: 'secret',
        enabled: true,
        tools: [
          expect.objectContaining({
            name: 'exa_search',
            title: 'Exa Search',
            description: 'Search the web',
            parameters: { type: 'object' },
            enabled: true,
          }),
        ],
      })
    );
    expect(document.body.textContent).toContain('Updated MCP');
    expect(document.body.textContent).toContain('Tools: 1 / 1 enabled');
    expect(
      mocks.apiFetch.mock.calls.filter(([url]) => String(url) === '/api/users/me/settings')
    ).toHaveLength(1);
  });

  it('persists shared tool visibility overrides for shared integrations', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState(
            [makeIntegrationServer()],
            [
              makeIntegrationServer({
                id: 'shared-1',
                name: 'Shared MCP',
                url: 'https://shared.example.com',
                access_label: 'Shared',
                visible_for_user: true,
                hidden_for_user: false,
                tools: [
                  {
                    name: 'shared_search',
                    title: 'Shared Search',
                    description: 'Shared tool',
                    enabled: true,
                    visible_for_user: true,
                  },
                ],
              }),
            ]
          )
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [makeIntegrationServer()],
          accessible_servers: [
            makeIntegrationServer({
              id: 'shared-1',
              name: 'Shared MCP',
              url: 'https://shared.example.com',
              access_label: 'Shared',
              visible_for_user: true,
              hidden_for_user: false,
              tools: [
                {
                  name: 'shared_search',
                  title: 'Shared Search',
                  description: 'Shared tool',
                  enabled: true,
                  visible_for_user: true,
                },
              ],
            }),
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState(
            [makeIntegrationServer()],
            [
              makeIntegrationServer({
                id: 'shared-1',
                name: 'Shared MCP',
                url: 'https://shared.example.com',
                access_label: 'Shared',
                visible_for_user: true,
                hidden_for_user: false,
                tools: [
                  {
                    name: 'shared_search',
                    title: 'Shared Search',
                    description: 'Shared tool',
                    enabled: true,
                    visible_for_user: false,
                    hidden_for_user: true,
                  },
                ],
              }),
            ]
          )
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [makeIntegrationServer()],
          accessible_servers: [
            makeIntegrationServer({
              id: 'shared-1',
              name: 'Shared MCP',
              url: 'https://shared.example.com',
              access_label: 'Shared',
              visible_for_user: true,
              hidden_for_user: false,
              tools: [
                {
                  name: 'shared_search',
                  title: 'Shared Search',
                  description: 'Shared tool',
                  enabled: true,
                  visible_for_user: false,
                  hidden_for_user: true,
                },
              ],
            }),
          ],
        })
      );
    mocks.apiFetch.mockImplementation(async (url, options) => {
      if (
        String(url) === '/api/users/me' &&
        String(options?.method || '').toUpperCase() === 'PUT'
      ) {
        return jsonResponse({ user: { preferences: JSON.parse(options.body).preferences } });
      }
      return jsonResponse({});
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);
    document
      .querySelector('[data-tool-server-row="shared-1"] .tools-toggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const sharedToolButton = document.querySelector(
      '[data-tool-toggle-scope="shared"][data-tool-name="shared_search"]'
    );
    expect(sharedToolButton).not.toBeNull();
    expect(sharedToolButton?.getAttribute('aria-label')).toBe('Hide for me');
    sharedToolButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(2);
    await flush(6);

    const updateCall = mocks.apiFetch.mock.calls.find(
      ([url, options]) =>
        String(url) === '/api/users/me' && String(options?.method || '').toUpperCase() === 'PUT'
    );
    expect(updateCall).toBeDefined();
    expect(JSON.parse(updateCall[1].body)).toEqual(
      expect.objectContaining({
        preferences: expect.objectContaining({
          resource_overrides: expect.objectContaining({
            tool_servers: expect.objectContaining({
              tools: expect.objectContaining({
                'shared-1': expect.objectContaining({
                  hidden_ids: ['shared_search'],
                }),
              }),
            }),
          }),
        }),
      })
    );
    expect(
      document
        .querySelector('[data-tool-toggle-scope="shared"][data-tool-name="shared_search"]')
        ?.getAttribute('aria-label')
    ).toBe('Show for me');
  });

  it('toggles tool descriptions without losing the expanded state', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState([
            makeIntegrationServer({
              id: 'mcp-1',
              name: 'Personal MCP',
              url: 'https://mcp.example.com',
              tools: [
                {
                  name: 'search',
                  title: 'Search',
                  description:
                    'This personal tool has a long description that should collapse and expand when toggled. '.repeat(
                      4
                    ),
                  enabled: true,
                },
              ],
            }),
          ])
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [
            makeIntegrationServer({
              id: 'mcp-1',
              name: 'Personal MCP',
              url: 'https://mcp.example.com',
              tools: [
                {
                  name: 'search',
                  title: 'Search',
                  description:
                    'This personal tool has a long description that should collapse and expand when toggled. '.repeat(
                      4
                    ),
                  enabled: true,
                },
              ],
            }),
          ],
          accessible_servers: [],
        })
      );

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    document
      .querySelector('[data-tool-server-row="mcp-1"] .tools-toggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(1);

    const moreButton = document.querySelector('[data-tool-server-row="mcp-1"] .tool-desc-toggle');
    expect(moreButton).not.toBeNull();
    expect(document.body.textContent).toContain('More');

    moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(1);
    expect(document.body.textContent).toContain('Less');
  });

  it('persists personal tool toggles to the server config', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState([
            makeIntegrationServer({
              id: 'mcp-1',
              name: 'Personal MCP',
              url: 'https://mcp.example.com',
              tools: [
                { name: 'search', title: 'Search', description: 'Search tool', enabled: true },
                { name: 'fetch', title: 'Fetch', description: 'Fetch tool', enabled: true },
              ],
            }),
          ])
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [
            makeIntegrationServer({
              id: 'mcp-1',
              name: 'Personal MCP',
              url: 'https://mcp.example.com',
              tools: [
                { name: 'search', title: 'Search', description: 'Search tool', enabled: true },
                { name: 'fetch', title: 'Fetch', description: 'Fetch tool', enabled: true },
              ],
            }),
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          server: {
            id: 'mcp-1',
            enabled: true,
            tools: [
              { name: 'search', title: 'Search', description: 'Search tool', enabled: false },
              { name: 'fetch', title: 'Fetch', description: 'Fetch tool', enabled: true },
            ],
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [
            makeIntegrationServer({
              id: 'mcp-1',
              name: 'Personal MCP',
              url: 'https://mcp.example.com',
              tools: [
                { name: 'search', title: 'Search', description: 'Search tool', enabled: false },
                { name: 'fetch', title: 'Fetch', description: 'Fetch tool', enabled: true },
              ],
            }),
          ],
        })
      );

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    const toolsToggle = document.querySelector('[data-tool-server-row="mcp-1"] .tools-toggle');
    expect(toolsToggle).not.toBeNull();
    toolsToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(1);

    const toolButton = document.querySelector(
      '[data-tool-server-row="mcp-1"] .tool-toggle[data-tool-name="search"]'
    );
    expect(toolButton).not.toBeNull();
    toolButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(4);

    const updateCall = mocks.apiFetch.mock.calls.find(
      ([url, options]) =>
        String(url) === '/api/users/me/resources/mcp-servers/mcp-1' &&
        String(options?.method || '').toUpperCase() === 'PUT'
    );
    expect(updateCall).toBeDefined();
    expect(JSON.parse(updateCall[1].body)).toEqual(
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'search', enabled: false }),
          expect.objectContaining({ name: 'fetch', enabled: true }),
        ]),
      })
    );
    expect(
      document
        .querySelector('[data-tool-server-row="mcp-1"] .tool-toggle[data-tool-name="search"]')
        ?.getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('keeps rapid shared visibility toggles on the latest immediate save', async () => {
    let resolveFirstSave;
    const firstSave = new Promise((resolve) => {
      resolveFirstSave = resolve;
    });
    const saveCalls = [];

    mocks.apiFetch.mockImplementation(async (url, options = {}) => {
      const method = String(options.method || 'GET').toUpperCase();
      if (String(url) === '/api/users/me' && method === 'PUT') {
        saveCalls.push(JSON.parse(options.body));
        if (saveCalls.length === 1) {
          return firstSave;
        }
        return jsonResponse({ user: { preferences: JSON.parse(options.body).preferences } });
      }
      return jsonResponse({});
    });
    mocks.apiFetch
      .mockResolvedValueOnce(
        jsonResponse(
          makeAccountState(
            [makeIntegrationServer()],
            [
              makeIntegrationServer({
                id: 'shared-1',
                name: 'Shared MCP',
                url: 'https://shared.example.com',
                access_label: 'Shared',
                visible_for_user: true,
                hidden_for_user: false,
                tools: [
                  {
                    name: 'shared_search',
                    title: 'Shared Search',
                    description: 'Shared tool',
                    enabled: true,
                    visible_for_user: true,
                  },
                  {
                    name: 'shared_fetch',
                    title: 'Shared Fetch',
                    description: 'Shared tool',
                    enabled: true,
                    visible_for_user: true,
                  },
                ],
              }),
            ]
          )
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [makeIntegrationServer()],
          accessible_servers: [
            makeIntegrationServer({
              id: 'shared-1',
              name: 'Shared MCP',
              url: 'https://shared.example.com',
              access_label: 'Shared',
              visible_for_user: true,
              hidden_for_user: false,
              tools: [
                {
                  name: 'shared_search',
                  title: 'Shared Search',
                  description: 'Shared tool',
                  enabled: true,
                  visible_for_user: true,
                },
                {
                  name: 'shared_fetch',
                  title: 'Shared Fetch',
                  description: 'Shared tool',
                  enabled: true,
                  visible_for_user: true,
                },
              ],
            }),
          ],
        })
      );

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    document
      .querySelector('[data-tool-server-row="shared-1"] .tools-toggle')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(1);
    const firstToolButton = document.querySelector(
      '[data-tool-toggle-scope="shared"][data-tool-name="shared_search"]'
    );
    const secondToolButton = document.querySelector(
      '[data-tool-toggle-scope="shared"][data-tool-name="shared_fetch"]'
    );
    expect(firstToolButton).not.toBeNull();
    expect(secondToolButton).not.toBeNull();

    firstToolButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(2);
    const refreshedSecondToolButton = document.querySelector(
      '[data-tool-toggle-scope="shared"][data-tool-name="shared_fetch"]'
    );
    expect(refreshedSecondToolButton).not.toBeNull();
    await flush(2);

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]).toMatchObject({
      preferences: {
        resource_overrides: {
          tool_servers: {
            tools: {
              'shared-1': {
                hidden_ids: ['shared_search'],
              },
            },
          },
        },
      },
    });

    refreshedSecondToolButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(2);

    resolveFirstSave(jsonResponse({ user: { preferences: saveCalls[0].preferences } }));
    await flush(8);

    expect(saveCalls).toHaveLength(2);
    expect(saveCalls[1]).toMatchObject({
      preferences: {
        resource_overrides: {
          tool_servers: {
            tools: {
              'shared-1': {
                hidden_ids: ['shared_search', 'shared_fetch'],
              },
            },
          },
        },
      },
    });
    expect(
      document
        .querySelector('[data-tool-toggle-scope="shared"][data-tool-name="shared_search"]')
        ?.getAttribute('aria-label')
    ).toBe('Show for me');
    expect(
      document
        .querySelector('[data-tool-toggle-scope="shared"][data-tool-name="shared_fetch"]')
        ?.getAttribute('aria-label')
    ).toBe('Show for me');
  });

  it('deletes a personal integration after confirmation and refreshes the list', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(jsonResponse(makeAccountState()))
      .mockResolvedValueOnce(jsonResponse({ servers: [makeIntegrationServer()] }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse(makeAccountState([])))
      .mockResolvedValueOnce(jsonResponse({ servers: [] }));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    expect(document.querySelector('#account-main-footer #save-integrations')).toBeNull();
    const editBtn = document.querySelector('[data-account-integration-edit="mcp-1"]');
    expect(editBtn).not.toBeNull();
    editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(2);
    document
      .querySelector('#delete-server')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(6);

    expect(confirmSpy).toHaveBeenCalled();
    expect(
      mocks.apiFetch.mock.calls.some(
        ([url, options]) =>
          String(url) === '/api/users/me/resources/mcp-servers/mcp-1' &&
          String(options?.method || '').toUpperCase() === 'DELETE'
      )
    ).toBe(true);
    expect(document.body.textContent).toContain('No tool servers configured');
    expect(
      mocks.apiFetch.mock.calls.filter(([url]) => String(url) === '/api/users/me/settings')
    ).toHaveLength(1);
  });
});
