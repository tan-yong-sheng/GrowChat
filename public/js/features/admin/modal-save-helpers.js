const MODAL_SAVE_ENABLED_CLASS =
  'px-4 py-2 rounded-xl text-sm font-semibold transition bg-black text-white hover:bg-gray-900';
const MODAL_SAVE_DISABLED_CLASS =
  'px-4 py-2 rounded-xl text-sm font-semibold transition bg-gray-200 text-gray-700 cursor-not-allowed';

function isButtonActive(enabled, saving) {
  return Boolean(enabled) && !saving;
}

function getButtonLabel(saving, label) {
  return saving ? 'Saving...' : label;
}

function getButtonClass(active, enabledClass, disabledClass) {
  return active ? enabledClass : disabledClass;
}

export function setModalSaveButtonState(
  button,
  {
    enabled = false,
    saving = false,
    label = 'Save',
    enabledClass = MODAL_SAVE_ENABLED_CLASS,
    disabledClass = MODAL_SAVE_DISABLED_CLASS,
  } = {}
) {
  if (!button) return;
  const active = isButtonActive(enabled, saving);
  button.disabled = !active;
  button.textContent = getButtonLabel(saving, label);
  button.className = getButtonClass(active, enabledClass, disabledClass);
}
