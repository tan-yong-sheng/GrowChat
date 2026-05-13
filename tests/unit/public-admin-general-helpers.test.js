import { describe, expect, it } from 'vitest';
import {
  createGeneralSettingsState,
  getGeneralSettingsToggleState,
} from '../../public/js/features/admin/settings/general-helpers.js';

describe('admin general helpers', () => {
  it('creates the default settings state', () => {
    const state = createGeneralSettingsState();
    expect(state.initialValues.title).toBe('GrowChat');
    expect(state.currentValues.publicRegistration).toBe(true);
    expect(state.currentValues.registrationStatus).toBe('pending');
    expect(state.currentValues.defaultModelId).toBe('');
  });

  it('derives toggle state from public registration value', () => {
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



