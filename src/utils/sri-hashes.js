const SRI_RESOURCES = {
  'bootstrap-icons': {
    url: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  },
  'katex-css': {
    url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
  },
  'marked': {
    url: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  },
  'mermaid': {
    url: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
  },
  'graphviz': {
    url: 'https://unpkg.com/@hpcc-js/wasm/dist/graphviz.umd.js',
  },
};

const sriCache = new Map();
const SRI_CACHE_KEY = 'sri-hashes:v2';
const SRI_CACHE_TTL_SECONDS = 86400;
const SRI_FETCH_TIMEOUT_MS = 5000;
const SRI_INJECT_PATTERNS = new Map([
  ['bootstrap-icons', /data-sri-key="bootstrap-icons"/g],
  ['katex-css', /data-sri-key="katex-css"/g],
  ['marked', /data-sri-key="marked"/g],
  ['mermaid', /data-sri-key="mermaid"/g],
  ['graphviz', /data-sri-key="graphviz"/g],
]);
const sriHashesState = { value: null, expiresAt: 0 };
let sriHashesPromise = null;

async function computeSriHash(buffer) {
  const digest = await crypto.subtle.digest('SHA-384', buffer);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `sha384-${btoa(binary)}`;
}

async function fetchSriHash(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SRI_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return computeSriHash(await response.arrayBuffer());
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readPersistedSriHashes(env) {
  if (!env?.CACHE) return null;
  try {
    const cached = await env.CACHE.get(SRI_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.warn('Failed to read cached SRI hashes:', err?.message || err);
    return null;
  }
}

async function loadSriHashes(env) {
  if (sriHashesState.value && Date.now() < sriHashesState.expiresAt) return sriHashesState.value;
  if (sriHashesPromise) return sriHashesPromise;

  sriHashesPromise = (async () => {
    const persistedHashes = await readPersistedSriHashes(env);
    const hashes = {};

    const entries = await Promise.all(Object.entries(SRI_RESOURCES).map(async ([key, resource]) => {
      const cached = sriCache.get(key);
      if (cached?.url === resource.url && cached.hash) {
        return [key, cached.hash];
      }

      if (persistedHashes?.[key]) {
        sriCache.set(key, { url: resource.url, hash: persistedHashes[key] });
        return [key, persistedHashes[key]];
      }

      try {
        const hash = await fetchSriHash(resource.url);
        sriCache.set(key, { url: resource.url, hash });
        return [key, hash];
      } catch (err) {
        console.warn(`Failed to fetch SRI hash for ${key}:`, err?.message || err);
        return [key, persistedHashes?.[key] || null];
      }
    }));

    for (const [key, hash] of entries) {
      hashes[key] = hash;
    }

    if (env?.CACHE) {
      try {
        await env.CACHE.put(SRI_CACHE_KEY, JSON.stringify(hashes), {
          expirationTtl: SRI_CACHE_TTL_SECONDS,
        });
      } catch (err) {
        console.warn('Failed to cache SRI hashes:', err?.message || err);
      }
    }

    sriHashesState.value = hashes;
    sriHashesState.expiresAt = Date.now() + SRI_CACHE_TTL_SECONDS * 1000;
    return hashes;
  })().finally(() => {
    sriHashesPromise = null;
  });

  return sriHashesPromise;
}

function injectSriHashes(html, hashes) {
  let modified = html;

  for (const [key, hashValue] of Object.entries(hashes)) {
    if (!hashValue) {
      console.warn(`SRI hash missing for ${key} — resource will load without integrity check`);
      continue;
    }
    const pattern = SRI_INJECT_PATTERNS.get(key);
    if (!pattern) continue;
    modified = modified.replace(pattern, `integrity="${hashValue}" crossorigin="anonymous"`);
  }

  return modified;
}

async function getSriHashes(env) {
  return loadSriHashes(env);
}

export { getSriHashes, injectSriHashes };
