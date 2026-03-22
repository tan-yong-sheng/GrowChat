import { describe, expect, it } from 'vitest';
import {
  applyModalDraft,
  applyModalModelPreview,
  persistModalDraft,
} from './connections-helpers.js';

function createModalState(connection) {
  return {
    selectedConnection: connection,
    modalModels: [],
    modalModelsSelection: new Set(),
    modalModelsOriginal: new Set(),
    modalModelsQuery: '',
    modalDrafts: new Map(),
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

  it('reapplies stored drafts using canonical model ids', () => {
    const state = createModalState({
      id: 'conn-456',
      providerType: 'openai-compatible',
    });
    state.modalDrafts.set('conn-456', {
      models: [
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      ],
      selection: new Set(['gpt-4.1-mini']),
      original: new Set(['gpt-4.1-mini']),
      query: 'mini',
    });

    const applied = applyModalDraft(state, state.selectedConnection);

    expect(applied).toBe(true);
    expect(state.modalModels[0].id).toBe('openai/conn-456:gpt-4.1-mini');
    expect(Array.from(state.modalModelsSelection)).toEqual(['openai/conn-456:gpt-4.1-mini']);
    expect(Array.from(state.modalModelsOriginal)).toEqual(['openai/conn-456:gpt-4.1-mini']);

    persistModalDraft(state, state.selectedConnection);
    expect(Array.from(state.modalDrafts.get('conn-456').models.map((model) => model.id))).toEqual([
      'openai/conn-456:gpt-4.1-mini',
    ]);
  });
});
