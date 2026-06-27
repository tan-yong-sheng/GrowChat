// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
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
} from '../../public/js/features/admin/settings/connections-helpers.js';
import {
  applyModalModelPreview,
  buildSelectedConnectionModels,
  previewConnectionModalModels,
} from '../../public/js/features/admin/settings/connections-helpers-modal-models.js';

describe('admin connection helpers', () => {
  it('normalizes provider labels and types', () => {
    expect(normalizeProviderFamily('claude-compatible')).toBe('anthropic');
    expect(providerDisplayLabel('gemini-compatible')).toBe('Gemini Compatible');
    expect(providerUrlPlaceholder('openai')).toBe('https://api.openai.com/v1');
    expect(resolveUrlLabel('openai-compatible')).toBe('URL *');
    expect(resolveModalUrl('openai-compatible', '')).toBe('');
    expect(connectionApiTypeDetails('google').value).toBe('stream-generate-content');
  });

  it('normalizes records and manual model lists', () => {
    expect(
      normalizeConnectionManualModels([
        { modelId: 'models/a', name: 'Alpha' },
        { id: 'a', name: 'Duplicate' },
        'models/b',
        '',
      ])
    ).toEqual([
      { modelId: 'a', name: 'Alpha' },
      { modelId: 'b', name: 'b' },
    ]);

    expect(
      normalizeConnectionRecord({
        providerType: 'claude-compatible',
        manualModels: [{ name: 'x' }],
      })
    ).toMatchObject({
      providerType: 'claude-compatible',
      providerFamily: 'anthropic',
      apiType: 'messages',
      manualModels: [{ modelId: 'x', name: 'x' }],
    });
  });

  it('preserves the absence of manualModelsMode so loadModalModels can infer the mode', () => {
    // PR #173 review thread (github-actions 09:19:15Z): the inferred
    // manual-model selection mode can be lost because
    // normalizeConnectionRecord() defaulted manualModelsMode to 'all' even
    // when the API payload omitted it. For connections that actually have
    // seeded manual models but no persisted mode, the modal reopened as
    // 'all' and could overwrite the intended partial-selection state on save.
    // The fix lets the field stay undefined when the payload omits it so
    // downstream consumers can infer correctly (e.g. 'some' when seeded
    // models exist, 'all' otherwise).
    const withField = normalizeConnectionRecord({ manualModelsMode: 'some' });
    expect(withField.manualModelsMode).toBe('some');

    const withoutField = normalizeConnectionRecord({ manualModels: [{ modelId: 'a' }] });
    expect(withoutField.manualModelsMode).toBeUndefined();

    const withSnakeCaseField = normalizeConnectionRecord({ manual_models_mode: 'some' });
    expect(withSnakeCaseField.manualModelsMode).toBe('some');
  });

  it('creates stable connection model ids', () => {
    expect(getConnectionProviderId({ id: 'conn-1', providerType: 'openai-compatible' })).toBe(
      'openai/conn-1'
    );
    expect(formatConnectionModelId('openai/conn-1', 'gpt-4')).toBe('openai/conn-1:gpt-4');
  });

  it('previews models without losing prior selection intent', () => {
    const state = {
      modalModels: [{ id: 'old', name: 'Old' }],
      modalModelsSelection: new Set(['old']),
      selectedConnection: { id: 'conn-1' },
    };
    const renderModels = vi.fn();

    applyModalModelPreview(
      state,
      [
        { id: 'new', name: 'New' },
        { id: 'old', name: 'Old' },
      ],
      document,
      renderModels
    );

    expect(renderModels).toHaveBeenCalledTimes(1);
    expect(state.modalModels.map((model) => model.id)).toEqual([
      'openai/conn-1:new',
      'openai/conn-1:old',
    ]);
    expect(Array.from(state.modalModelsSelection)).toEqual(['openai/conn-1:old']);
    expect(Array.from(state.modalModelsOriginal)).toEqual(['openai/conn-1:old']);
  });

  it('preserves a subset selection when previewing newly discovered models', () => {
    const preview = previewConnectionModalModels(
      [
        { id: 'old-a', name: 'Old A' },
        { id: 'old-b', name: 'Old B' },
      ],
      new Set(['old-a']),
      [
        { id: 'old-a', name: 'Old A' },
        { id: 'old-b', name: 'Old B' },
        { id: 'new-c', name: 'New C' },
      ],
      { id: 'conn-1' }
    );

    expect(preview.models.map((model) => model.id)).toEqual([
      'openai/conn-1:new-c',
      'openai/conn-1:old-a',
      'openai/conn-1:old-b',
    ]);
    expect(Array.from(preview.selection)).toEqual(['openai/conn-1:old-a']);
    expect(Array.from(preview.original)).toEqual(['openai/conn-1:old-a']);
  });

  it('preserves an explicit all-off selection mode on preview', () => {
    const preview = previewConnectionModalModels(
      [],
      new Set(),
      [
        { id: 'old-a', name: 'Old A' },
        { id: 'old-b', name: 'Old B' },
      ],
      { id: 'conn-1', manual_models_mode: 'none' }
    );

    expect(preview.models.map((model) => model.id)).toEqual([
      'openai/conn-1:old-a',
      'openai/conn-1:old-b',
    ]);
    expect(Array.from(preview.selection)).toEqual([]);
    expect(Array.from(preview.original)).toEqual([]);
  });

  it('preserves an explicit all-on selection mode on preview', () => {
    const preview = previewConnectionModalModels(
      [],
      new Set(),
      [
        { id: 'old-a', name: 'Old A' },
        { id: 'old-b', name: 'Old B' },
      ],
      { id: 'conn-1', manual_models_mode: 'all' }
    );

    expect(Array.from(preview.selection)).toEqual(['openai/conn-1:old-a', 'openai/conn-1:old-b']);
  });

  it('defaults a fresh preview to all enabled when there is no saved selection context', () => {
    const preview = previewConnectionModalModels(
      [],
      new Set(),
      [
        { id: 'old-a', name: 'Old A' },
        { id: 'new-c', name: 'New C' },
      ],
      { id: 'conn-1' }
    );

    expect(Array.from(preview.selection)).toEqual(['openai/conn-1:new-c', 'openai/conn-1:old-a']);
  });

  it('builds selected manual models from mixed discovered and manual rows', () => {
    const models = [
      { id: 'openai/conn-1:alpha', name: 'Alpha' },
      { id: 'openai/conn-1:beta', name: 'Beta', manual: true, manualModelId: 'beta' },
      { id: 'openai/conn-1:gamma', name: 'Gamma' },
    ];

    const selected = new Set(['openai/conn-1:alpha', 'openai/conn-1:beta']);

    expect(
      buildSelectedConnectionModels(models, selected, {
        id: 'conn-1',
        providerType: 'openai-compatible',
      })
    ).toEqual([
      { modelId: 'alpha', name: 'Alpha' },
      { modelId: 'beta', name: 'Beta' },
    ]);
  });
});
