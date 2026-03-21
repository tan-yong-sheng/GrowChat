// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  applyModalDraft,
  applyModalModelPreview,
  buildModalConnectionDraft,
  connectionApiTypeDetails,
  formatConnectionModelId,
  getConnectionProviderId,
  normalizeConnectionManualModels,
  normalizeConnectionRecord,
  normalizeProviderFamily,
  providerDisplayLabel,
  providerUrlPlaceholder,
  resolveModalUrl,
  resolveUrlLabel,
  persistModalDraft,
} from '../../public/js/features/admin/settings/connections-helpers.js';

describe('admin connection helpers', () => {
  it('normalizes provider labels and types', () => {
    expect(normalizeProviderFamily('claude-compatible')).toBe('anthropic');
    expect(providerDisplayLabel('gemini-compatible')).toBe('Gemini Compatible');
    expect(providerUrlPlaceholder('openai')).toBe('https://api.openai.com/v1');
    expect(resolveUrlLabel('oc')).toBe('URL *');
    expect(resolveModalUrl('openai-compatible', '')).toBe('');
    expect(connectionApiTypeDetails('google').value).toBe('stream-generate-content');
  });

  it('normalizes records and manual model lists', () => {
    expect(normalizeConnectionManualModels([
      { modelId: 'models/a', name: 'Alpha' },
      { id: 'a', name: 'Duplicate' },
      'models/b',
      '',
    ])).toEqual([
      { modelId: 'a', name: 'Alpha' },
      { modelId: 'b', name: 'b' },
    ]);

    expect(normalizeConnectionRecord({
      providerType: 'claude-compatible',
      manualModels: [{ name: 'x' }],
    })).toMatchObject({
      providerType: 'claude-compatible',
      providerFamily: 'anthropic',
      apiType: 'messages',
      manualModels: [{ modelId: 'x', name: 'x' }],
    });
  });

  it('creates stable connection model ids', () => {
    expect(getConnectionProviderId({ id: 'conn-1', providerType: 'openai-compatible' })).toBe('oc/conn-1');
    expect(formatConnectionModelId('oc/conn-1', 'gpt-4')).toBe('oc/conn-1:gpt-4');
  });

  it('persists and restores modal drafts', () => {
    const state = {
      modalModels: [{ id: 'a', name: 'Alpha' }],
      modalModelsSelection: new Set(['a']),
      modalModelsOriginal: new Set(['a']),
      modalModelsQuery: 'alp',
      modalDrafts: new Map(),
      selectedConnection: { id: 'conn-1' },
    };

    persistModalDraft(state);
    state.modalModels = [];
    state.modalModelsSelection = new Set();
    state.modalModelsOriginal = new Set();
    state.modalModelsQuery = '';

    expect(applyModalDraft(state, { id: 'conn-1' })).toBe(true);
    expect(state.modalModels).toEqual([{ id: 'a', name: 'Alpha' }]);
    expect(Array.from(state.modalModelsSelection)).toEqual(['a']);
    expect(state.modalModelsQuery).toBe('alp');
  });

  it('builds a modal draft from DOM inputs', () => {
    document.body.innerHTML = `
      <input id="modal-conn-name" value="OpenAI">
      <input id="modal-conn-url" value="https://api.openai.com/v1">
      <input id="modal-conn-key" value="secret">
      <textarea id="modal-conn-headers">{"x":"1"}</textarea>
      <select id="modal-conn-provider"><option value="openai">OpenAI</option></select>
    `;

    expect(buildModalConnectionDraft(document, { id: 'conn-1' })).toEqual({
      id: 'conn-1',
      name: 'OpenAI',
      url: 'https://api.openai.com/v1',
      key: 'secret',
      headers: '{"x":"1"}',
      providerType: 'openai',
      providerFamily: 'openai',
    });
  });

  it('previews models without losing prior selection intent', () => {
    const state = {
      modalModels: [{ id: 'old', name: 'Old' }],
      modalModelsSelection: new Set(['old']),
      selectedConnection: { id: 'conn-1' },
    };
    const renderModels = vi.fn();

    applyModalModelPreview(state, [
      { id: 'new', name: 'New' },
      { id: 'old', name: 'Old' },
    ], document, renderModels);

    expect(renderModels).toHaveBeenCalledTimes(1);
    expect(state.modalModels.map((model) => model.id)).toEqual(['new', 'old']);
    expect(Array.from(state.modalModelsSelection)).toEqual(['new', 'old']);
    expect(Array.from(state.modalModelsOriginal)).toEqual(['new', 'old']);
  });
});


