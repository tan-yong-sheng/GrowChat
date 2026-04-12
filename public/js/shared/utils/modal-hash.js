function normalizeModalHash(value) {
  return String(value || '')
    .trim()
    .replace(/^#+/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function replaceHash(nextHash) {
  const nextUrl = nextHash
    ? `${window.location.pathname}${window.location.search}#${nextHash}`
    : `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, '', nextUrl);
}

export function setModalHash(modalName) {
  const hash = normalizeModalHash(modalName);
  if (!hash) return '';
  if (window.location.hash === `#${hash}`) return hash;
  replaceHash(hash);
  return hash;
}

export function clearModalHash(modalName = '') {
  const currentHash = normalizeModalHash(window.location.hash);
  if (!currentHash) return false;
  const expectedHash = normalizeModalHash(modalName);
  if (expectedHash && currentHash !== expectedHash) return false;
  replaceHash('');
  return true;
}

export function getModalHash() {
  return normalizeModalHash(window.location.hash);
}
