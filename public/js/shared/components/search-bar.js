function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderSearchBarHtml({
  inputId,
  value = '',
  placeholder = 'Search',
  clearId,
  clearButtonId,
  clearHidden = true,
  wrapperClass = 'flex items-center gap-1.5 bg-gray-50/50 px-3 py-1.5 rounded-xl border border-gray-100/30 w-full sm:w-80 lg:w-64 min-w-0 focus-within:ring-1 focus-within:ring-gray-200',
  inputClass = 'w-full min-w-0 text-sm outline-none bg-transparent text-gray-700 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
} = {}) {
  return `
    <div class="${wrapperClass}">
      <div class="flex-shrink-0 text-gray-500">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
          <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
        </svg>
      </div>
      <input
        type="text"
        class="${inputClass}"
        placeholder="${escapeHtml(placeholder)}"
        id="${escapeHtml(inputId)}"
        value="${escapeHtml(value)}"
      >
      <div id="${escapeHtml(clearId)}" class="${clearHidden ? 'hidden' : ''} ml-1.5">
        <button type="button" id="${escapeHtml(clearButtonId || `${clearId}-btn`)}" class="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white" aria-label="Clear search">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="size-3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  `;
}

export function captureSearchInputState(input) {
  if (!input) return null;
  return {
    value: input.value,
    selectionStart: typeof input.selectionStart === 'number' ? input.selectionStart : null,
    selectionEnd: typeof input.selectionEnd === 'number' ? input.selectionEnd : null,
    isFocused: document.activeElement === input,
  };
}

export function restoreSearchInputState(container, inputId, snapshot) {
  if (!snapshot?.isFocused || !container || !inputId) return;
  const focusInput = () => {
    const input = container.querySelector(`#${inputId}`);
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
    const len = input.value.length;
    const start = snapshot.selectionStart === null ? len : Math.min(snapshot.selectionStart, len);
    const end = snapshot.selectionEnd === null ? len : Math.min(snapshot.selectionEnd, len);
    try {
      input.setSelectionRange(start, end);
    } catch {
      // Ignore selection restore errors for browsers that do not support it.
    }
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(focusInput));
    return;
  }
  setTimeout(focusInput, 0);
}

function escapeSelectorValue(value) {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw);
  }
  return raw.replace(/["\\]/g, '\\$&');
}

export function captureRenderState(
  container,
  { inputId = '', scrollSelector = '[data-models-scroll]' } = {}
) {
  if (!container) return null;
  const scrollEl = scrollSelector ? container.querySelector(scrollSelector) : null;
  const input = inputId ? container.querySelector(`#${escapeSelectorValue(inputId)}`) : null;
  const isFocused = Boolean(input && document.activeElement === input);
  return {
    scrollTop: scrollEl?.scrollTop ?? null,
    scrollLeft: scrollEl?.scrollLeft ?? null,
    inputId: isFocused ? inputId : '',
    inputValue: isFocused ? input.value : '',
    selectionStart:
      isFocused && typeof input.selectionStart === 'number' ? input.selectionStart : null,
    selectionEnd: isFocused && typeof input.selectionEnd === 'number' ? input.selectionEnd : null,
    isFocused,
  };
}

export function restoreRenderState(
  container,
  snapshot,
  { inputId = '', scrollSelector = '[data-models-scroll]' } = {}
) {
  if (!container || !snapshot) return;

  const restoreScroll = () => {
    if (!scrollSelector) return;
    const scrollEl = container.querySelector(scrollSelector);
    if (!scrollEl) return;
    if (Number.isFinite(snapshot.scrollTop)) scrollEl.scrollTop = snapshot.scrollTop;
    if (Number.isFinite(snapshot.scrollLeft)) scrollEl.scrollLeft = snapshot.scrollLeft;
  };

  restoreScroll();

  const restoreInput = () => {
    if (!snapshot.isFocused) return;
    const targetId = inputId || snapshot.inputId;
    if (!targetId) return;
    const input = container.querySelector(`#${escapeSelectorValue(targetId)}`);
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
    const len = input.value.length;
    const start = snapshot.selectionStart === null ? len : Math.min(snapshot.selectionStart, len);
    const end = snapshot.selectionEnd === null ? len : Math.min(snapshot.selectionEnd, len);
    try {
      input.setSelectionRange(start, end);
    } catch {
      // Ignore selection restore errors for browsers that do not support it.
    }
  };

  const run = () => {
    restoreInput();
    restoreScroll();
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
    return;
  }
  setTimeout(run, 0);
}
