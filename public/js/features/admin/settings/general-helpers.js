export function createGeneralSettingsState() {
  return {
    initialValues: {
      title: 'GrowChat',
      publicRegistration: true,
      registrationStatus: 'pending',
      defaultModelId: '',
    },
    currentValues: {
      title: 'GrowChat',
      publicRegistration: true,
      registrationStatus: 'pending',
      defaultModelId: '',
    },
    models: [],
    adminConfigLoaded: false,
    modelsInvalidateToken: null,
  };
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
