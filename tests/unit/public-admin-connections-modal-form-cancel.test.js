// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../public/js/shared/utils/model-sync.js', () => ({
  broadcastModelsInvalidation: vi.fn(),
}));

vi.mock('../../public/js/shared/utils/connection-sync.js', () => ({
  broadcastConnectionsInvalidation: vi.fn(),
}));

async function loadModalForm() {
  vi.resetModules();
  const mod = await import('../../public/js/features/admin/settings/connections-modal-form.js');
  return mod.createConnectionsModalForm;
}

function makeContainer() {
  document.body.innerHTML = `
    <div id="root">
      <div id="edit-connection-modal">
        <input id="modal-manual-model-id" />
        <button id="modal-manual-model-add"></button>
        <div id="modal-models-list"></div>
        <div id="modal-models-status"></div>
      </div>
    </div>
  `;
  return document.getElementById('root');
}

function makeConnection(overrides = {}) {
  return {
    id: 'conn_test1',
    name: 'OpenAI',
    url: 'https://api.openai.com/v1',
    providerType: 'openai',
    source: 'manual',
    enabled: true,
    manualModels: [
      { modelId: 'gpt-3', name: 'gpt-3' },
      { modelId: 'gpt-4', name: 'gpt-4' },
    ],
    ...overrides,
  };
}

// providerType=openai, id=conn_test1 → providerId = openai/conn_test1
// → formatConnectionModelId(providerId, modelId) = openai/conn_test1:<modelId>
const MODEL_GPT3 = 'openai/conn_test1:gpt-3';
const MODEL_GPT4 = 'openai/conn_test1:gpt-4';
const MODEL_GPT5 = 'openai/conn_test1:gpt-5';

