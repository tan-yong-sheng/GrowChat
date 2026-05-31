import { describe, expect, it } from 'vitest';
import { applyModalModelPreview } from './connections-helpers-modal-models.js';

function createModalState(connection) {
  return {
    selectedConnection: connection,
    modalModels: [],
    modalModelsSelection: new Set(),
    modalModelsOriginal: new Set(),
    modalModelsQuery: '',
  };
}

describe('connections modal model helpers', () => {
  it('normalizes preview model ids to the connection provider id', () => {
    const state = createModalState({
      id: 'conn-123',
      providerType: 'gemini-compatible',
    });

    applyModalModelPreview(state, [
      { id: 'gemini-2.5-pro', name: 'Gemini Pro' },
      { id: 'gemini-2.0-flash', name: 'Flash' },
    ]);

    expect(state.modalModels.map((model) => model.id)).toEqual([
      'google/conn-123:gemini-2.5-pro',
      'google/conn-123:gemini-2.0-flash',
    ]);
    expect(Array.from(state.modalModelsSelection)).toEqual([
      'google/conn-123:gemini-2.5-pro',
      'google/conn-123:gemini-2.0-flash',
    ]);
    expect(Array.from(state.modalModelsOriginal)).toEqual([
      'google/conn-123:gemini-2.5-pro',
      'google/conn-123:gemini-2.0-flash',
    ]);
  });
});
