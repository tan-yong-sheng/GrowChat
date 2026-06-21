/**
 * Vitest setup file: polyfill localStorage for JSDOM environment.
 *
 * JSDOM does not provide localStorage by default unless created with
 * pretendToBeVisual: true and a storage quota. This setup bridges the gap
 * so all @vitest-environment jsdom tests can call localStorage.clear()
 * without crashing.
 *
 * Safe to use in both JSDOM and node environments — no-op if localStorage
 * is already available.
 */
const storage = new Map();

const mockLocalStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(String(key), String(value));
  },
  removeItem(key) {
    storage.delete(String(key));
  },
  clear() {
    storage.clear();
  },
  get length() {
    return storage.size;
  },
  key(index) {
    return Array.from(storage.keys())[index] ?? null;
  },
};

// Apply to both window and globalThis for maximum compatibility
// In JSDOM, window === globalThis; in node, both get the polyfill
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
}