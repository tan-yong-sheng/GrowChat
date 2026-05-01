const MODAL_SAVE_ENABLED_CLASS =
  'px-4 py-2 rounded-xl text-sm font-semibold transition bg-black text-white hover:bg-gray-900';
const MODAL_SAVE_DISABLED_CLASS =
  'px-4 py-2 rounded-xl text-sm font-semibold transition bg-gray-200 text-gray-700 cursor-not-allowed';

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
  const active = Boolean(enabled) && !saving;
  button.disabled = !active;
  button.textContent = saving ? 'Saving...' : label;
  button.className = active ? enabledClass : disabledClass;
}
