const DEFAULT_MAX_HEIGHT = 240;

function focusWithoutScroll(textarea) {
  try {
    textarea.focus({ preventScroll: true });
    return;
  } catch {
    // Older browsers may not support focus options.
  }

  textarea.focus();
}

export function setupEditTextarea(textarea, { maxHeight = DEFAULT_MAX_HEIGHT } = {}) {
  if (!textarea) return;

  const scrollHeight = Number(textarea.scrollHeight || 0);
  const nextHeight = Math.min(scrollHeight, maxHeight);

  textarea.style.height = 'auto';
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = 'auto';
  textarea.style.maxHeight = `${maxHeight}px`;

  focusWithoutScroll(textarea);

  if (typeof textarea.setSelectionRange === 'function') {
    const end = String(textarea.value ?? '').length;
    try {
      textarea.setSelectionRange(end, end);
    } catch {
      // Ignore selection issues in non-standard environments.
    }
  }
}
