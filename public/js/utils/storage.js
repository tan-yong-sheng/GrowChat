function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

export function readStoredJson(storage, key, fallback = null) {
  const target = resolveStorage(storage);
  if (!target) return fallback;

  try {
    const raw = target.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStoredJson(storage, key, value) {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readStoredString(storage, key, fallback = '') {
  const target = resolveStorage(storage);
  if (!target) return fallback;

  try {
    const value = target.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeStoredString(storage, key, value) {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(key, String(value ?? ''));
    return true;
  } catch {
    return false;
  }
}

export function removeStoredValue(storage, key) {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