describe('connections modal form — cancel-safe mutation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('removeManualModalModel does NOT mutate selectedConnection.manualModels', async () => {
    const createConnectionsModalForm = await loadModalForm();
    const container = makeContainer();
    const connection = makeConnection();
    const originalManualModels = JSON.parse(JSON.stringify(connection.manualModels));
    const connectionsState = {
      selectedConnection: connection,
      modalModels: [
        { id: MODEL_GPT3, name: 'gpt-3', manual: true, manualModelId: 'gpt-3' },
        { id: MODEL_GPT4, name: 'gpt-4', manual: true, manualModelId: 'gpt-4' },
      ],
      modalModelsSelection: new Set([MODEL_GPT3, MODEL_GPT4]),
      modalModelsOriginal: new Set([MODEL_GPT3, MODEL_GPT4]),
      deletedManualModelIds: [],
    };
    const form = createConnectionsModalForm({
      container,
      connectionsState,
      setTestStatus: vi.fn(),
    });

    form.removeManualModalModel(MODEL_GPT3, container);

    // Live connection state must NOT be mutated so cancel/refresh preserves DB view.
    expect(connection.manualModels).toEqual(originalManualModels);
    // Tombstone for save-time filtering.
    expect(connectionsState.deletedManualModelIds).toEqual(['gpt-3']);
    // Modal-local copy reflects the deletion.
    expect(connectionsState.modalModels).toHaveLength(1);
    expect(connectionsState.modalModels[0].id).toBe(MODEL_GPT4);
    expect(connectionsState.modalModelsSelection.has(MODEL_GPT3)).toBe(false);
  });

  it('addManualModalModel does NOT mutate selectedConnection.manualModels', async () => {
    const createConnectionsModalForm = await loadModalForm();
    const container = makeContainer();
    const connection = makeConnection();
    const originalManualModels = JSON.parse(JSON.stringify(connection.manualModels));
    const connectionsState = {
      selectedConnection: connection,
      modalModels: [],
      modalModelsSelection: new Set(),
      modalModelsOriginal: new Set(),
      deletedManualModelIds: [],
    };
    const form = createConnectionsModalForm({
      container,
      connectionsState,
      setTestStatus: vi.fn(),
    });

    container.querySelector('#modal-manual-model-id').value = 'gpt-5';
    form.addManualModalModel(container);

    // Live connection state must NOT be mutated so cancel preserves DB view.
    expect(connection.manualModels).toEqual(originalManualModels);
    // Modal-local copy has the new model so save flow picks it up.
    expect(connectionsState.modalModels.map((m) => m.id)).toContain(MODEL_GPT5);
    expect(connectionsState.modalModelsSelection.has(MODEL_GPT5)).toBe(true);
  });

  it('removeManualModalModel after addManualModalModel + cancel keeps DB list intact', async () => {
    const createConnectionsModalForm = await loadModalForm();
    const container = makeContainer();
    const connection = makeConnection();
    const originalManualModels = JSON.parse(JSON.stringify(connection.manualModels));
    const connectionsState = {
      selectedConnection: connection,
      modalModels: [
        { id: MODEL_GPT3, name: 'gpt-3', manual: true, manualModelId: 'gpt-3' },
        { id: MODEL_GPT4, name: 'gpt-4', manual: true, manualModelId: 'gpt-4' },
      ],
      modalModelsSelection: new Set([MODEL_GPT3, MODEL_GPT4]),
      modalModelsOriginal: new Set([MODEL_GPT3, MODEL_GPT4]),
      deletedManualModelIds: [],
    };
    const form = createConnectionsModalForm({
      container,
      connectionsState,
      setTestStatus: vi.fn(),
    });

    // Delete a model
    form.removeManualModalModel(MODEL_GPT3, container);
    // "Cancel" — reset tombstones (matches closeModal flow)
    connectionsState.deletedManualModelIds = [];

    // After cancel, the live connection's manualModels must still reflect DB state.
    expect(connection.manualModels).toEqual(originalManualModels);

    // Re-seeding from connection.manualModels yields the full DB list.
    const { inflateManualConnectionModels } =
      await import('../../public/js/shared/utils/connection-helpers.js');
    const reseeded = inflateManualConnectionModels(connection);
    expect(reseeded.map((m) => m.manualModelId).sort()).toEqual(['gpt-3', 'gpt-4']);
  });

  it('refreshModalModels preserves an unsaved manual-model addition through the Verify round-trip', async () => {
    // PR #173 review thread (github-actions 09:47:04Z, COMMENTED): the
    // bot claimed refreshModalModels could drop unsaved manual-model
    // additions because existingManualModels was rebuilt from
    // selectedConnection.manualModels instead of the current modal
    // state. This test proves the bot's claim is incorrect: the
    // preview step takes connectionsState.modalModels as its base, so
    // gpt-5 (added in the modal session) survives the round-trip
    // even though connection.manualModels doesn't list it yet.
    const createConnectionsModalForm = await loadModalForm();
    const container = makeContainer();
    const connection = makeConnection();
    const connectionsState = {
      selectedConnection: connection,
      modalModels: [
        { id: MODEL_GPT3, name: 'gpt-3', manual: true, manualModelId: 'gpt-3' },
        { id: MODEL_GPT4, name: 'gpt-4', manual: true, manualModelId: 'gpt-4' },
        // gpt-5 added in this modal session — unsaved, not in
        // connection.manualModels.
        { id: MODEL_GPT5, name: 'gpt-5', manual: true, manualModelId: 'gpt-5' },
      ],
      modalModelsSelection: new Set([MODEL_GPT3, MODEL_GPT4, MODEL_GPT5]),
      modalModelsOriginal: new Set([MODEL_GPT3, MODEL_GPT4]),
      deletedManualModelIds: [],
    };
    const form = createConnectionsModalForm({
      container,
      connectionsState,
      setTestStatus: vi.fn(),
    });

    const { apiFetch } = await import('../../public/js/shared/api.js');
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          { id: 'upstream-1', name: 'Upstream One', enabled: true },
          { id: 'upstream-2', name: 'Upstream Two', enabled: true },
        ],
      }),
    });

    await form.refreshModalModels(container);

    // gpt-5 must still be in the modal after refresh even though
    // connection.manualModels doesn't include it (user hasn't saved yet).
    const ids = connectionsState.modalModels.map((m) => m.id);
    expect(ids).toContain(MODEL_GPT5);
    expect(ids).toContain(MODEL_GPT3);
    expect(ids).toContain(MODEL_GPT4);
    expect(ids).toContain('openai/conn_test1:upstream-1');
    expect(ids).toContain('openai/conn_test1:upstream-2');
    expect(connectionsState.modalModelsSelection.has(MODEL_GPT5)).toBe(true);
  });

  it('refreshModalModels filters deleted manual models out of the merged list', async () => {
    const createConnectionsModalForm = await loadModalForm();
    const container = makeContainer();
    const connection = makeConnection();
    const connectionsState = {
      selectedConnection: connection,
      modalModels: [
        // After delete: gpt-3 is removed from modalModels.
        { id: MODEL_GPT4, name: 'gpt-4', manual: true, manualModelId: 'gpt-4' },
      ],
      modalModelsSelection: new Set([MODEL_GPT4]),
      modalModelsOriginal: new Set([MODEL_GPT4]),
      deletedManualModelIds: ['gpt-3'], // tombstone for gpt-3
    };
    const form = createConnectionsModalForm({
      container,
      connectionsState,
      setTestStatus: vi.fn(),
    });

    // Stub the fetch that refreshModalModels issues to /api/admin/openai/connections/test.
    const { apiFetch } = await import('../../public/js/shared/api.js');
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          { id: 'upstream-1', name: 'Upstream One', enabled: true },
          { id: 'upstream-2', name: 'Upstream Two', enabled: true },
        ],
      }),
    });

    await form.refreshModalModels(container);

    // Modal models after refresh: upstream models PLUS gpt-4 (selected manual),
    // but NOT gpt-3 (deleted in this session and filtered by the tombstone).
    const ids = connectionsState.modalModels.map((m) => m.id);
    expect(ids).toContain('openai/conn_test1:upstream-1');
    expect(ids).toContain('openai/conn_test1:upstream-2');
    expect(ids).toContain(MODEL_GPT4);
    expect(ids).not.toContain(MODEL_GPT3);
  });
});
