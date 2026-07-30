export function clonePreferences(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(source);
    } catch {
      return { ...source };
    }
  }
  try {
    return JSON.parse(JSON.stringify(source));
  } catch {
    return { ...source };
  }
}
