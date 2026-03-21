export function createGeneralSettingsState() {
  return {
    loading: false,
    error: null,
    initialValues: {
      title: 'GrowChat',
      publicRegistration: true,
      defaultModelId: '',
    },
    currentValues: {
      title: 'GrowChat',
      publicRegistration: true,
      defaultModelId: '',
    },
    models: [],
    adminConfigLoaded: false,
    modelsInvalidateToken: null,
    dirtyFields: {
      title: false,
      publicRegistration: false,
      defaultModelId: false,
    },
  };
}

export function isGeneralSettingsDirty(state = {}) {
  return JSON.stringify(state.initialValues || {}) !== JSON.stringify(state.currentValues || {});
}

export function getGeneralSettingsToggleState(publicRegistration) {
  const isOn = Boolean(publicRegistration);
  return {
    isOn,
    ariaPressed: String(isOn),
    statusText: isOn ? 'On' : 'Off',
    toggleClass: isOn ? 'bg-black' : 'bg-gray-200',
    knobTransform: isOn ? 'translateX(16px)' : 'translateX(0px)',
  };
}
