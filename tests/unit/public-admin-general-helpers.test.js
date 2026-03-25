import { describe, expect, it } from 'vitest';
import {
  createGeneralSettingsState,
  getGeneralSettingsToggleState,
  isGeneralSettingsDirty,
} from '../../public/js/features/admin/settings/general-helpers.js';

describe('admin general helpers', () => {
  it('creates the default settings state', () => {
    const state = createGeneralSettingsState();
    expect(state.initialValues.title).toBe('GrowChat');
    expect(state.currentValues.publicRegistration).toBe(true);
    expect(state.currentValues.registrationStatus).toBe('pending');
    expect(state.dirtyFields.defaultModelId).toBe(false);
  });

  it('detects dirty settings and derives toggle state', () => {
    const state = createGeneralSettingsState();
    expect(isGeneralSettingsDirty(state)).toBe(false);
    state.currentValues.defaultModelId = 'gpt-5-mini';
    expect(isGeneralSettingsDirty(state)).toBe(true);
    state.currentValues.registrationStatus = 'active';
    expect(isGeneralSettingsDirty(state)).toBe(true);

    expect(getGeneralSettingsToggleState(true)).toMatchObject({
      isOn: true,
      ariaPressed: 'true',
      statusText: 'On',
    });
    expect(getGeneralSettingsToggleState(false)).toMatchObject({
      isOn: false,
      ariaPressed: 'false',
      statusText: 'Off',
    });
  });
});


