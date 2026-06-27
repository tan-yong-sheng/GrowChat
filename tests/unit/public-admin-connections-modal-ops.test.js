// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/shared/utils/modal-hash.js', () => ({
  setModalHash: vi.fn(),
  clearModalHash: vi.fn(),
}));

vi.mock('../modal-shell.js', () => ({
  getAdminModalPreset: () => ({
    outerClass: 'fixed',
    overlayClass: 'absolute',
    zIndex: 150,
  }),
}));

async function loadModalOps() {
  vi.resetModules();
  return import('../../public/js/features/admin/settings/connections-modal-ops.js');
}

function makeContainer() {
  document.body.innerHTML = `
    <div id="root">
      <div id="edit-connection-modal" class="hidden"></div>
      <div id="add-connection-modal" class="hidden"></div>
      <div id="connection-test-message"></div>
    </div>
  `;
  return document.getElementById('root');
}

function makeConnection(overrides = {}) {
  return {
    id: 'conn_b',
    name: 'Other',
    url: 'https://api.example.com/v1',
    providerType: 'openai',
    source: 'manual',
    enabled: true,
    manualModels: [{ modelId: 'foo', name: 'foo' }],
    ...overrides,
  };
}

describe('connections modal ops — openModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resets deletedManualModelIds when opening a connection (no tombstone leakage across connections)', async () => {
    // PR #173 review thread Ms7sL: deletedManualModelIds was scoped to the
    // global connectionsState rather than the currently opened connection.
    // Deleting a model in one connection and then opening a different one
    // (without close) would leave the prior tombstones in place and hide
    // unrelated models that happened to share the same canonical id.
    // openModal must reset the tombstone list before loading the new
    // connection's model list.
    const { createConnectionsModalOps } = await loadModalOps();
    const container = makeContainer();
    const connectionsState = {
      showModal: false,
      selectedConnection: null,
      modalMode: 'create',
      modalModelsQuery: '',
      // Pretend a different connection had a model deleted earlier.
      deletedManualModelIds: ['openai/conn_a:foo'],
    };

    const ops = createConnectionsModalOps({
      container,
      connectionsState,
      modalForm: {
        fillModalFields: vi.fn(),
        loadModalModels: vi.fn(),
        refreshModalModels: vi.fn(),
        updateModalSaveButton: vi.fn(),
      },
    });

    ops.openModal(makeConnection());

    expect(connectionsState.deletedManualModelIds).toEqual([]);
  });

  it('resets deletedManualModelIds when opening a fresh connection (null arg)', async () => {
    const { createConnectionsModalOps } = await loadModalOps();
    const container = makeContainer();
    const connectionsState = {
      showModal: false,
      selectedConnection: null,
      modalMode: 'create',
      modalModelsQuery: '',
      deletedManualModelIds: ['openai/conn_a:bar', 'openai/conn_a:baz'],
    };

    const ops = createConnectionsModalOps({
      container,
      connectionsState,
      modalForm: {
        fillModalFields: vi.fn(),
        loadModalModels: vi.fn(),
        refreshModalModels: vi.fn(),
        updateModalSaveButton: vi.fn(),
      },
    });

    ops.openModal(null);

    expect(connectionsState.deletedManualModelIds).toEqual([]);
  });
});
