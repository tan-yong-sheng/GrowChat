export function updateToolToggle(btn, enabled, serverEnabled) {
  if (!btn) return;
  btn.disabled = !serverEnabled;
  btn.classList.toggle('bg-primary', enabled);
  btn.classList.toggle('bg-gray-200', !enabled);
  btn.classList.toggle('opacity-40', !serverEnabled);
  btn.classList.toggle('cursor-not-allowed', !serverEnabled);
  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  btn.setAttribute('aria-disabled', serverEnabled ? 'false' : 'true');
  btn.title = serverEnabled
    ? enabled
      ? 'Disable tool'
      : 'Enable tool'
    : 'Enable the server to edit tools';
  const knob = btn.querySelector('span');
  if (knob) {
    knob.classList.toggle('translate-x-4', enabled);
    knob.classList.toggle('translate-x-0', !enabled);
  }
}
