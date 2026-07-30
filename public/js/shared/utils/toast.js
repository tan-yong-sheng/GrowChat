/**
 * Lightweight toast helpers without the markdown-renderer / DOMPurify
 * dependency chain, so DOM-only call sites (e.g. user profile footer)
 * don't pull in CDN ESM imports during unit tests.
 */

const TOAST_FADE_MS = 300;
const TOAST_BASE_CLASSES =
  'fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-full shadow-sm z-[99999] transition-opacity duration-300 opacity-0';

export function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = TOAST_BASE_CLASSES;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('opacity-0'));
  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  }, duration);
  return toast;
}

export function showToastProgress(initialMessage) {
  const toast = document.createElement('div');
  toast.className = TOAST_BASE_CLASSES;
  toast.textContent = initialMessage;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('opacity-0'));

  let closeTimeout = null;
  let removed = false;

  const close = () => {
    if (removed) return;
    removed = true;
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  };

  const update = (message, duration = 3000) => {
    if (removed) return;
    toast.textContent = message;
    if (closeTimeout) clearTimeout(closeTimeout);
    if (duration > 0) {
      closeTimeout = setTimeout(close, duration);
    }
  };

  return { update, close, element: toast };
}
